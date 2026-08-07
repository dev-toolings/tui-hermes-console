import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  artifacts,
  messages,
  runEvents,
  runs,
  threads,
  type MessageContent,
  type ThreadSource,
  type ThreadWorkflow,
  type Usage,
} from "@/db/schema";
import type {
  ArtifactDto,
  ProductEventInput,
  ProductRunStatus,
  RunActivityPoint,
  RunDto,
  StoredProductEvent,
  ThreadListItemDto,
  ThreadMessageDto,
  ThreadSnapshot,
} from "@console/core/modules/runs/types";
import { ARTIFACT_DELIVERY_ERROR_PREFIX } from "@console/core/lib/run-status";
import { resolveEffectiveInference } from "@/modules/runtime/resolve-effective-model";
import { ensureRunWorkdirs, runInputDir } from "@/modules/artifacts/paths";
import { runArtifactDir, runWorkdirPath } from "@/modules/artifacts/paths";
import { rm } from "node:fs/promises";
import {
  listArtifactsForRun,
  scanOutputArtifacts,
} from "@/modules/artifacts/repository";
import {
  pullRunOutputs,
  RemoteSyncError,
} from "@/modules/artifacts/remote-sync";
import {
  isSiteRequestContextActive,
  type SiteRequestContext,
  type SiteScope,
} from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { auditOwnershipCreation } from "@/modules/ownership/audit";
import { describeError, log } from "@/observability/log";

const ACTIVE_STATUSES: ProductRunStatus[] = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
];
const TERMINAL_STATUSES: ProductRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

function isRequesterScope(scope: SiteScope): scope is SiteRequestContext {
  return "role" in scope && scope.role === "requester" && "userId" in scope;
}

function isSiteRequestScope(scope: SiteScope): scope is SiteRequestContext {
  return "mandateProjectId" in scope;
}

export class ProductRepositoryError extends Error {
  constructor(
    readonly code:
      | "THREAD_NOT_FOUND"
      | "RUN_NOT_FOUND"
      | "RUN_ALREADY_ACTIVE"
      | "RUN_ALREADY_TERMINAL"
      | "RUN_NOT_AWAITING_APPROVAL"
      | "AGENT_IN_CHAT"
      | "TECHNICAL_APPROVAL_REQUIRED"
      | "GUIDED_EXECUTION_NOT_ISOLATED",
    message: string,
  ) {
    super(message);
    this.name = "ProductRepositoryError";
  }
}

export async function createThreadWithRun(context: SiteRequestContext, input: {
  source: ThreadSource;
  workflow?: ThreadWorkflow;
  agentId?: string | null;
  agentName: string;
  instructions: string;
  provider?: string | null;
  model: string;
  reasoningEffort?: string | null;
  message: string;
  projectId?: string | null;
}) {
  // Un agent ne s'attache qu'à une mission : `/chat` reste du chat libre, et on
  // n'y accède à un agent que par une mention `@`, qui crée sa propre mission.
  if (input.source === "chat" && input.agentId) {
    throw new ProductRepositoryError(
      "AGENT_IN_CHAT",
      "Un agent ne peut pas être attaché à une session de chat.",
    );
  }

  const db = getDatabase();
  const projectId = context.mandateProjectId ?? input.projectId ?? null;
  if (
    context.mandateProjectId &&
    input.projectId &&
    input.projectId !== context.mandateProjectId
  ) {
    await auditScopedMiss(context, {
      action: "thread.create",
      resourceType: "project",
      resourceId: input.projectId,
    });
    throw new ProductRepositoryError("THREAD_NOT_FOUND", "Projet introuvable.");
  }
  const threadId = makeId("thr");
  const runId = makeId("run");
  const messageId = makeId("msg");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(threads).values({
      id: threadId,
      siteId: context.siteId,
      ownerUserId: context.userId,
      authorUserId: context.userId,
      projectId,
      title: makeTitle(input.message),
      source: input.source,
      workflow: input.workflow ?? "general",
      agentId: input.agentId ?? null,
      agentName: input.agentName,
      instructions: input.instructions,
      provider: input.provider?.trim() || null,
      model: input.model || "hermes-agent",
      reasoningEffort: input.reasoningEffort?.trim() || null,
      hermesConversation: `console:${threadId}`,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(runs).values({
      id: runId,
      siteId: context.siteId,
      ownerUserId: context.userId,
      authorUserId: context.userId,
      mandateId: context.mandateId,
      operatorOrganizationId:
        context.role === "operator" ? context.actorOrganizationId : null,
      clientOrganizationId: context.clientOrganizationId,
      projectId,
      threadId,
      input: input.message,
      status: "pending",
      createdAt: now,
    });
    await tx.insert(messages).values({
      id: messageId,
      threadId,
      runId,
      role: "user",
      content: [{ type: "text", text: input.message }],
      createdAt: now,
    });
    await auditOwnershipCreation(tx, context, {
      resourceType: "thread",
      resourceId: threadId,
      projectId,
      ownerUserId: context.userId,
      authorUserId: context.userId,
    });
    await auditOwnershipCreation(tx, context, {
      resourceType: "run",
      resourceId: runId,
      projectId,
      ownerUserId: context.userId,
      authorUserId: context.userId,
    });
  });

  const workdir = await ensureRunWorkdirs(runId);
  await getDatabase().update(runs).set({ workdir }).where(and(eq(runs.siteId, context.siteId), eq(runs.id, runId)));

  return { siteId: context.siteId, threadId, runId };
}

