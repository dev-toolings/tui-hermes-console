import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { buildGuidedDeliveryPrompt } from "@console/core/modules/guided-task/spec";
import {
  assertGuidedAttemptCanStart,
  type GuidedDecision,
  type GuidedTaskRevision,
} from "@console/core/modules/guided-task/task";
import { getDatabase } from "@/db/client";
import {
  guidedTaskAttempts,
  guidedTaskDecisions,
  guidedTaskEvidence,
  guidedTaskRevisions,
  guidedTasks,
  projectRepositories,
  type GuidedEvidenceKind,
} from "@/db/schema";
import { getSharedWorkdirRoot } from "@/modules/artifacts/paths";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import type { SiteRequestContext, SiteScope } from "@/modules/auth/service";
import { GuidedTaskContractError } from "@console/core/modules/guided-task/task";
import { GuidedTaskRepositoryError, getGuidedTask } from "./repository";
import {
  cleanupGuidedWorktree,
  createGuidedWorktree,
  inspectGuidedRepository,
  prepareGuidedSandboxHome,
  resolveGuidedDependencyMounts,
  runCommand,
  runInGuidedSandbox,
  validateGuidedTestCommands,
  type GuidedCommandResult,
} from "./sandbox";

const createAttemptSchema = z.object({
  revisionId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

type AttemptContext = {
  siteId: string;
  taskId: string;
  attemptId: string;
  repositoryPath: string;
  baseCommit: string;
  branchName: string;
  sandboxPath: string;
  sandboxHome: string;
  networkPolicy: "none" | "host";
  testCommands: string[][];
  prompt: string;
  intent: "bug" | "feature" | "behavior" | "automation" | "understand" | "quality";
};

const globalDelivery = globalThis as typeof globalThis & {
  hermesConsoleGuidedAttempts?: Map<string, Promise<void>>;
};
const activeAttempts =
  globalDelivery.hermesConsoleGuidedAttempts ??
  (globalDelivery.hermesConsoleGuidedAttempts = new Map());

export async function createGuidedDeliveryAttempt(
  context: SiteRequestContext,
  taskId: string,
  rawInput: unknown,
) {
  await assertSiteAction(context, "guided.task.execute");
  const input = createAttemptSchema.parse(rawInput);
  const db = getDatabase();
  const [existing] = await db.select().from(guidedTaskAttempts).where(and(
    eq(guidedTaskAttempts.siteId, context.siteId),
    eq(guidedTaskAttempts.idempotencyKey, input.idempotencyKey),
  ));
  if (existing) {
    if (existing.taskId !== taskId || existing.revisionId !== input.revisionId) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_DECISION_CONFLICT",
        "Cette clé d’idempotence décrit déjà une autre tentative.",
      );
    }
    return getGuidedTask(context, taskId);
  }

  const snapshot = await loadAttemptSnapshot(context, taskId, input.revisionId);
  const inspected = await inspectGuidedRepository(snapshot.repository.rootPath, snapshot.repository.baseRef);
  const attemptId = `attempt_${randomUUID()}`;
  const now = new Date();
  const prepared = await db.transaction(async (tx) => {
    const [task] = await tx.select().from(guidedTasks).where(and(
      eq(guidedTasks.siteId, context.siteId),
      eq(guidedTasks.id, taskId),
    )).for("update");
    if (!task || task.projectId !== snapshot.task.projectId || task.currentRevisionId !== input.revisionId) {
      throw staleRevision();
    }
    const [active] = await tx.select({ id: guidedTaskAttempts.id }).from(guidedTaskAttempts).where(and(
      eq(guidedTaskAttempts.siteId, context.siteId),
      eq(guidedTaskAttempts.taskId, taskId),
      inArray(guidedTaskAttempts.status, ["pending", "running", "awaiting_functional_validation"]),
    ));
    if (active) {
      throw new GuidedTaskRepositoryError(
        "GUIDED_DECISION_CONFLICT",
        "Une tentative de cette tâche est déjà active ou attend une validation.",
      );
    }
    const [counter] = await tx.select({ value: max(guidedTaskAttempts.attemptNumber) })
      .from(guidedTaskAttempts)
      .where(and(eq(guidedTaskAttempts.siteId, context.siteId), eq(guidedTaskAttempts.taskId, taskId)));
    const attemptNumber = (counter?.value ?? 0) + 1;
    const branchName = `hermes/${taskId.replace(/[^a-zA-Z0-9_-]/g, "-")}/attempt-${attemptNumber}`;
    const base = path.join(getSharedWorkdirRoot(), "guided-delivery");
    const sandboxPath = path.join(base, "worktrees", attemptId);
    const sandboxHome = path.join(base, "homes", attemptId);
    await tx.insert(guidedTaskAttempts).values({
      id: attemptId,
      siteId: context.siteId,
      projectId: task.projectId,
      taskId,
      revisionId: input.revisionId,
      authorUserId: context.userId,
      attemptNumber,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      repositoryPath: inspected.rootPath,
      baseCommit: inspected.baseCommit,
      branchName,
      sandboxPath,
      createdAt: now,
    });
    await tx.update(guidedTasks).set({ status: "running", updatedAt: now }).where(eq(guidedTasks.id, taskId));
    await appendAuditEntryInTransaction({
      eventId: randomUUID(),
      actorSiteId: context.siteId,
      targetSiteId: context.siteId,
      actorUserId: context.userId,
      actorRole: context.role,
      actorOrganizationId: context.actorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      mandateId: context.mandateId,
      action: "guided.task.execute",
      resourceType: "guided_attempt",
      resourceId: attemptId,
      decision: "allowed",
      reasonCode: "GUIDED_ATTEMPT_MANDATE_FROZEN",
      beforeState: { taskId, revisionId: input.revisionId },
      afterState: {
        taskId,
        revisionId: input.revisionId,
        baseCommit: inspected.baseCommit,
        branchName,
        networkPolicy: snapshot.repository.networkPolicy,
      },
      correlationId: context.correlationId,
      occurredAt: now,
    }, tx);
    return { attemptNumber, branchName, sandboxPath, sandboxHome };
  });

  startGuidedDeliveryAttempt({
    siteId: context.siteId,
    taskId,
    attemptId,
    repositoryPath: inspected.rootPath,
    baseCommit: inspected.baseCommit,
    branchName: prepared.branchName,
    sandboxPath: prepared.sandboxPath,
    sandboxHome: prepared.sandboxHome,
    networkPolicy: snapshot.repository.networkPolicy,
    testCommands: snapshot.repository.testCommands,
    prompt: buildExecutionPrompt(snapshot.revision.content, attemptId),
    intent: snapshot.revision.content.intent!,
  });
  return getGuidedTask(context, taskId);
}

