import { HermesEventNormalizer } from "@console/core/lib/hermes-events";
import { toProductEvents } from "@/lib/product-events";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { stopHermesAgentRun } from "@/modules/runtime/hermes-adapter";
import { publishThreadEvent } from "./event-bus";
import { resolveHermesProtocol } from "./protocol";
import {
  ProductRepositoryError,
  appendRunEvents,
  failRun,
  getRunCancelTarget,
  isTerminalRunStatus,
  nextRunSequence,
} from "./repository";
import { cancelActiveRun } from "./runner";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";

export type CancelRunResult = {
  runId: string;
  /** `stopping` = abort local en cours ; `cancelled` = clos en base (hors process). */
  status: "stopping" | "cancelled";
  local: boolean;
  remoteStop: boolean;
};

type CancelRunDependencies = {
  cancelLocal: typeof cancelActiveRun;
  resolveRuntime: typeof resolveHermesRuntimeConfig;
  stopRemote: typeof stopHermesAgentRun;
};

/**
 * Annulation bout-en-bout (PRD §9.3 / Phase 3).
 * - Si le run vit dans ce process → abort + stop Hermes (agent) via le runner.
 * - Sinon → stop Hermes depuis la DB (agent) puis clôture produit `cancelled`.
 */
export async function cancelRun(
  context: SiteRequestContext,
  runId: string,
  dependencies: CancelRunDependencies = {
    cancelLocal: cancelActiveRun,
    resolveRuntime: resolveHermesRuntimeConfig,
    stopRemote: stopHermesAgentRun,
  },
): Promise<CancelRunResult> {
  const run = await getRunCancelTarget(context, runId);
  if (!run) {
    await auditScopedMiss(context, { action: "run.cancel", resourceType: "run", resourceId: runId });
    throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
  }
  if (isTerminalRunStatus(run.status)) {
    throw new ProductRepositoryError(
      "RUN_ALREADY_TERMINAL",
      "Cette mission est déjà terminée.",
    );
  }

  const local = dependencies.cancelLocal(context, runId);
  if (local) {
    return { runId, status: "stopping", local: true, remoteStop: Boolean(run.hermesResponseId) };
  }

  // Hors process : stop runtime si possible, puis clôture produit.
  let remoteStop = false;
  const protocol = resolveHermesProtocol();
  if (protocol === "agent" && run.hermesResponseId) {
    try {
      const runtime = await dependencies.resolveRuntime();
      await dependencies.stopRemote({
        hermesRunId: run.hermesResponseId,
        baseUrl: runtime.baseUrl,
        token: runtime.token,
      });
      remoteStop = true;
    } catch {
      // Best effort : on clôture quand même côté Console.
    }
  }

  await closeAsCancelled(context, run.threadId, runId);
  return { runId, status: "cancelled", local: false, remoteStop };
}

async function closeAsCancelled(context: SiteRequestContext, threadId: string, runId: string) {
  // Même règle que la réconciliation : l'annulation doit aboutir en base même
  // si la trace ne peut pas être écrite, sinon POST /cancel renvoie 500 et la
  // mission reste `running`.
  try {
    const normalizer = new HermesEventNormalizer(await nextRunSequence(context, runId));
    const events = toProductEvents([
      normalizer.notice("Mission annulée par l’utilisateur.", "cancelled"),
    ]);
    const stored = await appendRunEvents(context, threadId, runId, events);
    for (const item of stored) publishThreadEvent(threadId, item);
  } catch (error) {
    console.error("[cancel] event append failed", { runId, error });
  }
  await failRun(context, runId, "", "cancelled");
}