export async function createRunForThread(context: SiteRequestContext, threadId: string, input: string) {
  const db = getDatabase();
  const runId = makeId("run");
  const now = new Date();

  await db.transaction(async (tx) => {
    // `FOR UPDATE` sérialise les créations concurrentes sur la même conversation.
    // Sans ce verrou, deux POST simultanés lisent tous les deux « aucun run
    // actif » (READ COMMITTED) et démarrent deux missions sur le même fil.
    const [thread] = await tx
      .select({
        id: threads.id,
        projectId: threads.projectId,
        ownerUserId: threads.ownerUserId,
      })
      .from(threads)
      .where(and(
        eq(threads.siteId, context.siteId),
        eq(threads.id, threadId),
        context.mandateProjectId
          ? eq(threads.projectId, context.mandateProjectId)
          : undefined,
        context.role === "requester" ? eq(threads.ownerUserId, context.userId) : undefined,
      ))
      .for("update");
    if (!thread) {
      await auditScopedMiss(context, { action: "thread.run.create", resourceType: "thread", resourceId: threadId });
      throw new ProductRepositoryError(
        "THREAD_NOT_FOUND",
        "Conversation introuvable.",
      );
    }

    const [active] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(eq(runs.siteId, context.siteId), eq(runs.threadId, threadId), inArray(runs.status, ACTIVE_STATUSES)),
      )
      .limit(1);
    if (active) {
      throw new ProductRepositoryError(
        "RUN_ALREADY_ACTIVE",
        "Une réponse est déjà en cours pour cette conversation.",
      );
    }

    await tx.insert(runs).values({
      id: runId,
      siteId: context.siteId,
      ownerUserId: thread.ownerUserId,
      authorUserId: context.userId,
      mandateId: context.mandateId,
      operatorOrganizationId:
        context.role === "operator" ? context.actorOrganizationId : null,
      clientOrganizationId: context.clientOrganizationId,
      projectId: thread.projectId,
      threadId,
      input,
      status: "pending",
      createdAt: now,
    });
    await tx.insert(messages).values({
      id: makeId("msg"),
      threadId,
      runId,
      role: "user",
      content: [{ type: "text", text: input }],
      createdAt: now,
    });
    await tx
      .update(threads)
      .set({ updatedAt: now })
      .where(and(eq(threads.siteId, context.siteId), eq(threads.id, threadId)));
    await auditOwnershipCreation(tx, context, {
      resourceType: "run",
      resourceId: runId,
      projectId: thread.projectId,
      ownerUserId: thread.ownerUserId,
      authorUserId: context.userId,
    });
  });

  const workdir = await ensureRunWorkdirs(runId);
  await getDatabase().update(runs).set({ workdir }).where(and(eq(runs.siteId, context.siteId), eq(runs.id, runId)));

  return { siteId: context.siteId, threadId, runId };
}

/** Annule un run créé pour un multipart finalement invalide, avant tout départ
 * runtime. Les chemins sont recalculés depuis l'id (jamais depuis la DB). */
export async function discardUnstartedRun(scope: SiteScope, runId: string) {
  const db = getDatabase();
  const [run] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      isSiteRequestScope(scope) && scope.mandateProjectId
        ? eq(runs.projectId, scope.mandateProjectId)
        : undefined,
      isRequesterScope(scope) ? eq(runs.ownerUserId, scope.userId) : undefined,
    ))
    .limit(1);
  if (!run || run.status !== "pending") return;
  await db
    .delete(runs)
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId), eq(runs.status, "pending")));
  await Promise.all([
    rm(runWorkdirPath(runId), { recursive: true, force: true }),
    rm(runArtifactDir(runId), { recursive: true, force: true }),
  ]);
}

/**
 * Historique du thread au format attendu par `POST /v1/runs`.
 *
 * MESURE (spike §11.3) : `/v1/runs` ne rejoue JAMAIS l'historique de la session
 * Hermes — passer un `session_id` seul laisse le modèle sans contexte. La
 * Console est donc la source de vérité et doit envoyer l'historique
 * explicitement. Corollaire rassurant : aucun risque de doublon entre les deux.
 *
 * Le message utilisateur du run courant est exclu : il part déjà comme `input`.
 */
