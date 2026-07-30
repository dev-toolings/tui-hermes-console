import { createRunForThread, getRunCancelTarget, isTerminalRunStatus, ProductRepositoryError } from "./repository";
import { startRun } from "./runner";

export type RetryRunResult = {
  threadId: string;
  runId: string;
  sourceRunId: string;
};

/**
 * Relance une mission terminée avec le même prompt (PRD §7 / §9.6).
 * Crée une nouvelle mission dans le thread — n’écrase pas l’historique.
 */
export async function retryRun(runId: string): Promise<RetryRunResult> {
  const source = await getRunCancelTarget(runId);
  if (!source) {
    throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
  }
  if (!isTerminalRunStatus(source.status)) {
    throw new ProductRepositoryError(
      "RUN_ALREADY_ACTIVE",
      "Impossible de relancer une mission encore active.",
    );
  }

  const created = await createRunForThread(source.threadId, source.input);
  startRun(created.runId);

  return {
    threadId: created.threadId,
    runId: created.runId,
    sourceRunId: runId,
  };
}
