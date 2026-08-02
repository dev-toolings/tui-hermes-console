import { createRunForThread, getRunCancelTarget, isTerminalRunStatus, ProductRepositoryError } from "./repository";
import { startRun } from "./runner";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { assertRuntimeWorkspaceReady } from "@/modules/runtime/config";
import { acquireRunStartLease } from "./active-runtime-guard";

export type RetryRunResult = {
  threadId: string;
  runId: string;
  sourceRunId: string;
};

/**
 * Relance une mission terminée avec le même prompt (PRD §7 / §9.6).
 * Crée une nouvelle mission dans le thread — n’écrase pas l’historique.
 */
export async function retryRun(context: SiteRequestContext, runId: string): Promise<RetryRunResult> {
  const source = await getRunCancelTarget(context, runId);
  if (!source) {
    await auditScopedMiss(context, { action: "run.retry", resourceType: "run", resourceId: runId });
    throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
  }
  if (!isTerminalRunStatus(source.status)) {
    throw new ProductRepositoryError(
      "RUN_ALREADY_ACTIVE",
      "Impossible de relancer une mission encore active.",
    );
  }

  const releaseRunStart = acquireRunStartLease();
  try {
    await assertRuntimeWorkspaceReady();
    const created = await createRunForThread(context, source.threadId, source.input);
    startRun(context, created.runId);

    return {
      threadId: created.threadId,
      runId: created.runId,
      sourceRunId: runId,
    };
  } finally {
    releaseRunStart();
  }
}