async function loadAttemptSnapshot(
  context: SiteRequestContext,
  taskId: string,
  revisionId: string,
) {
  const db = getDatabase();
  const [task] = await db.select().from(guidedTasks).where(and(
    eq(guidedTasks.siteId, context.siteId),
    eq(guidedTasks.id, taskId),
    context.mandateProjectId ? eq(guidedTasks.projectId, context.mandateProjectId) : undefined,
    context.role === "requester" ? eq(guidedTasks.ownerUserId, context.userId) : undefined,
  ));
  if (!task) throw taskNotFound();
  if (task.currentRevisionId !== revisionId) throw staleRevision();
  const [[revision], decisions, [repository]] = await Promise.all([
    db.select().from(guidedTaskRevisions).where(and(
      eq(guidedTaskRevisions.siteId, context.siteId),
      eq(guidedTaskRevisions.taskId, taskId),
      eq(guidedTaskRevisions.id, revisionId),
    )),
    db.select().from(guidedTaskDecisions).where(and(
      eq(guidedTaskDecisions.siteId, context.siteId),
      eq(guidedTaskDecisions.taskId, taskId),
      eq(guidedTaskDecisions.revisionId, revisionId),
    )).orderBy(asc(guidedTaskDecisions.createdAt)),
    db.select().from(projectRepositories).where(and(
      eq(projectRepositories.siteId, context.siteId),
      eq(projectRepositories.projectId, task.projectId),
    )),
  ]);
  if (!revision || !repository) {
    throw new GuidedTaskRepositoryError(
      "GUIDED_REVISION_NOT_FOUND",
      repository ? "Révision validée introuvable." : "Aucun dépôt vérifié n’est connecté à ce projet.",
      404,
    );
  }
  validateGuidedTestCommands(repository.testCommands);
  assertGuidedAttemptCanStart({
    revision: toContractRevision(revision),
    currentRevisionId: task.currentRevisionId,
    decisions: decisions.map(toContractDecision),
  });
  return { task, revision, repository };
}

