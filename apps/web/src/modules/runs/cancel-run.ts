import { HermesEventNormalizer } from "@/lib/hermes-events";
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

export type CancelRunResult = {
  runId: string;
  /** `stopping` = abort local en cours ; `cancelled` = clos en base (hors process). */
  status: "stopping" | "cancelled";
  local: boolean;
  remoteStop: boolean;
};

/**
 * Annulation bout-en-bout (PRD §9.3 / Phase 3).
 * - Si le run vit dans ce process → abort + stop Hermes (agent) via le runner.
 * - Sinon → stop Hermes depuis la DB (agent) puis clôture produit `cancelled`.
 */
export async function cancelRun(runId: string): Promise<CancelRunResult> {
  const run = await getRunCancelTarget(runId);
  if (!run) {
    throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
  }
  if (isTerminalRunStatus(run.status)) {
    throw new ProductRepositoryError(
      "RUN_ALREADY_TERMINAL",
      "Cette mission est déjà terminée.",
    );
  }

  const local = cancelActiveRun(runId);
  if (local) {
    return { runId, status: "stopping", local: true, remoteStop: Boolean(run.hermesResponseId) };
  }

  // Hors process : stop runtime si possible, puis clôture produit.
  let remoteStop = false;
  const protocol = resolveHermesProtocol();
  if (protocol === "agent" && run.hermesResponseId) {
    try {
      const runtime = await resolveHermesRuntimeConfig();
      await stopHermesAgentRun({
        hermesRunId: run.hermesResponseId,
        baseUrl: runtime.baseUrl,
        token: runtime.token,
      });
      remoteStop = true;
    } catch {
      // Best effort : on clôture quand même côté Console.
    }
  }

  await closeAsCancelled(run.threadId, runId);
  return { runId, status: "cancelled", local: false, remoteStop };
}

async function closeAsCancelled(threadId: string, runId: string) {
  // Même règle que la réconciliation : l'annulation doit aboutir en base même
  // si la trace ne peut pas être écrite, sinon POST /cancel renvoie 500 et la
  // mission reste `running`.
  try {
    const normalizer = new HermesEventNormalizer(await nextRunSequence(runId));
    const events = toProductEvents([
      normalizer.notice("Mission annulée par l’utilisateur.", "cancelled"),
    ]);
    const stored = await appendRunEvents(threadId, runId, events);
    for (const item of stored) publishThreadEvent(threadId, item);
  } catch (error) {
    console.error("[cancel] event append failed", { runId, error });
  }
  await failRun(runId, "", "cancelled");
}
