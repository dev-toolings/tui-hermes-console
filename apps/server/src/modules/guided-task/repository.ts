import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, max, or } from "drizzle-orm";
import { z } from "zod";
import {
  guidedTechnicalApprovalRequired,
  type GuidedDecisionKind,
  type GuidedTaskDraft,
} from "@console/core/modules/guided-task/spec";
import type {
  GuidedDecision,
  GuidedInboxPage,
  GuidedTaskDto,
} from "@console/core/modules/guided-task/task";
import { getDatabase } from "@/db/client";
import {
  guidedTaskAttempts,
  guidedTaskDecisions,
  guidedTaskEvidence,
  guidedTaskRevisions,
  guidedTasks,
  projects,
  type SiteMembershipRole,
} from "@/db/schema";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import type { SiteRequestContext } from "@/modules/auth/service";

const intentSchema = z.enum([
  "bug",
  "feature",
  "behavior",
  "automation",
  "understand",
  "quality",
]);

const persistedGuidedDraftSchema = z.object({
  intent: intentSchema.nullable(),
  objective: z.string().trim().max(20_000),
  audience: z.string().trim().max(5_000),
  expectedResult: z.string().trim().max(20_000),
  exclusions: z.string().trim().max(20_000),
  example: z.string().trim().max(20_000),
  touchesAuthentication: z.boolean(),
  deletesData: z.boolean(),
  allowsDependencies: z.boolean(),
  changesDatabase: z.boolean(),
  touchesPayments: z.boolean(),
  touchesInfrastructure: z.boolean(),
}).strict();

export const guidedDraftSchema = persistedGuidedDraftSchema.extend({
  intent: intentSchema,
  objective: z.string().trim().min(12).max(20_000),
  expectedResult: z.string().trim().min(8).max(20_000),
  exclusions: z.string().trim().min(3).max(20_000),
});

const createTaskSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
  draft: persistedGuidedDraftSchema,
}).strict();

