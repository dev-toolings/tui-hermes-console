import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { runs, threads } from "@/db/schema";
import { runWorkdirPath } from "@/modules/artifacts/paths";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { deleteHermesSession, HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { cancelRun } from "./cancel-run";
import {
  ProductRepositoryError,
  isTerminalRunStatus,
} from "./repository";
import type { ProductRunStatus } from "@console/core/modules/runs/types";

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

/**
 * Supprime une session (thread) bout-en-bout :
 * 1. annule les missions actives
 * 2. best-effort DELETE sessions Hermes
 * 3. purge workdirs disque
 * 4. DELETE thread → cascade runs / messages / events / artifacts
 */
export async function deleteThread(threadId: string): Promise<DeleteThreadResult> {
  const db = getDatabase();
  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);
  if (!thread) {
    throw new ProductRepositoryError("THREAD_NOT_FOUND", "Session introuvable.");
  }

  const runRows = await db
    .select({
      id: runs.id,
      status: runs.status,
      hermesResponseId: runs.hermesResponseId,
      workdir: runs.workdir,
    })
    .from(runs)
    .where(eq(runs.threadId, threadId));

  let cancelledRuns = 0;
  for (const run of runRows) {
    const status = run.status as ProductRunStatus;
    if (!ACTIVE_STATUSES.includes(status) || isTerminalRunStatus(status)) continue;
    try {
      await cancelRun(run.id);
      cancelledRuns += 1;
    } catch (error) {
      if (error instanceof ProductRepositoryError && error.code === "RUN_ALREADY_TERMINAL") {
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
      const runtime = await resolveHermesRuntimeConfig();
      await Promise.all(
        sessionIds.map(async (sessionId) => {
          try {
            await deleteHermesSession(runtime, sessionId);
            hermesSessionsDeleted += 1;
          } catch (error) {
            if (error instanceof HermesRuntimeError && error.status === 404) return;
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
    const dir = run.workdir?.trim() || runWorkdirPath(run.id);
    try {
      await rm(dir, { recursive: true, force: true });
      workdirsPurged += 1;
    } catch (error) {
      console.warn("Thread delete: workdir purge skipped", { runId: run.id, dir, error });
    }
  }

  await db.delete(threads).where(eq(threads.id, threadId));

  return { threadId, cancelledRuns, hermesSessionsDeleted, workdirsPurged };
}
