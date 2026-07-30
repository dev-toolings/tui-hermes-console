import { z } from "zod";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { respondHermesApproval } from "@/modules/runtime/hermes-adapter";
import {
  ProductRepositoryError,
  getRunCancelTarget,
  markRunStarted,
} from "./repository";

const bodySchema = z.object({
  approved: z.boolean(),
});

export type RespondApprovalResult = {
  runId: string;
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
  const { approved } = bodySchema.parse(rawBody);
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

  const runtime = await resolveHermesRuntimeConfig();
  await respondHermesApproval({
    hermesRunId: run.hermesResponseId,
    approved,
    baseUrl: runtime.baseUrl,
    token: runtime.token,
  });
  await markRunStarted(runId);

  return { runId, approved, status: "running" };
}