const createRevisionSchema = z.object({
  draft: persistedGuidedDraftSchema,
  validate: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

const decisionSchema = z.object({
  revisionId: z.string().trim().min(1).max(200),
  attemptId: z.string().trim().min(1).max(200).nullable().optional(),
  kind: z.enum(["technical", "tool", "functional"]),
  outcome: z.enum(["approved", "rejected"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().max(4_000).nullable().optional(),
}).strict();

export class GuidedTaskRepositoryError extends Error {
  constructor(
    readonly code:
      | "GUIDED_TASK_NOT_FOUND"
      | "GUIDED_PROJECT_NOT_FOUND"
      | "GUIDED_REVISION_NOT_FOUND"
      | "GUIDED_ATTEMPT_NOT_FOUND"
      | "GUIDED_DECISION_FORBIDDEN"
      | "GUIDED_DECISION_CONFLICT"
      | "GUIDED_REVISION_STALE"
      | "GUIDED_INBOX_CURSOR_INVALID",
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "GuidedTaskRepositoryError";
  }
}

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function revisionHash(draft: GuidedTaskDraft) {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}

function titleFromDraft(draft: GuidedTaskDraft) {
  const title = draft.objective.replace(/\s+/g, " ").trim();
  return title.length > 120 ? `${title.slice(0, 117)}…` : title;
}

function mandateProjectPredicate(context: SiteRequestContext, projectId: string) {
  return !context.mandateProjectId || context.mandateProjectId === projectId;
}

function ownerPredicate(context: SiteRequestContext, ownerUserId: string) {
  return context.role !== "requester" || ownerUserId === context.userId;
}

async function requireProject(tx: Transaction, context: SiteRequestContext, projectId: string) {
  if (!mandateProjectPredicate(context, projectId)) throw projectNotFound();
  const [project] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.siteId, context.siteId), eq(projects.id, projectId)));
  if (!project) throw projectNotFound();
  return project;
}

function projectNotFound() {
  return new GuidedTaskRepositoryError(
    "GUIDED_PROJECT_NOT_FOUND",
    "Projet introuvable dans ce périmètre.",
    404,
  );
}

async function requireTask(
  tx: Transaction,
  context: SiteRequestContext,
  taskId: string,
  lock = false,
) {
  const query = tx
    .select()
    .from(guidedTasks)
    .where(and(eq(guidedTasks.siteId, context.siteId), eq(guidedTasks.id, taskId)));
  const rows = lock ? await query.for("update") : await query;
  const task = rows[0];
  if (
    !task ||
    !mandateProjectPredicate(context, task.projectId) ||
    !ownerPredicate(context, task.ownerUserId)
  ) {
    throw new GuidedTaskRepositoryError(
      "GUIDED_TASK_NOT_FOUND",
      "Tâche introuvable.",
      404,
    );
  }
  return task;
}

export async function createGuidedTask(
  context: SiteRequestContext,
  rawInput: unknown,
): Promise<GuidedTaskDto> {
  await assertSiteAction(context, "guided.task.create");
  const input = createTaskSchema.parse(rawInput);
  const [existing] = await getDatabase().select({ id: guidedTasks.id, projectId: guidedTasks.projectId })
    .from(guidedTasks)
    .where(and(
      eq(guidedTasks.siteId, context.siteId),
      eq(guidedTasks.idempotencyKey, input.idempotencyKey),
    ));
  if (existing) {
    if (existing.projectId !== input.projectId) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_DECISION_CONFLICT",
        "Cette clé d’idempotence décrit déjà une autre tâche.",
      );
    }
    return getGuidedTask(context, existing.id);
  }
  const now = new Date();
  const taskId = `task_${randomUUID()}`;
  const revisionId = `taskrev_${randomUUID()}`;
  const db = getDatabase();

  await db.transaction(async (tx) => {
    await requireProject(tx, context, input.projectId);
    await tx.insert(guidedTasks).values({
      id: taskId,
      siteId: context.siteId,
      projectId: input.projectId,
      ownerUserId: context.userId,
      authorUserId: context.userId,
      idempotencyKey: input.idempotencyKey,
      title: titleFromDraft(input.draft),
      status: "draft",
      currentRevisionId: null,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(guidedTaskRevisions).values({
      id: revisionId,
      siteId: context.siteId,
      projectId: input.projectId,
      taskId,
      number: 1,
      authorUserId: context.userId,
      idempotencyKey: input.idempotencyKey,
      content: input.draft,
      contentSha256: revisionHash(input.draft),
      state: "draft",
      requiresTechnicalApproval: guidedTechnicalApprovalRequired(input.draft),
      createdAt: now,
    });
    await tx.update(guidedTasks).set({ currentRevisionId: revisionId }).where(eq(guidedTasks.id, taskId));
  });
  return getGuidedTask(context, taskId);
}

export async function createGuidedTaskRevision(
  context: SiteRequestContext,
  taskId: string,
  rawInput: unknown,
): Promise<GuidedTaskDto> {
  await assertSiteAction(context, "guided.task.update");
  const input = createRevisionSchema.parse(rawInput);
  const parsedDraft = input.validate ? guidedDraftSchema.parse(input.draft) : input.draft;
  if (input.validate) await assertSiteAction(context, "guided.task.decide");
  const [existingRevision] = await getDatabase().select({
    id: guidedTaskRevisions.id,
    taskId: guidedTaskRevisions.taskId,
  }).from(guidedTaskRevisions).where(and(
    eq(guidedTaskRevisions.siteId, context.siteId),
    eq(guidedTaskRevisions.idempotencyKey, input.idempotencyKey),
  ));
  if (existingRevision) {
    if (existingRevision.taskId !== taskId) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_DECISION_CONFLICT",
        "Cette clé d’idempotence décrit déjà une autre révision.",
      );
    }
    return getGuidedTask(context, taskId);
  }
  const now = new Date();
  const db = getDatabase();

  await db.transaction(async (tx) => {
    const task = await requireTask(tx, context, taskId, true);
    const [counter] = await tx
      .select({ value: max(guidedTaskRevisions.number) })
      .from(guidedTaskRevisions)
      .where(and(eq(guidedTaskRevisions.siteId, context.siteId), eq(guidedTaskRevisions.taskId, taskId)));
    const number = (counter?.value ?? 0) + 1;
    const revisionId = `taskrev_${randomUUID()}`;
    const state = input.validate ? "validated" : "draft";
    await tx.insert(guidedTaskRevisions).values({
      id: revisionId,
      siteId: context.siteId,
      projectId: task.projectId,
      taskId,
      number,
      authorUserId: context.userId,
      idempotencyKey: input.idempotencyKey,
      content: parsedDraft,
      contentSha256: revisionHash(parsedDraft),
      state,
      requiresTechnicalApproval: guidedTechnicalApprovalRequired(parsedDraft),
      validatedAt: input.validate ? now : null,
      validatedByUserId: input.validate ? context.userId : null,
      createdAt: now,
    });
    if (input.validate) {
      await insertDecision(tx, context, {
        taskId,
        projectId: task.projectId,
        revisionId,
        attemptId: null,
        kind: "plan",
        outcome: "approved",
        idempotencyKey: input.idempotencyKey,
        reason: "Plan validé depuis la Console.",
        now,
      });
    }
    await tx
      .update(guidedTasks)
      .set({
        title: titleFromDraft(parsedDraft),
        status: input.validate ? "ready" : "draft",
        currentRevisionId: revisionId,
        updatedAt: now,
      })
      .where(and(eq(guidedTasks.siteId, context.siteId), eq(guidedTasks.id, taskId)));
  });
  return getGuidedTask(context, taskId);
}

