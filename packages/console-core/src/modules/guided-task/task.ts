import type { GuidedDecisionKind } from "./spec";
import type { GuidedTaskDraft } from "./spec";

export type GuidedRevisionState = "draft" | "validated";
export type GuidedAttemptStatus =
  | "pending"
  | "running"
  | "awaiting_functional_validation"
  | "completed"
  | "failed";

export type GuidedTaskRevision = {
  id: string;
  taskId: string;
  number: number;
  state: GuidedRevisionState;
  contentSha256: string;
  validatedAt: string | null;
  validatedByUserId: string | null;
  requiresTechnicalApproval: boolean;
};

export type GuidedDecision = {
  id: string;
  taskId: string;
  revisionId: string;
  attemptId: string | null;
  kind: GuidedDecisionKind;
  outcome: "approved" | "rejected";
  actorUserId: string;
  actorRole: "admin" | "operator" | "requester" | "approver" | "auditor";
  idempotencyKey: string;
  decidedAt: string;
};

export type GuidedEvidence = {
  id: string;
  kind:
    | "diff"
    | "files"
    | "tests"
    | "commands"
    | "preview"
    | "summary"
    | "hermes_output"
    | "cleanup";
  label: string;
  payload: Record<string, unknown>;
  checksumSha256: string;
  createdAt: string;
};

export type GuidedAttempt = {
  id: string;
  revisionId: string;
  attemptNumber: number;
  status: GuidedAttemptStatus;
  repositoryPath: string;
  baseCommit: string;
  branchName: string;
  hermesSessionId: string | null;
  hermesOutput: string | null;
  error: string | null;
  testsPassed: boolean | null;
  evidenceComplete: boolean;
  startedAt: string | null;
  endedAt: string | null;
  cleanedUpAt: string | null;
  createdAt: string;
  evidence: GuidedEvidence[];
};

export type GuidedTaskRevisionDto = GuidedTaskRevision & {
  content: GuidedTaskDraft;
  authorUserId: string;
  createdAt: string;
};

export type GuidedTaskDto = {
  id: string;
  siteId: string;
  projectId: string;
  ownerUserId: string;
  authorUserId: string;
  title: string;
  status: "draft" | "ready" | "running" | "awaiting_validation" | "completed" | "failed";
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  revisions: GuidedTaskRevisionDto[];
  attempts: GuidedAttempt[];
  decisions: GuidedDecision[];
};

/** Projection minimale autorisée pour la liste Inbox. Le détail reste `GuidedTaskDto`. */
export type GuidedInboxTaskSummary = {
  id: string;
  title: string;
  status: GuidedTaskDto["status"];
  projectName: string;
  currentRevision: Pick<GuidedTaskRevision, "id" | "state" | "requiresTechnicalApproval"> | null;
  latestAttempt: Pick<GuidedAttempt, "id" | "revisionId" | "status"> | null;
  decisions: Array<Pick<GuidedDecision, "kind" | "outcome" | "attemptId">>;
  updatedAt: string;
};

export type GuidedInboxPage = {
  tasks: GuidedInboxTaskSummary[];
  page: { hasMore: boolean; nextCursor: string | null };
};

export class GuidedTaskContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "GuidedTaskContractError";
  }
}

function approved(decisions: readonly GuidedDecision[], kind: GuidedDecisionKind) {
  return decisions.filter((decision) => decision.kind === kind).at(-1)?.outcome === "approved";
}

export function assertGuidedAttemptCanStart(input: {
  revision: GuidedTaskRevision;
  currentRevisionId: string;
  decisions: readonly GuidedDecision[];
}) {
  if (input.revision.id !== input.currentRevisionId) {
    throw new GuidedTaskContractError(
      "STALE_TASK_REVISION",
      "Seule la révision courante peut devenir le mandat d’une tentative.",
    );
  }
  if (input.revision.state !== "validated" || !input.revision.validatedAt) {
    throw new GuidedTaskContractError(
      "TASK_REVISION_NOT_VALIDATED",
      "La révision doit être validée avant toute tentative.",
    );
  }
  if (!approved(input.decisions, "plan")) {
    throw new GuidedTaskContractError(
      "PLAN_APPROVAL_REQUIRED",
      "Le plan doit être validé avant toute tentative.",
    );
  }
  if (input.revision.requiresTechnicalApproval && !approved(input.decisions, "technical")) {
    throw new GuidedTaskContractError(
      "TECHNICAL_APPROVAL_REQUIRED",
      "Une validation technique attribuée est requise pour cette révision.",
    );
  }
  if (!approved(input.decisions, "tool")) {
    throw new GuidedTaskContractError(
      "TOOL_APPROVAL_REQUIRED",
      "L’exécution des outils de livraison doit être approuvée séparément.",
    );
  }
  return { revisionId: input.revision.id };
}

export function guidedAttemptCanBeAccepted(input: {
  status: GuidedAttemptStatus;
  evidenceComplete: boolean;
  testsPassed: boolean;
  decisions: readonly GuidedDecision[];
}) {
  return (
    input.status === "completed" &&
    input.evidenceComplete &&
    input.testsPassed &&
    approved(input.decisions, "functional")
  );
}