async function getConversationHistory(
  scope: SiteScope,
  threadId: string,
  currentRunId: string,
): Promise<Array<{ role: string; content: string }>> {
  const rows = await getDatabase()
    .select({
      role: messages.role,
      content: messages.content,
      runId: messages.runId,
    })
    .from(messages)
    .innerJoin(threads, eq(messages.threadId, threads.id))
    .where(and(eq(threads.siteId, scope.siteId), eq(messages.threadId, threadId)))
    .orderBy(asc(messages.createdAt));

  const history: Array<{ role: string; content: string }> = [];
  for (const row of rows) {
    if (row.runId === currentRunId) continue;
    // Seul le texte fait sens ici : le raisonnement est du bruit et les appels
    // d'outils sont rejoués côté runtime, pas depuis notre transcript.
    const text = row.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    if (!text) continue;
    history.push({ role: row.role, content: text });
  }
  return history;
}

/**
 * Activité par jour pour le graphique de l'Aperçu.
 *
 * Les jours sans mission sont émis à zéro : sans eux, une courbe relierait le
 * 12 au 28 comme s'il s'était passé quelque chose entre les deux.
 */
export async function getRunActivity(scope: SiteRequestContext, days = 30): Promise<RunActivityPoint[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const rows = await getDatabase()
    .select({
      status: runs.status,
      usage: runs.usage,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .where(and(
      eq(runs.siteId, scope.siteId),
      gt(runs.createdAt, since),
      scope.mandateProjectId
        ? eq(runs.projectId, scope.mandateProjectId)
        : undefined,
      scope.role === "requester" ? eq(runs.ownerUserId, scope.userId) : undefined,
    ))
    .orderBy(asc(runs.createdAt));

  const buckets = new Map<string, RunActivityPoint>();
  for (let index = 0; index < days; index += 1) {
    const day = new Date(since);
    day.setDate(since.getDate() + index);
    const key = toDayKey(day);
    buckets.set(key, { date: key, completed: 0, failed: 0, tokens: 0 });
  }

  for (const row of rows) {
    const bucket = buckets.get(toDayKey(row.createdAt));
    if (!bucket) continue;
    if (row.status === "completed") bucket.completed += 1;
    if (row.status === "failed" || row.status === "cancelled")
      bucket.failed += 1;
    bucket.tokens += row.usage?.totalTokens ?? 0;
  }

  return [...buckets.values()];
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getRunContext(scope: SiteScope, runId: string) {
  const db = getDatabase();
  const [row] = await db
    .select({
      runId: runs.id,
      siteId: runs.siteId,
      projectId: runs.projectId,
      threadId: runs.threadId,
      input: runs.input,
      status: runs.status,
      instructions: threads.instructions,
      threadProvider: threads.provider,
      threadModel: threads.model,
      threadReasoningEffort: threads.reasoningEffort,
      agentId: threads.agentId,
      hermesConversation: threads.hermesConversation,
    })
    .from(runs)
    .innerJoin(threads, eq(runs.threadId, threads.id))
    .where(and(eq(runs.siteId, scope.siteId), eq(threads.siteId, scope.siteId), eq(runs.id, runId)))
    .limit(1);

  if (!row)
    throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");

  const inference = await resolveEffectiveInference(scope, {
    threadProvider: row.threadProvider,
    threadModel: row.threadModel,
    threadReasoningEffort: row.threadReasoningEffort,
    agentId: row.agentId,
  });

  const inputDir = runInputDir(runId);
  const inputArtifacts = (await listArtifactsForRun(scope, runId, "input")).map(
    (item) => ({
      filename: item.filename,
      absolutePath: path.join(inputDir, item.filename),
    }),
  );

  const conversationHistory = await getConversationHistory(
    scope,
    row.threadId,
    row.runId,
  );

  return {
    runId: row.runId,
    siteId: row.siteId,
    projectId: row.projectId,
    threadId: row.threadId,
    input: row.input,
    status: row.status,
    instructions: row.instructions,
    provider: inference.provider,
    model: inference.model,
    reasoningEffort: inference.reasoningEffort,
    hermesConversation: row.hermesConversation,
    conversationHistory,
    inputArtifacts,
  };
}

export async function markRunStarted(scope: SiteScope, runId: string) {
  await getDatabase()
    .update(runs)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
}

export async function markRunStarting(scope: SiteScope, runId: string) {
  await getDatabase()
    .update(runs)
    .set({ status: "starting", error: null })
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
}

export async function markRunAwaitingApproval(scope: SiteScope, runId: string) {
  const db = getDatabase();
  const [run] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      isRequesterScope(scope) ? eq(runs.ownerUserId, scope.userId) : undefined,
    ))
    .limit(1);
  if (!run) return;
  if (TERMINAL_STATUSES.includes(run.status as ProductRunStatus)) return;

  await db
    .update(runs)
    .set({ status: "awaiting_approval", error: null, lastEventAt: new Date() })
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
}

export async function setHermesResponseId(scope: SiteScope, runId: string, responseId: string) {
  await getDatabase()
    .update(runs)
    .set({ hermesResponseId: responseId })
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
}

/**
 * Prochaine `sequence` libre pour une mission. A appeler avant de construire un
 * `HermesEventNormalizer` sur un run qui a deja des evenements en base.
 */
export async function nextRunSequence(scope: SiteScope, runId: string): Promise<number> {
  const [row] = await getDatabase()
    .select({ max: max(runEvents.sequence) })
    .from(runEvents)
    .innerJoin(runs, eq(runEvents.runId, runs.id))
    .where(and(eq(runs.siteId, scope.siteId), eq(runEvents.runId, runId)));
  return (row?.max ?? -1) + 1;
}

export async function appendRunEvents(
  scope: SiteScope,
  threadId: string,
  runId: string,
  incoming: ProductEventInput[],
): Promise<StoredProductEvent[]> {
  if (incoming.length === 0) return [];
  const db = getDatabase();
  const stored: StoredProductEvent[] = [];
  const lastAt = incoming.at(-1)?.occurredAt ?? new Date();

  await db.transaction(async (tx) => {
    const [ownedRun] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId), eq(runs.threadId, threadId)))
      .limit(1);
    if (!ownedRun) throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
    for (const event of incoming) {
      const [row] = await tx
        .insert(runEvents)
        .values({
          runId,
          sequence: event.sequence,
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        })
        .returning({ cursor: runEvents.id });
      stored.push({ ...event, runId, cursor: row.cursor });
    }
    await tx
      .update(runs)
      .set({ lastEventAt: lastAt })
      .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
    await tx
      .update(threads)
      .set({ updatedAt: new Date() })
      .where(and(eq(threads.siteId, scope.siteId), eq(threads.id, threadId)));
  });

  return stored;
}