function allowedDecisionRole(
  kind: Exclude<GuidedDecisionKind, "plan">,
  role: SiteMembershipRole,
) {
  if (kind === "technical" || kind === "tool") {
    return role === "admin" || role === "operator" || role === "approver";
  }
  return role === "admin" || role === "requester";
}

export async function decideGuidedTask(
  context: SiteRequestContext,
  taskId: string,
  rawInput: unknown,
): Promise<GuidedTaskDto> {
  await assertSiteAction(context, "guided.task.decide");
  const input = decisionSchema.parse(rawInput);
  if (!allowedDecisionRole(input.kind, context.role)) {
    throw new GuidedTaskRepositoryError(
      "GUIDED_DECISION_FORBIDDEN",
      "Ce rôle ne peut pas prendre cette décision.",
      403,
    );
  }
  const now = new Date();
  const db = getDatabase();
  await db.transaction(async (tx) => {
    const task = await requireTask(tx, context, taskId, true);
    if (task.currentRevisionId !== input.revisionId) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_REVISION_STALE",
        "La décision cible une ancienne révision.",
      );
    }
    const existing = await findDecisionByIdempotency(tx, context.siteId, input.idempotencyKey);
    if (existing) {
      if (
        existing.taskId !== taskId ||
        existing.revisionId !== input.revisionId ||
        existing.attemptId !== (input.attemptId ?? null) ||
        existing.kind !== input.kind ||
        existing.outcome !== input.outcome
      ) {
        throw new GuidedTaskRepositoryError(
          "GUIDED_DECISION_CONFLICT",
          "Cette clé d’idempotence décrit déjà une autre décision.",
        );
      }
      return;
    }
    const [revision] = await tx.select().from(guidedTaskRevisions).where(and(
      eq(guidedTaskRevisions.siteId, context.siteId),
      eq(guidedTaskRevisions.taskId, taskId),
      eq(guidedTaskRevisions.id, input.revisionId),
    ));
    if (!revision || revision.state !== "validated") {
      throw new GuidedTaskRepositoryError(
        "GUIDED_REVISION_NOT_FOUND",
        "Révision validée introuvable.",
        404,
      );
    }
    if (input.kind === "technical" && !revision.requiresTechnicalApproval) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_DECISION_CONFLICT",
        "Cette révision ne requiert pas de validation technique.",
      );
    }

    let attempt: typeof guidedTaskAttempts.$inferSelect | undefined;
    if (input.kind === "functional") {
      if (!input.attemptId) throw attemptNotFound();
      [attempt] = await tx.select().from(guidedTaskAttempts).where(and(
        eq(guidedTaskAttempts.siteId, context.siteId),
        eq(guidedTaskAttempts.taskId, taskId),
        eq(guidedTaskAttempts.id, input.attemptId),
        eq(guidedTaskAttempts.revisionId, input.revisionId),
      )).for("update");
      if (!attempt || attempt.status !== "awaiting_functional_validation") throw attemptNotFound();
      if (input.outcome === "approved" && (!attempt.evidenceComplete || attempt.testsPassed !== true)) {
        throw new GuidedTaskRepositoryError(
          "GUIDED_DECISION_CONFLICT",
          "Le résultat ne peut pas être accepté sans preuves complètes et tests positifs.",
        );
      }
    } else if (input.attemptId) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_DECISION_CONFLICT",
        "Cette décision porte sur la révision, pas sur une tentative.",
      );
    }

    await insertDecision(tx, context, {
      taskId,
      projectId: task.projectId,
      revisionId: input.revisionId,
      attemptId: input.attemptId ?? null,
      kind: input.kind,
      outcome: input.outcome,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason ?? null,
      now,
    });

    if (input.kind === "functional" && attempt) {
      await tx.update(guidedTaskAttempts).set({
        status: input.outcome === "approved" ? "completed" : "failed",
        endedAt: now,
      }).where(eq(guidedTaskAttempts.id, attempt.id));
      await tx.update(guidedTasks).set({
        status: input.outcome === "approved" ? "completed" : "ready",
        updatedAt: now,
      }).where(eq(guidedTasks.id, taskId));
    }
  });
  return getGuidedTask(context, taskId);
}