function toContractRevision(row: typeof guidedTaskRevisions.$inferSelect): GuidedTaskRevision {
  return {
    id: row.id,
    taskId: row.taskId,
    number: row.number,
    state: row.state,
    contentSha256: row.contentSha256,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    validatedByUserId: row.validatedByUserId,
    requiresTechnicalApproval: row.requiresTechnicalApproval,
  };
}

function toContractDecision(row: typeof guidedTaskDecisions.$inferSelect): GuidedDecision {
  return {
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
  };
}

function buildExecutionPrompt(
  draft: typeof guidedTaskRevisions.$inferSelect.content,
  attemptId: string,
) {
  return [
    buildGuidedDeliveryPrompt(draft),
    "",
    "## Sandbox imposée par la Console",
    `Tentative : ${attemptId}`,
    "Travaille uniquement dans /workspace. Ne crée aucun commit, ne pousse rien et ne déploie rien.",
    "Utilise exclusivement bun/bunx pour le projet JavaScript/TypeScript. Ne modifie pas Hermes Agent.",
    "Pour une demande de modification, utilise réellement les outils de fichier ou terminal afin que le worktree contienne le diff demandé. Une simple proposition textuelle est un échec.",
    "Termine par un résumé factuel des fichiers modifiés et des vérifications lancées.",
  ].join("\n");
}

function startGuidedDeliveryAttempt(context: AttemptContext) {
  if (activeAttempts.has(context.attemptId)) return;
  const promise = executeGuidedDeliveryAttempt(context)
    .catch(() => undefined)
    .finally(() => activeAttempts.delete(context.attemptId));
  activeAttempts.set(context.attemptId, promise);
}

export function isGuidedDeliveryAttemptActive(attemptId: string) {
  return activeAttempts.has(attemptId);
}