/**
 * Renseigne a posteriori les sorties d'outils d'une mission terminée.
 *
 * Le flux `/v1/runs` émet un `tool.completed` SANS résultat — mesuré dès la
 * passe 0b, d'où le `hasResultPayload: false` codé en dur dans
 * `lib/hermes-events.ts`. Les messages `role: "tool"` de la session Hermes,
 * eux, portent leur `content` complet (spike §11.4) : on les rapatrie une fois
 * la mission terminée et on complète les événements déjà persistés.
 *
 * Appariement FIFO par nom d'outil, faute d'identifiant d'appel dans le flux
 * SSE — exactement la règle qu'applique déjà `HermesEventNormalizer`. Deux
 * missions concurrentes sur un même thread mettraient cet appariement en
 * défaut ; le cas ne se présente pas (une mission active par thread).
 *
 * Renvoie les événements mis à jour, pour republication vers l'UI live.
 */
export async function applyToolOutputs(
  scope: SiteScope,
  runId: string,
  outputs: Array<{ toolName: string | null; content: string }>,
): Promise<StoredProductEvent[]> {
  if (outputs.length === 0) return [];
  const db = getDatabase();

  const eventRows = await db
    .select({
      cursor: runEvents.id,
      sequence: runEvents.sequence,
      type: runEvents.type,
      payload: runEvents.payload,
      occurredAt: runEvents.occurredAt,
    })
    .from(runEvents)
    .innerJoin(runs, eq(runEvents.runId, runs.id))
    .where(and(eq(runs.siteId, scope.siteId), eq(runEvents.runId, runId)))
    .orderBy(asc(runEvents.sequence));

  const results = eventRows.filter(
    (row) =>
      row.type === "tool.result" && row.payload.hasResultPayload !== true,
  );
  if (results.length === 0) return [];

  // La session accumule TOUS les tours du thread : seuls les derniers
  // correspondent à cette mission.
  const relevant = outputs.slice(-results.length);
  const queues = new Map<string, string[]>();
  for (const item of relevant) {
    const key = item.toolName ?? "";
    const queue = queues.get(key) ?? [];
    queue.push(item.content);
    queues.set(key, queue);
  }

  const updated: StoredProductEvent[] = [];
  for (const row of results) {
    const tool = String(row.payload.tool ?? "");
    const content = queues.get(tool)?.shift();
    if (content === undefined) continue;

    const payload = { ...row.payload, hasResultPayload: true, result: content };
    await db
      .update(runEvents)
      .set({ payload })
      .where(eq(runEvents.id, row.cursor));
    updated.push({
      runId,
      cursor: row.cursor,
      sequence: row.sequence,
      type: row.type as StoredProductEvent["type"],
      payload,
      occurredAt: row.occurredAt,
    });
  }

  if (updated.length === 0) return [];

  // Le message assistant a été construit avant le backfill : le reconstruire
  // depuis les événements corrigés, sinon un rechargement de page reperd les
  // sorties que le flux live vient d'afficher.
  const patched = eventRows.map((row) => {
    const match = updated.find((item) => item.cursor === row.cursor);
    return match
      ? { type: row.type, payload: match.payload }
      : { type: row.type, payload: row.payload };
  });
  const [run] = await db
    .select({ output: runs.output })
    .from(runs)
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)))
    .limit(1);

  await db
    .update(messages)
    .set({ content: buildAssistantContent(patched, run?.output ?? "") })
    .where(and(eq(messages.runId, runId), eq(messages.role, "assistant")));

  return updated;
}