async function findDecisionByIdempotency(tx: Transaction, siteId: string, key: string) {
  const [decision] = await tx.select().from(guidedTaskDecisions).where(and(
    eq(guidedTaskDecisions.siteId, siteId),
    eq(guidedTaskDecisions.idempotencyKey, key),
  ));
  return decision;
}

async function insertDecision(
  tx: Transaction,
  context: SiteRequestContext,
  input: {
    taskId: string;
    projectId: string;
    revisionId: string;
    attemptId: string | null;
    kind: GuidedDecisionKind;
    outcome: "approved" | "rejected";
    idempotencyKey: string;
    reason: string | null;
    now: Date;
  },
) {
  const id = `taskdec_${randomUUID()}`;
  const [counter] = await tx.select({ value: max(guidedTaskDecisions.decisionNumber) })
    .from(guidedTaskDecisions)
    .where(and(
      eq(guidedTaskDecisions.siteId, context.siteId),
      eq(guidedTaskDecisions.taskId, input.taskId),
    ));
  await tx.insert(guidedTaskDecisions).values({
    id,
    siteId: context.siteId,
    projectId: input.projectId,
    taskId: input.taskId,
    revisionId: input.revisionId,
    attemptId: input.attemptId,
    decisionNumber: (counter?.value ?? 0) + 1,
    kind: input.kind,
    outcome: input.outcome,
    actorUserId: context.userId,
    actorRole: context.role,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    createdAt: input.now,
  });
  await appendAuditEntryInTransaction({
    eventId: randomUUID(),
    actorSiteId: context.siteId,
    targetSiteId: context.siteId,
    actorUserId: context.userId,
    actorRole: context.role,
    actorOrganizationId: context.actorOrganizationId,
    clientOrganizationId: context.clientOrganizationId,
    mandateId: context.mandateId,
    action: `guided.task.${input.kind}.decide`,
    resourceType: "guided_task",
    resourceId: input.taskId,
    decision: input.outcome === "approved" ? "allowed" : "denied",
    reasonCode: `GUIDED_${input.kind.toUpperCase()}_${input.outcome.toUpperCase()}`,
    beforeState: { revisionId: input.revisionId, attemptId: input.attemptId },
    afterState: {
      revisionId: input.revisionId,
      attemptId: input.attemptId,
      outcome: input.outcome,
      actorRole: context.role,
    },
    correlationId: context.correlationId,
    occurredAt: input.now,
  }, tx);
}

function attemptNotFound() {
  return new GuidedTaskRepositoryError(
    "GUIDED_ATTEMPT_NOT_FOUND",
    "Tentative en attente de validation introuvable.",
    404,
  );
}

const inboxCursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  id: z.string().trim().min(1).max(200),
}).strict();

export type GuidedInboxPageRequest = { limit: number; cursor?: string };

function decodeInboxCursor(cursor: string) {
  try {
    const decoded = inboxCursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (!decoded.success || !Number.isFinite(new Date(decoded.data.updatedAt).getTime())) throw new Error();
    if (encodeInboxCursor(decoded.data) !== cursor) throw new Error();
    return decoded.data;
  } catch {
    throw new GuidedTaskRepositoryError(
      "GUIDED_INBOX_CURSOR_INVALID",
      "Le curseur de pagination Inbox est invalide.",
      400,
    );
  }
}

