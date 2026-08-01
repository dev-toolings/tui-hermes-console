import { rm } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { runs, threads } from "@/db/schema";
import { runArtifactDir, runWorkdirPath } from "@/modules/artifacts/paths";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import {
  deleteHermesSession,
  HermesRuntimeError,
} from "@/modules/runtime/hermes-adapter";
import { cancelRun } from "./cancel-run";
import { ProductRepositoryError, isTerminalRunStatus } from "./repository";
import type { ProductRunStatus } from "@console/core/modules/runs/types";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";

const ACTIVE_STATUSES: ProductRunStatus[] = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
];

export type DeleteThreadResult = {
  threadId: string;
  cancelledRuns: number;
  hermesSessionsDeleted: number;
  workdirsPurged: number;
};

type DeleteThreadDependencies = {
  cancel: typeof cancelRun;
  resolveRuntime: typeof resolveHermesRuntimeConfig;
  deleteSession: typeof deleteHermesSession;
  remove: typeof rm;
};

/**
 * Supprime une session (thread) bout-en-bout :
 * 1. annule les missions actives
 * 2. best-effort DELETE sessions Hermes
 * 3. purge workdirs disque
 * 4. DELETE thread → cascade runs / messages / events / artifacts
 */
export async function deleteThread(
  context: SiteRequestContext,
  threadId: string,
  dependencies: DeleteThreadDependencies = {
    cancel: cancelRun,
    resolveRuntime: resolveHermesRuntimeConfig,
    deleteSession: deleteHermesSession,
    remove: rm,
  },
): Promise<DeleteThreadResult> {
  const db = getDatabase();
  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.siteId, context.siteId), eq(threads.id, threadId)))
    .limit(1);
  if (!thread) {
    await auditScopedMiss(context, { action: "thread.delete", resourceType: "thread", resourceId: threadId });
    throw new ProductRepositoryError(
      "THREAD_NOT_FOUND",
      "Session introuvable.",
    );
  }

  const runRows = await db
    .select({
      id: runs.id,
      status: runs.status,
      hermesResponseId: runs.hermesResponseId,
    })
    .from(runs)
    .where(and(eq(runs.siteId, context.siteId), eq(runs.threadId, threadId)));

  let cancelledRuns = 0;
  for (const run of runRows) {
    const status = run.status as ProductRunStatus;
    if (!ACTIVE_STATUSES.includes(status) || isTerminalRunStatus(status))
      continue;
    try {
      await dependencies.cancel(context, run.id);
      cancelledRuns += 1;
    } catch (error) {
      if (
        error instanceof ProductRepositoryError &&
        error.code === "RUN_ALREADY_TERMINAL"
      ) {
        continue;
      }
      console.warn("Thread delete: cancel skipped", { runId: run.id, error });
    }
  }

  let hermesSessionsDeleted = 0;
  const sessionIds = [
    ...new Set(
      runRows
        .map((row) => row.hermesResponseId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (sessionIds.length > 0) {
    try {
      const runtime = await dependencies.resolveRuntime();
      await Promise.all(
        sessionIds.map(async (sessionId) => {
          try {
            await dependencies.deleteSession(runtime, sessionId);
            hermesSessionsDeleted += 1;
          } catch (error) {
            if (error instanceof HermesRuntimeError && error.status === 404)
              return;
            console.warn("Thread delete: Hermes session cleanup skipped", {
              sessionId,
              error,
            });
          }
        }),
      );
    } catch (error) {
      if (!(error instanceof HermesRuntimeError)) throw error;
      console.warn("Thread delete: Hermes unreachable", error);
    }
  }

  let workdirsPurged = 0;
  for (const run of runRows) {
    // Ne jamais purger une valeur DB : un chemin compromis transformerait la
    // suppression d'un thread en suppression arbitraire sur l'hôte.
    const dir = runWorkdirPath(run.id);
    try {
      await Promise.all([
        dependencies.remove(dir, { recursive: true, force: true }),
        dependencies.remove(runArtifactDir(run.id), { recursive: true, force: true }),
      ]);
      workdirsPurged += 1;
    } catch (error) {
      console.warn("Thread delete: workdir purge skipped", {
        runId: run.id,
        dir,
        error,
      });
    }
  }

  await db.delete(threads).where(and(eq(threads.siteId, context.siteId), eq(threads.id, threadId)));

  return { threadId, cancelledRuns, hermesSessionsDeleted, workdirsPurged };
}
