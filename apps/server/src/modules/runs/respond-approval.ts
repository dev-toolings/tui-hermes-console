import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  APPROVAL_CHOICES,
  type ApprovalChoice,
} from "@console/core/lib/thread-snapshot-mutations";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { HermesRuntimeError, respondHermesApproval } from "@/modules/runtime/hermes-adapter";
import {
  ProductRepositoryError,
  claimRunApproval,
  finalizeRunApprovalClaim,
  getRunCancelTarget,
  releaseRunApprovalClaim,
} from "./repository";
import { isRunActive, resumeAgentRun } from "./runner";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { assertSiteAction, denySiteAction } from "@/modules/auth/site-authorization";
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
  lookup?: typeof getRunCancelTarget;
  claim?: typeof claimRunApproval;
  release?: typeof releaseRunApprovalClaim;
  finalize?: typeof finalizeRunApprovalClaim;
  audit?: typeof appendAuditEntry;
};

function canReleaseApprovalClaim(error: unknown, remoteAttempted: boolean) {
  if (!remoteAttempted) return true;
  // A 4xx response is a definitive Hermes refusal. Network errors and 5xx
  // responses are ambiguous: Hermes may have accepted the request before the
  // connection failed, so the durable claim must stay in place for reconcile.
  return error instanceof HermesRuntimeError && error.status >= 400 && error.status < 500;
}

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
  // Routes already enforce this action, but keep the service fail-closed when
  // it is called directly by a worker or another internal entry point.
  await assertSiteAction(context, "run.approve");
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
  const run = await (dependencies.lookup ?? getRunCancelTarget)(context, runId);
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
  const claimed = await (dependencies.claim ?? claimRunApproval)(context, runId);
  if (!claimed) {
    throw new ProductRepositoryError(
      "RUN_NOT_AWAITING_APPROVAL",
      "Cette mission n’attend plus d’autorisation.",
    );
  }

  const audit = dependencies.audit ?? appendAuditEntry;
  let runtime: Awaited<ReturnType<typeof dependencies.resolveRuntime>>;
  let remoteAttempted = false;
  try {
    runtime = await dependencies.resolveRuntime();
    remoteAttempted = true;
    await dependencies.respondRemote({
      hermesRunId: claimed.hermesResponseId!,
      choice,
      approved,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
    });
  } catch (error) {
    const releaseClaim = canReleaseApprovalClaim(error, remoteAttempted);
    if (releaseClaim) {
      await (dependencies.release ?? releaseRunApprovalClaim)(context, runId, claimed.approvalClaimId);
    }
    // An ambiguous remote failure never becomes an allowed audit entry and
    // keeps the claim for reconciliation. Denied ledger states remain equal.
    await audit({
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
      decision: "denied",
      reasonCode: releaseClaim ? "RUN_APPROVAL_REMOTE_FAILED" : "RUN_APPROVAL_REMOTE_UNKNOWN",
      beforeState: releaseClaim
        ? { status: "awaiting_approval", choice }
        : { status: "running", choice },
      afterState: releaseClaim
        ? { status: "awaiting_approval", choice }
        : { status: "running", choice },
      correlationId: context.correlationId,
      occurredAt: new Date(),
    });
    throw error;
  }

  await audit({
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
    decision: approved ? "allowed" : "denied",
    reasonCode: approved ? "RUN_APPROVAL_ALLOWED" : "RUN_APPROVAL_DENIED",
    beforeState: approved
      ? { status: "running", approvalClaimed: true }
      : { status: "running", choice, approved: false },
    afterState: approved
      ? { status: "running", approvalClaimed: false, choice, approved }
      : { status: "running", choice, approved: false },
    correlationId: context.correlationId,
    occurredAt: new Date(),
  });
  await (dependencies.finalize ?? finalizeRunApprovalClaim)(context, runId, claimed.approvalClaimId);

  // Une demande d'autorisation attend un humain : le flux SSE a pu tomber
  // entre-temps (tunnel, veille, socket fermée) sans que la mission échoue.
  // Répondre ne sert à rien si plus personne n'écoute Hermes — on se rebranche.
  if (!dependencies.isActive(runId)) {
    dependencies.resume(context, runId, claimed.hermesResponseId!, runtime);
  }

  return { runId, choice, approved, status: "running" };
}