function encodeInboxCursor(cursor: { updatedAt: string; id: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/**
 * Une page Inbox bornée, sans contenu de révision, preuves ou métadonnées de sandbox.
 * Après le contrôle d'accès, elle effectue toujours trois lectures: page, tentatives et décisions.
 */
export async function listGuidedTaskSummaries(
  context: SiteRequestContext,
  input: GuidedInboxPageRequest,
): Promise<GuidedInboxPage> {
  await assertSiteAction(context, "guided.task.read");
  const cursor = input.cursor ? decodeInboxCursor(input.cursor) : null;
  const db = getDatabase();
  const rows = await db
    .select({
      id: guidedTasks.id,
      title: guidedTasks.title,
      status: guidedTasks.status,
      updatedAt: guidedTasks.updatedAt,
      currentRevisionId: guidedTasks.currentRevisionId,
      projectName: projects.name,
      revisionId: guidedTaskRevisions.id,
      revisionState: guidedTaskRevisions.state,
      requiresTechnicalApproval: guidedTaskRevisions.requiresTechnicalApproval,
    })
    .from(guidedTasks)
    .innerJoin(projects, and(eq(projects.siteId, guidedTasks.siteId), eq(projects.id, guidedTasks.projectId)))
    .leftJoin(guidedTaskRevisions, and(
      eq(guidedTaskRevisions.siteId, guidedTasks.siteId),
      eq(guidedTaskRevisions.taskId, guidedTasks.id),
      eq(guidedTaskRevisions.id, guidedTasks.currentRevisionId),
    ))
    .where(and(
      eq(guidedTasks.siteId, context.siteId),
      context.mandateProjectId ? eq(guidedTasks.projectId, context.mandateProjectId) : undefined,
      context.role === "requester" ? eq(guidedTasks.ownerUserId, context.userId) : undefined,
      cursor ? or(
        lt(guidedTasks.updatedAt, new Date(cursor.updatedAt)),
        and(eq(guidedTasks.updatedAt, new Date(cursor.updatedAt)), lt(guidedTasks.id, cursor.id)),
      ) : undefined,
    ))
    .orderBy(desc(guidedTasks.updatedAt), desc(guidedTasks.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const taskIds = pageRows.map((row) => row.id);

  const [attemptRows, decisionRows] = taskIds.length === 0 ? [[], []] : await Promise.all([
    db.selectDistinctOn([guidedTaskAttempts.taskId], {
      taskId: guidedTaskAttempts.taskId,
      id: guidedTaskAttempts.id,
      revisionId: guidedTaskAttempts.revisionId,
      status: guidedTaskAttempts.status,
    })
      .from(guidedTaskAttempts)
      .innerJoin(guidedTasks, and(
        eq(guidedTasks.siteId, guidedTaskAttempts.siteId),
        eq(guidedTasks.id, guidedTaskAttempts.taskId),
        eq(guidedTasks.currentRevisionId, guidedTaskAttempts.revisionId),
      ))
      .where(and(eq(guidedTaskAttempts.siteId, context.siteId), inArray(guidedTaskAttempts.taskId, taskIds)))
      .orderBy(guidedTaskAttempts.taskId, desc(guidedTaskAttempts.attemptNumber)),
    db.selectDistinctOn([guidedTaskDecisions.taskId, guidedTaskDecisions.kind], {
      taskId: guidedTaskDecisions.taskId,
      kind: guidedTaskDecisions.kind,
      outcome: guidedTaskDecisions.outcome,
      attemptId: guidedTaskDecisions.attemptId,
    })
      .from(guidedTaskDecisions)
      .innerJoin(guidedTasks, and(
        eq(guidedTasks.siteId, guidedTaskDecisions.siteId),
        eq(guidedTasks.id, guidedTaskDecisions.taskId),
        eq(guidedTasks.currentRevisionId, guidedTaskDecisions.revisionId),
      ))
      .where(and(eq(guidedTaskDecisions.siteId, context.siteId), inArray(guidedTaskDecisions.taskId, taskIds)))
      .orderBy(guidedTaskDecisions.taskId, guidedTaskDecisions.kind, desc(guidedTaskDecisions.decisionNumber)),
  ]);
  const attemptsByTask = new Map(attemptRows.map((attempt) => [attempt.taskId, attempt]));
  const decisionsByTask = new Map<string, typeof decisionRows>();
  for (const decision of decisionRows) {
    decisionsByTask.set(decision.taskId, [...(decisionsByTask.get(decision.taskId) ?? []), decision]);
  }
  const last = pageRows.at(-1);
  return {
    tasks: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      projectName: row.projectName,
      currentRevision: row.revisionId && row.revisionState ? {
        id: row.revisionId,
        state: row.revisionState,
        requiresTechnicalApproval: row.requiresTechnicalApproval ?? false,
      } : null,
      latestAttempt: attemptsByTask.get(row.id) ?? null,
      decisions: decisionsByTask.get(row.id) ?? [],
      updatedAt: row.updatedAt.toISOString(),
    })),
    page: {
      hasMore,
      nextCursor: hasMore && last ? encodeInboxCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null,
    },
  };
}

export async function getGuidedTask(
  context: SiteRequestContext,
  taskId: string,
): Promise<GuidedTaskDto> {
  await assertSiteAction(context, "guided.task.read");
  const db = getDatabase();
  let task: typeof guidedTasks.$inferSelect;
  try {
    task = await db.transaction((tx) => requireTask(tx, context, taskId));
  } catch (error) {
    if (error instanceof GuidedTaskRepositoryError && error.code === "GUIDED_TASK_NOT_FOUND") {
      await auditScopedMiss(context, {
        action: "guided.task.read",
        resourceType: "guided_task",
        resourceId: taskId,
      });
    }
    throw error;
  }
  const [revisions, attempts, decisions, evidence] = await Promise.all([
    db.select().from(guidedTaskRevisions).where(and(
      eq(guidedTaskRevisions.siteId, context.siteId),
      eq(guidedTaskRevisions.taskId, taskId),
    )).orderBy(asc(guidedTaskRevisions.number)),
    db.select().from(guidedTaskAttempts).where(and(
      eq(guidedTaskAttempts.siteId, context.siteId),
      eq(guidedTaskAttempts.taskId, taskId),
    )).orderBy(asc(guidedTaskAttempts.attemptNumber)),
    db.select().from(guidedTaskDecisions).where(and(
      eq(guidedTaskDecisions.siteId, context.siteId),
      eq(guidedTaskDecisions.taskId, taskId),
    )).orderBy(asc(guidedTaskDecisions.decisionNumber)),
    db.select().from(guidedTaskEvidence).where(and(
      eq(guidedTaskEvidence.siteId, context.siteId),
      eq(guidedTaskEvidence.taskId, taskId),
    )).orderBy(asc(guidedTaskEvidence.createdAt)),
  ]);

  return {
    id: task.id,
    siteId: task.siteId,
    projectId: task.projectId,
    ownerUserId: task.ownerUserId,
    authorUserId: task.authorUserId,
    title: task.title,
    status: task.status,
    currentRevisionId: task.currentRevisionId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    revisions: revisions.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      number: row.number,
      state: row.state,
      contentSha256: row.contentSha256,
      validatedAt: row.validatedAt?.toISOString() ?? null,
      validatedByUserId: row.validatedByUserId,
      requiresTechnicalApproval: row.requiresTechnicalApproval,
      content: row.content,
      authorUserId: row.authorUserId,
      createdAt: row.createdAt.toISOString(),
    })),
    attempts: attempts.map((row) => ({
      id: row.id,
      revisionId: row.revisionId,
      attemptNumber: row.attemptNumber,
      status: row.status,
      repositoryPath: row.repositoryPath,
      baseCommit: row.baseCommit,
      branchName: row.branchName,
      hermesSessionId: row.hermesSessionId,
      hermesOutput: row.hermesOutput,
      error: row.error,
      testsPassed: row.testsPassed,
      evidenceComplete: row.evidenceComplete,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      cleanedUpAt: row.cleanedUpAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      evidence: evidence.filter((item) => item.attemptId === row.id).map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        payload: item.payload,
        checksumSha256: item.checksumSha256,
        createdAt: item.createdAt.toISOString(),
      })),
    })),
    decisions: decisions.map((row): GuidedDecision => ({
      id: row.id,
      taskId: row.taskId,
      revisionId: row.revisionId,
      attemptId: row.attemptId,
      kind: row.kind,
      outcome: row.outcome,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      idempotencyKey: row.idempotencyKey,
      decidedAt: row.createdAt.toISOString(),
    })),
  };
}
