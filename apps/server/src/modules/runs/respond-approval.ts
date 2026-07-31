import { z } from "zod";
import {
  APPROVAL_CHOICES,
  type ApprovalChoice,
} from "@console/core/lib/thread-snapshot-mutations";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { respondHermesApproval } from "@/modules/runtime/hermes-adapter";
import {
  ProductRepositoryError,
  getRunCancelTarget,
  markRunStarted,
} from "./repository";
import { isRunActive, resumeAgentRun } from "./runner";

const bodySchema = z.object({
  choice: z.enum(APPROVAL_CHOICES),
});

export type RespondApprovalResult = {
  runId: string;
  choice: ApprovalChoice;
  approved: boolean;
  status: "running";
};

/**
 * Relaye une décision humaine vers Hermes (`POST /v1/runs/:id/approval`)
 * puis repasse la mission en `running` (PRD §9.5).
 */
export async function respondRunApproval(
  runId: string,
  rawBody: unknown,
): Promise<RespondApprovalResult> {
  const { choice } = bodySchema.parse(rawBody);
  const run = await getRunCancelTarget(runId);
  if (!run) {
    throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
  }
  if (run.status !== "awaiting_approval") {
    throw new ProductRepositoryError(
      "RUN_NOT_AWAITING_APPROVAL",
      "Cette mission n’attend pas d’autorisation.",
    );
  }
  if (!run.hermesResponseId) {
    throw new ProductRepositoryError(
      "RUN_NOT_FOUND",
      "Aucun identifiant Hermes pour cette mission.",
    );
  }

  const approved = choice !== "deny";
  const runtime = await resolveHermesRuntimeConfig();
  await respondHermesApproval({
    hermesRunId: run.hermesResponseId,
    choice,
    approved,
    baseUrl: runtime.baseUrl,
    token: runtime.token,
  });
  await markRunStarted(runId);

  // Une demande d'autorisation attend un humain : le flux SSE a pu tomber
  // entre-temps (tunnel, veille, socket fermée) sans que la mission échoue.
  // Répondre ne sert à rien si plus personne n'écoute Hermes — on se rebranche.
  if (!isRunActive(runId)) {
    resumeAgentRun(runId, run.hermesResponseId, runtime);
  }

  return { runId, choice, approved, status: "running" };
}