export async function completeRun(
  scope: SiteScope,
  runId: string,
  output: string,
  usage: Usage | null,
) {
  const db = getDatabase();
  const now = new Date();

  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({ threadId: runs.threadId, status: runs.status })
      .from(runs)
      .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)))
      .limit(1);
    if (!run)
      throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
    if (TERMINAL_STATUSES.includes(run.status as ProductRunStatus)) return;

    const eventRows = await tx
      .select({
        type: runEvents.type,
        payload: runEvents.payload,
      })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.sequence));

    await tx
      .update(runs)
      .set({ status: "completed", output, usage, endedAt: now })
      .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));

    const [existingAssistant] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.runId, runId), eq(messages.role, "assistant")))
      .limit(1);

    if (!existingAssistant) {
      await tx.insert(messages).values({
        id: makeId("msg"),
        threadId: run.threadId,
        runId,
        role: "assistant",
        content: buildAssistantContent(eventRows, output),
        createdAt: now,
      });
    }

    await tx
      .update(threads)
      .set({ updatedAt: now })
      .where(and(eq(threads.siteId, scope.siteId), eq(threads.id, run.threadId)));
  });

  // Le runtime a bien terminé. La livraison est une seconde phase : son échec
  // ne réécrit pas la vérité runtime en `failed`, mais doit rester visible au
  // lieu d'être absorbé derrière un statut `completed` sans nuance.
  const delivery = await finalizeRunArtifactDelivery(scope, runId);
  if (!delivery.ok) {
    await db
      .update(runs)
      .set({ error: delivery.message })
      .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
    log.error("[hermes-console] artifact delivery failed", {
      runId,
      operation: delivery.operation,
      ...describeError(delivery.cause),
    });
  }
}

type ArtifactDeliveryDependencies = {
  pull(runId: string): Promise<void>;
  scan(scope: SiteScope, runId: string): Promise<unknown>;
};

export type ArtifactDeliveryResult =
  | { ok: true }
  | {
      ok: false;
      operation: string;
      message: string;
      cause: unknown;
    };

export async function finalizeRunArtifactDelivery(
  scope: SiteScope,
  runId: string,
  dependencies: ArtifactDeliveryDependencies = {
    pull: pullRunOutputs,
    scan: scanOutputArtifacts,
  },
): Promise<ArtifactDeliveryResult> {
  try {
    await dependencies.pull(runId);
    await dependencies.scan(scope, runId);
    return { ok: true };
  } catch (error) {
    const operation =
      error instanceof RemoteSyncError ? error.operation : "scan_outputs";
    return {
      ok: false,
      operation,
      message:
        `${ARTIFACT_DELIVERY_ERROR_PREFIX}Mission ${runId} : Hermes a terminé, ` +
        `mais la livraison des artefacts ` +
        `a échoué (${operation}). Aucun succès de livraison n’est déclaré.`,
      cause: error,
    };
  }
}

export async function failRun(
  scope: SiteScope,
  runId: string,
  error: string,
  status: "failed" | "cancelled" = "failed",
) {
  const db = getDatabase();
  const [run] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)))
    .limit(1);
  if (!run) return;
  if (TERMINAL_STATUSES.includes(run.status as ProductRunStatus)) return;

  await db
    .update(runs)
    .set({
      status,
      error: status === "failed" ? error : null,
      endedAt: new Date(),
    })
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, runId)));
}

export type ActiveRunRow = {
  id: string;
  siteId: string;
  projectId: string | null;
  authorUserId: string;
  mandateId: string | null;
  operatorOrganizationId: string | null;
  clientOrganizationId: string | null;
  threadId: string;
  status: ProductRunStatus;
  hermesResponseId: string | null;
  input: string;
};

export type RunCancelTarget = {
  id: string;
  siteId: string;
  projectId: string | null;
  threadId: string;
  status: ProductRunStatus;
  hermesResponseId: string | null;
  input: string;
};

/**
 * Claim an approval with a database compare-and-set before calling Hermes.
 *
 * The previous read-only lookup allowed two approvers to both observe
 * `awaiting_approval` and relay two remote decisions.  The conditional update
 * below is the single ownership transition: only one request can move the run
 * out of `awaiting_approval`, and every later request receives no claim.
 */
export type RunApprovalClaim = RunCancelTarget & {
  approvalClaimId: string;
};