async function executeGuidedDeliveryAttempt(context: AttemptContext) {
  const db = getDatabase();
  const commands: GuidedCommandResult[] = [];
  let cleanupResult: GuidedCommandResult | null = null;
  let terminalError: unknown = null;
  try {
    commands.push(await createGuidedWorktree(context));
    const installs = await prepareGuidedSandboxHome(context.sandboxHome);
    const dependencyMounts = await resolveGuidedDependencyMounts(context.repositoryPath);
    await db.update(guidedTaskAttempts).set({
      status: "running",
      startedAt: new Date(),
      sandboxPath: context.sandboxPath,
    }).where(and(
      eq(guidedTaskAttempts.siteId, context.siteId),
      eq(guidedTaskAttempts.id, context.attemptId),
    ));

    const hermes = await runInGuidedSandbox({
      workspace: context.sandboxPath,
      sandboxHome: context.sandboxHome,
      hermesInstall: installs.hermesInstall,
      bunInstall: installs.bunInstall,
      pythonRuntime: installs.pythonRuntime,
      resolverPath: installs.resolverPath,
      dependencyMounts,
      networkPolicy: context.networkPolicy,
      command: [
        "/opt/hermes-agent/venv/bin/python",
        "/opt/hermes-agent/hermes",
        "-z",
        context.prompt,
        "--no-restore-cwd",
      ],
      timeoutMs: guidedExecutionTimeoutMs(),
    });
    commands.push(hermes);
    await db.update(guidedTaskAttempts).set({
      hermesOutput: hermes.stdout.trim() || null,
    }).where(and(
      eq(guidedTaskAttempts.siteId, context.siteId),
      eq(guidedTaskAttempts.id, context.attemptId),
    ));
    await persistEvidence(context, [
      evidence("hermes_output", "Résultat Hermes", {
        output: hermes.stdout.trim(),
        stderr: hermes.stderr.trim(),
        exitCode: hermes.exitCode,
      }),
    ]);
    if (hermes.exitCode !== 0 || !hermes.stdout.trim()) {
      throw new Error(hermes.stderr.trim() || "Hermes n’a produit aucun résultat.");
    }

    const diff = await runCommand([
      "git",
      "-C",
      context.sandboxPath,
      "diff",
      "--binary",
      context.baseCommit,
    ], undefined, 30_000);
    const files = await runCommand([
      "git",
      "-C",
      context.sandboxPath,
      "diff",
      "--name-status",
      context.baseCommit,
    ], undefined, 30_000);
    const symlinks = await runCommand([
      "git",
      "-C",
      context.sandboxPath,
      "ls-files",
      "--stage",
    ], undefined, 30_000);
    commands.push(diff, files, symlinks);
    if ([diff, files, symlinks].some((result) => result.exitCode !== 0)) {
      throw new Error("Les preuves Git n’ont pas pu être produites.");
    }
    if (/^120000\s/m.test(symlinks.stdout)) {
      throw new Error("Un lien symbolique a été détecté dans la proposition.");
    }
    const changedFiles = parseChangedFiles(files.stdout);
    if (!changedFiles.length && context.intent !== "understand" && context.intent !== "quality") {
      throw new Error("Hermes n’a produit aucune modification vérifiable.");
    }

    const testResults: GuidedCommandResult[] = [];
    for (const configured of validateGuidedTestCommands(context.testCommands)) {
      const executable = configured[0] === "bun" ? "/opt/bun/bin/bun" : "/opt/bun/bin/bunx";
      const result = await runInGuidedSandbox({
        workspace: context.sandboxPath,
        sandboxHome: context.sandboxHome,
        hermesInstall: installs.hermesInstall,
        bunInstall: installs.bunInstall,
        pythonRuntime: installs.pythonRuntime,
        resolverPath: installs.resolverPath,
        dependencyMounts,
        networkPolicy: "none",
        command: [executable, ...configured.slice(1)],
        timeoutMs: guidedTestTimeoutMs(),
      });
      commands.push(result);
      testResults.push(result);
    }
    const testsPassed = testResults.every((result) => result.exitCode === 0);
    const evidenceInputs = [
      evidence("diff", "Diff Git binaire", { diff: diff.stdout }),
      evidence("files", "Fichiers modifiés", { files: changedFiles }),
      evidence("tests", "Vérifications configurées", {
        passed: testsPassed,
        results: testResults.map(publicCommandResult),
      }),
      evidence("commands", "Commandes bornées", {
        commands: commands.map(publicCommandResult),
      }),
      evidence("preview", "Aperçu de la proposition", {
        type: "textual_change_preview",
        baseCommit: context.baseCommit,
        branchName: context.branchName,
        files: changedFiles,
        summary: hermes.stdout.trim(),
      }),
      evidence("summary", "Résumé métier", {
        summary: hermes.stdout.trim(),
        changedFileCount: changedFiles.length,
        testsPassed,
      }),
    ];
    await persistEvidence(context, evidenceInputs);
    await db.transaction(async (tx) => {
      await tx.update(guidedTaskAttempts).set({
        status: testsPassed ? "awaiting_functional_validation" : "failed",
        hermesOutput: hermes.stdout.trim(),
        testsPassed,
        evidenceComplete: testsPassed,
        error: testsPassed ? null : "Une ou plusieurs vérifications configurées ont échoué.",
        endedAt: new Date(),
      }).where(eq(guidedTaskAttempts.id, context.attemptId));
      await tx.update(guidedTasks).set({
        status: testsPassed ? "awaiting_validation" : "failed",
        updatedAt: new Date(),
      }).where(eq(guidedTasks.id, context.taskId));
    });
  } catch (error) {
    terminalError = error;
    await persistEvidence(context, [
      evidence("commands", "Commandes exécutées avant le refus", {
        commands: commands.map(publicCommandResult),
      }),
      evidence("summary", "Refus fail-closed", {
        verified: false,
        error: describeGuidedError(error),
      }),
    ]).catch(() => undefined);
    await db.transaction(async (tx) => {
      await tx.update(guidedTaskAttempts).set({
        status: "failed",
        evidenceComplete: false,
        testsPassed: false,
        error: describeGuidedError(error),
        endedAt: new Date(),
      }).where(and(eq(guidedTaskAttempts.siteId, context.siteId), eq(guidedTaskAttempts.id, context.attemptId)));
      await tx.update(guidedTasks).set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(guidedTasks.siteId, context.siteId), eq(guidedTasks.id, context.taskId)));
    });
  } finally {
    cleanupResult = await cleanupGuidedWorktree(context).catch((error) => ({
      command: ["git", "worktree", "remove"],
      exitCode: 1,
      stdout: "",
      stderr: describeGuidedError(error),
      durationMs: 0,
    }));
    const cleaned = cleanupResult.exitCode === 0;
    await persistEvidence(context, [
      evidence("cleanup", "Nettoyage de la sandbox", {
        cleaned,
        result: publicCommandResult(cleanupResult),
      }),
    ]).catch(() => undefined);
    await db.update(guidedTaskAttempts).set({
      cleanedUpAt: cleaned ? new Date() : null,
      evidenceComplete: cleaned ? undefined : false,
      status: cleaned ? undefined : "failed",
      error: cleaned
        ? undefined
        : terminalError
          ? `${describeGuidedError(terminalError)}; nettoyage incomplet`
          : "Le nettoyage de la sandbox a échoué.",
    }).where(and(eq(guidedTaskAttempts.siteId, context.siteId), eq(guidedTaskAttempts.id, context.attemptId)));
    if (!cleaned) {
      await db.update(guidedTasks).set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(guidedTasks.siteId, context.siteId), eq(guidedTasks.id, context.taskId)));
    }
  }
}

