import type { HermesRunStatus } from "@/modules/runtime/hermes-adapter";
import type { Usage } from "@/db/schema";

export type ReconcileDecision =
  | { action: "complete"; output: string; usage: Usage | null }
  | { action: "fail"; message: string }
  | { action: "cancel" }
  | { action: "resume" };

/**
 * Décision pure de réconciliation à partir du statut Hermes (PRD §15).
 * Isolée pour tests unitaires sans I/O.
 */
export function decideReconcileAction(input: {
  status: HermesRunStatus;
  output: string | null;
  usage: Usage | null;
}): ReconcileDecision {
  switch (input.status) {
    case "completed":
      return {
        action: "complete",
        output: input.output ?? "",
        usage: input.usage,
      };
    case "failed":
      return {
        action: "fail",
        message:
          input.output?.trim() || "Mission échouée côté Hermes (réconciliation).",
      };
    case "cancelled":
      return { action: "cancel" };
    case "started":
    case "running":
    case "stopping":
    case "waiting_for_approval":
      return { action: "resume" };
    default:
      return {
        action: "fail",
        message: `État Hermes inconnu après redémarrage : ${String(input.status)}.`,
      };
  }
}