export async function claimRunApproval(
  scope: SiteScope,
  runId: string,
): Promise<RunApprovalClaim | null> {
  if (isSiteRequestScope(scope) && !(await isSiteRequestContextActive(scope))) return null;
  const approvalClaimId = randomUUID();
  const [row] = await getDatabase()
    .update(runs)
    .set({
      status: "running",
      startedAt: sql`coalesce(${runs.startedAt}, now())`,
      error: null,
      approvalClaimId,
    })
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      eq(runs.status, "awaiting_approval"),
      isNull(runs.approvalClaimId),
      isSiteRequestScope(scope) && scope.mandateId !== null
        ? eq(runs.mandateId, scope.mandateId)
        : undefined,
      isSiteRequestScope(scope) && scope.mandateProjectId
        ? eq(runs.projectId, scope.mandateProjectId)
        : undefined,
      isRequesterScope(scope) ? eq(runs.ownerUserId, scope.userId) : undefined,
    ))
    .returning({
      id: runs.id,
      siteId: runs.siteId,
      projectId: runs.projectId,
      authorUserId: runs.authorUserId,
      mandateId: runs.mandateId,
      operatorOrganizationId: runs.operatorOrganizationId,
      clientOrganizationId: runs.clientOrganizationId,
      threadId: runs.threadId,
      hermesResponseId: runs.hermesResponseId,
      input: runs.input,
      approvalClaimId: runs.approvalClaimId,
    });

  if (!row || row.approvalClaimId !== approvalClaimId) return null;
  return {
    ...row,
    status: "awaiting_approval",
    approvalClaimId,
  };
}

/** Release only the caller's claim; an unrelated running transition is untouched. */
export async function releaseRunApprovalClaim(
  scope: SiteScope,
  runId: string,
  approvalClaimId: string,
) {
  await getDatabase()
    .update(runs)
    .set({
      status: "awaiting_approval",
      error: null,
      approvalClaimId: null,
    })
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      eq(runs.status, "running"),
      eq(runs.approvalClaimId, approvalClaimId),
    ));
}

/** Clear a successfully completed claim without changing the Hermes status. */
export async function finalizeRunApprovalClaim(
  scope: SiteScope,
  runId: string,
  approvalClaimId: string,
) {
  await getDatabase()
    .update(runs)
    .set({ approvalClaimId: null })
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      eq(runs.status, "running"),
      eq(runs.approvalClaimId, approvalClaimId),
    ));
}

export async function getRunCancelTarget(
  scope: SiteScope,
  runId: string,
): Promise<RunCancelTarget | null> {
  const [row] = await getDatabase()
    .select({
      id: runs.id,
      siteId: runs.siteId,
      projectId: runs.projectId,
      authorUserId: runs.authorUserId,
      mandateId: runs.mandateId,
      operatorOrganizationId: runs.operatorOrganizationId,
      clientOrganizationId: runs.clientOrganizationId,
      threadId: runs.threadId,
      status: runs.status,
      hermesResponseId: runs.hermesResponseId,
      input: runs.input,
    })
    .from(runs)
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      isSiteRequestScope(scope) && scope.mandateProjectId
        ? eq(runs.projectId, scope.mandateProjectId)
        : undefined,
      isRequesterScope(scope) ? eq(runs.ownerUserId, scope.userId) : undefined,
    ))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    status: row.status as ProductRunStatus,
  };
}

export function isTerminalRunStatus(status: ProductRunStatus) {
  return TERMINAL_STATUSES.includes(status);
}

export async function listNonTerminalRuns(): Promise<ActiveRunRow[]> {
  const rows = await getDatabase()
    .select({
      id: runs.id,
      siteId: runs.siteId,
      projectId: runs.projectId,
      authorUserId: runs.authorUserId,
      mandateId: runs.mandateId,
      operatorOrganizationId: runs.operatorOrganizationId,
      clientOrganizationId: runs.clientOrganizationId,
      threadId: runs.threadId,
      status: runs.status,
      hermesResponseId: runs.hermesResponseId,
      input: runs.input,
    })
    .from(runs)
    .where(inArray(runs.status, ACTIVE_STATUSES));

  return rows.map((row) => ({
    ...row,
    status: row.status as ProductRunStatus,
  }));
}