type EvidenceInput = {
  kind: GuidedEvidenceKind;
  label: string;
  payload: Record<string, unknown>;
  checksumSha256: string;
};

function evidence(
  kind: GuidedEvidenceKind,
  label: string,
  payload: Record<string, unknown>,
): EvidenceInput {
  return {
    kind,
    label,
    payload,
    checksumSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

async function persistEvidence(context: AttemptContext, evidenceInputs: EvidenceInput[]) {
  if (!evidenceInputs.length) return;
  await getDatabase().insert(guidedTaskEvidence).values(evidenceInputs.map((item) => ({
    id: `taskev_${randomUUID()}`,
    siteId: context.siteId,
    taskId: context.taskId,
    attemptId: context.attemptId,
    kind: item.kind,
    label: item.label,
    payload: item.payload,
    checksumSha256: item.checksumSha256,
    createdAt: new Date(),
  })));
}

function parseChangedFiles(output: string) {
  return output.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [status, ...rest] = line.split("\t");
    const file = rest.at(-1) ?? "";
    if (!file || path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) {
      throw new Error("Un chemin de preuve Git sort du dépôt.");
    }
    return { status, file };
  });
}

function publicCommandResult(result: GuidedCommandResult) {
  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  };
}

function guidedExecutionTimeoutMs() {
  return boundedTimeout(process.env.GUIDED_EXECUTION_TIMEOUT_MS, 20 * 60_000, 60_000, 60 * 60_000);
}

function guidedTestTimeoutMs() {
  return boundedTimeout(process.env.GUIDED_TEST_TIMEOUT_MS, 10 * 60_000, 10_000, 30 * 60_000);
}

function boundedTimeout(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function taskNotFound() {
  return new GuidedTaskRepositoryError("GUIDED_TASK_NOT_FOUND", "Tâche introuvable.", 404);
}

function staleRevision() {
  return new GuidedTaskRepositoryError(
    "GUIDED_REVISION_STALE",
    "Seule la révision courante et validée peut être exécutée.",
  );
}

function describeGuidedError(error: unknown) {
  if (error instanceof GuidedTaskContractError) return error.message;
  return error instanceof Error ? error.message : "La tentative guidée a échoué.";
}
