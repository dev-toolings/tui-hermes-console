import { createHash, randomUUID } from "node:crypto";
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
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { denySiteAction } from "@/modules/auth/site-authorization";
import { appendAuditEntry } from "@/modules/audit/service";

const bodySchema = z.object({
  choice: z.enum(APPROVAL_CHOICES),
}).strict();

export type RespondApprovalResult = {
  runId: string;
  choice: ApprovalChoice;
  approved: boolean;
  status: "running";
};

type ApprovalDependencies = {
  resolveRuntime: typeof resolveHermesRuntimeConfig;
  respondRemote: typeof respondHermesApproval;
  isActive: typeof isRunActive;
  resume: typeof resumeAgentRun;
};

/**
 * Relaye une décision humaine vers Hermes (`POST /v1/runs/:id/approval`)
 * puis repasse la mission en `running` (PRD §9.5).
 */
export async function respondRunApproval(
  context: SiteRequestContext,
  runId: string,
  rawBody: unknown,
  dependencies: ApprovalDependencies = {
    resolveRuntime: resolveHermesRuntimeConfig,
    respondRemote: respondHermesApproval,
    isActive: isRunActive,
    resume: resumeAgentRun,
  },
): Promise<RespondApprovalResult> {
  const { choice } = bodySchema.parse(rawBody);
  if (choice === "session" || choice === "always") {
    await denySiteAction(context, {
      action: "run.approve",
      resourceType: "run",
      resourceId: `sha256:${createHash("sha256").update(runId).digest("hex")}`,
      reasonCode: "PERSISTENT_APPROVAL_UNSUPPORTED",
      state: { choice },
      error: {
        message: "Les décisions persistantes ne sont pas disponibles.",
        status: 403,
        code: "PERSISTENT_APPROVAL_UNSUPPORTED",
      },
    });
  }
  const run = await getRunCancelTarget(context, runId);
  if (!run) {
    await auditScopedMiss(context, { action: "run.approval", resourceType: "run", resourceId: runId });
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
  await appendAuditEntry({
    eventId: randomUUID(),
    actorSiteId: context.siteId,
    targetSiteId: context.siteId,
    actorUserId: context.userId,
    actorRole: context.role,
    actorOrganizationId: context.actorOrganizationId,
    clientOrganizationId: context.clientOrganizationId,
    mandateId: context.mandateId,
    action: "run.approve",
    resourceType: "run",
    resourceId: runId,
    decision: "allowed",
    reasonCode: "RUN_APPROVAL_ALLOWED",
    beforeState: { status: run.status },
    afterState: { choice, approved },
    correlationId: context.correlationId,
    occurredAt: new Date(),
  });
  const runtime = await dependencies.resolveRuntime();
  await dependencies.respondRemote({
    hermesRunId: run.hermesResponseId,
    choice,
    approved,
    baseUrl: runtime.baseUrl,
    token: runtime.token,
  });
  await markRunStarted(context, runId);

  // Une demande d'autorisation attend un humain : le flux SSE a pu tomber
  // entre-temps (tunnel, veille, socket fermée) sans que la mission échoue.
  // Répondre ne sert à rien si plus personne n'écoute Hermes — on se rebranche.
  if (!dependencies.isActive(runId)) {
    dependencies.resume(context, runId, run.hermesResponseId, runtime);
  }

  return { runId, choice, approved, status: "running" };
}