export async function getThreadSnapshot(
  context: SiteRequestContext,
  threadId: string,
): Promise<ThreadSnapshot | null> {
  const db = getDatabase();
  const [thread] = await db
    .select()
    .from(threads)
    .where(and(
      eq(threads.siteId, context.siteId),
      eq(threads.id, threadId),
      context.mandateProjectId
        ? eq(threads.projectId, context.mandateProjectId)
        : undefined,
      context.role === "requester" ? eq(threads.ownerUserId, context.userId) : undefined,
    ))
    .limit(1);
  if (!thread) {
    await auditScopedMiss(context, { action: "thread.read", resourceType: "thread", resourceId: threadId });
    return null;
  }

  const [messageRows, runRows, eventRows, artifactRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        runId: messages.runId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(threads, eq(messages.threadId, threads.id))
      .where(and(eq(threads.siteId, context.siteId), eq(messages.threadId, threadId)))
      .orderBy(asc(messages.createdAt)),
    db
      .select()
      .from(runs)
      .where(and(eq(runs.siteId, context.siteId), eq(runs.threadId, threadId)))
      .orderBy(asc(runs.createdAt)),
    db
      .select({
        cursor: runEvents.id,
        runId: runEvents.runId,
        sequence: runEvents.sequence,
        type: runEvents.type,
        payload: runEvents.payload,
        occurredAt: runEvents.occurredAt,
      })
      .from(runEvents)
      .innerJoin(runs, eq(runEvents.runId, runs.id))
      .where(and(eq(runs.siteId, context.siteId), eq(runs.threadId, threadId)))
      .orderBy(asc(runEvents.id)),
    db
      .select({
        id: artifacts.id,
        runId: artifacts.runId,
        direction: artifacts.direction,
        filename: artifacts.filename,
        mimeType: artifacts.mimeType,
        sizeBytes: artifacts.sizeBytes,
        checksumSha256: artifacts.checksumSha256,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .innerJoin(runs, eq(artifacts.runId, runs.id))
      .where(and(eq(runs.siteId, context.siteId), eq(runs.threadId, threadId)))
      .orderBy(desc(artifacts.createdAt)),
  ]);

  const inference = await resolveEffectiveInference(context, {
    threadProvider: thread.provider,
    threadModel: thread.model,
    agentId: thread.agentId,
  });

  return {
    id: thread.id,
    title: thread.title,
    source: thread.source,
    workflow: thread.workflow,
    agentName: thread.agentName,
    instructions: thread.instructions,
    provider: thread.provider,
    model: thread.model,
    effectiveProvider: inference.provider,
    effectiveModel: inference.model,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    messages: messageRows.map((message): ThreadMessageDto => ({
      id: message.id,
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
      runId: message.runId,
      createdAt: message.createdAt.toISOString(),
    })),
    runs: runRows.map(toRunDto),
    events: eventRows.map((event) => ({
      ...event,
      type: event.type as StoredProductEvent["type"],
    })),
    artifacts: artifactRows.map((row): ArtifactDto => ({
      id: row.id,
      runId: row.runId,
      direction: row.direction,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      checksumSha256: row.checksumSha256,
      createdAt: row.createdAt.toISOString(),
    })),
    cursor: eventRows.at(-1)?.cursor ?? 0,
  };
}

export async function listThreadEventsAfter(
  scope: SiteRequestContext,
  threadId: string,
  cursor: number,
): Promise<StoredProductEvent[]> {
  const rows = await getDatabase()
    .select({
      cursor: runEvents.id,
      runId: runEvents.runId,
      sequence: runEvents.sequence,
      type: runEvents.type,
      payload: runEvents.payload,
      occurredAt: runEvents.occurredAt,
    })
    .from(runEvents)
    .innerJoin(runs, eq(runEvents.runId, runs.id))
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.threadId, threadId),
      scope.mandateProjectId
        ? eq(runs.projectId, scope.mandateProjectId)
        : undefined,
      scope.role === "requester" ? eq(runs.ownerUserId, scope.userId) : undefined,
      gt(runEvents.id, cursor),
    ))
    .orderBy(asc(runEvents.id));

  return rows.map((event) => ({
    ...event,
    type: event.type as StoredProductEvent["type"],
  }));
}

/** Vérifie un droit SSE sans auditer ni révéler l'identité de la ressource. */
export async function canReadThreadEvents(
  context: SiteRequestContext,
  threadId: string,
) {
  if (!(await isSiteRequestContextActive(context))) return false;
  const [thread] = await getDatabase()
    .select({ id: threads.id })
    .from(threads)
    .where(and(
      eq(threads.siteId, context.siteId),
      eq(threads.id, threadId),
      context.mandateProjectId
        ? eq(threads.projectId, context.mandateProjectId)
        : undefined,
      context.role === "requester" ? eq(threads.ownerUserId, context.userId) : undefined,
    ))
    .limit(1);
  return Boolean(thread);
}

export async function getLatestRun(scope: SiteScope, threadId: string): Promise<RunDto | null> {
  const [run] = await getDatabase()
    .select()
    .from(runs)
    .where(and(eq(runs.siteId, scope.siteId), eq(runs.threadId, threadId)))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  return run ? toRunDto(run) : null;
}

export async function listThreads(scope: SiteRequestContext, options?: {
  source?: ThreadSource;
}): Promise<ThreadListItemDto[]> {
  const db = getDatabase();
  const threadQuery = options?.source
    ? db
        .select()
        .from(threads)
        .where(and(
          eq(threads.siteId, scope.siteId),
          scope.mandateProjectId
            ? eq(threads.projectId, scope.mandateProjectId)
            : undefined,
          eq(threads.source, options.source),
          scope.role === "requester" ? eq(threads.ownerUserId, scope.userId) : undefined,
        ))
        .orderBy(desc(threads.updatedAt))
    : db.select().from(threads).where(and(
        eq(threads.siteId, scope.siteId),
        scope.mandateProjectId
          ? eq(threads.projectId, scope.mandateProjectId)
          : undefined,
        scope.role === "requester" ? eq(threads.ownerUserId, scope.userId) : undefined,
      )).orderBy(desc(threads.updatedAt));
  const [threadRows, runRows] = await Promise.all([
    threadQuery,
    db.select().from(runs).where(and(
      eq(runs.siteId, scope.siteId),
      scope.mandateProjectId
        ? eq(runs.projectId, scope.mandateProjectId)
        : undefined,
      scope.role === "requester" ? eq(runs.ownerUserId, scope.userId) : undefined,
    )).orderBy(desc(runs.createdAt)),
  ]);
  const latestByThread = new Map<string, RunDto>();
  for (const run of runRows) {
    if (!latestByThread.has(run.threadId))
      latestByThread.set(run.threadId, toRunDto(run));
  }
  return threadRows.map((thread) => ({
    id: thread.id,
    title: thread.title,
    source: thread.source,
    workflow: thread.workflow,
    agentName: thread.agentName,
    provider: thread.provider,
    model: thread.model,
    updatedAt: thread.updatedAt.toISOString(),
    latestRun: latestByThread.get(thread.id) ?? null,
  }));
}

function toRunDto(run: typeof runs.$inferSelect): RunDto {
  return {
    id: run.id,
    status: run.status as ProductRunStatus,
    input: run.input,
    output: run.output,
    usage: run.usage ?? null,
    error: run.error,
    hermesResponseId: run.hermesResponseId,
    runtimeSession: null,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    lastEventAt: run.lastEventAt?.toISOString() ?? null,
  };
}

/**
 * Le message assistant tel qu'il sera relu — c'est lui, pas le flux, que l'écran
 * affiche une fois la mission terminée. Exporté pour être testé sans base.
 */
export function buildAssistantContent(
  events: Array<{ type: string; payload: Record<string, unknown> }>,
  output: string,
): MessageContent {
  const content: MessageContent = [];
  const toolParts = new Map<string, number>();
  /**
   * L'appel d'outil en cours quand une décision d'autorisation tombe. Hermes ne
   * met aucun `toolCallId` dans `approval.request` : le seul lien est l'ordre du
   * flux. Sans ce report, la décision resterait visible pendant le run live puis
   * disparaîtrait au rechargement — la trace doit survivre à la persistance.
   */
  let lastToolCallId: string | null = null;

  for (const event of events) {
    if (event.type === "approval.responded") {
      const index =
        lastToolCallId == null ? null : toolParts.get(lastToolCallId);
      const part = index == null ? null : content[index];
      const choice = event.payload.choice;
      if (part?.type === "tool-call" && typeof choice === "string") {
        part.args = { ...part.args, approval: { choice } };
      }
    }

    if (event.type === "agent.message") {
      const text = String(event.payload.text ?? "");
      const last = content.at(-1);
      if (last?.type === "text") last.text += text;
      else content.push({ type: "text", text });
    }

    if (event.type === "agent.reasoning") {
      const text = String(event.payload.text ?? "");
      const last = content.at(-1);
      if (last?.type === "reasoning") last.text += text;
      else content.push({ type: "reasoning", text });
    }

    if (event.type === "tool.call") {
      const toolCallId = String(event.payload.toolCallId ?? makeId("call"));
      toolParts.set(toolCallId, content.length);
      lastToolCallId = toolCallId;
      content.push({
        type: "tool-call",
        toolCallId,
        toolName: String(event.payload.tool ?? "outil"),
        args: {
          tool: String(event.payload.tool ?? "outil"),
          preview: event.payload.preview ?? null,
          arguments: event.payload.arguments ?? null,
        },
      });
    }

    if (event.type === "tool.result") {
      const toolCallId = String(event.payload.toolCallId ?? "");
      const index = toolParts.get(toolCallId);
      const part = index == null ? null : content[index];
      if (part?.type === "tool-call") {
        part.result = {
          durationMs:
            typeof event.payload.durationMs === "number"
              ? event.payload.durationMs
              : null,
          error: event.payload.error === true,
          hasResultPayload: event.payload.hasResultPayload === true,
          output: event.payload.result ?? null,
        };
      }
    }
  }

  if (!content.some((part) => part.type === "text") && output) {
    content.push({ type: "text", text: output });
  }

  return content;
}

function makeTitle(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized;
}

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
