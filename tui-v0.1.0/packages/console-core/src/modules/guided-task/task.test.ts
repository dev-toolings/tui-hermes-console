import { describe, expect, test } from "bun:test";
import {
  assertGuidedAttemptCanStart,
  guidedAttemptCanBeAccepted,
  type GuidedDecision,
  type GuidedTaskRevision,
} from "./task";

const revision = (overrides: Partial<GuidedTaskRevision> = {}): GuidedTaskRevision => ({
  id: "rev_2",
  taskId: "task_1",
  number: 2,
  state: "validated",
  contentSha256: "a".repeat(64),
  validatedAt: "2026-08-06T08:00:00.000Z",
  validatedByUserId: "requester_1",
  requiresTechnicalApproval: false,
  ...overrides,
});

const decision = (
  kind: GuidedDecision["kind"],
  outcome: GuidedDecision["outcome"] = "approved",
): GuidedDecision => ({
  id: `decision_${kind}`,
  taskId: "task_1",
  revisionId: "rev_2",
  attemptId: kind === "functional" ? "attempt_1" : null,
  kind,
  outcome,
  actorUserId: `${kind}_actor`,
  actorRole: kind === "technical" || kind === "tool" ? "approver" : "requester",
  idempotencyKey: `key_${kind}`,
  decidedAt: "2026-08-06T08:01:00.000Z",
});

describe("guided task lifecycle", () => {
  test("starts only from the current validated revision with a distinct tool approval", () => {
    expect(() =>
      assertGuidedAttemptCanStart({
        revision: revision(),
        currentRevisionId: "rev_2",
        decisions: [decision("plan")],
      }),
    ).toThrow("TOOL_APPROVAL_REQUIRED");

    expect(
      assertGuidedAttemptCanStart({
        revision: revision(),
        currentRevisionId: "rev_2",
        decisions: [decision("plan"), decision("tool")],
      }),
    ).toEqual({ revisionId: "rev_2" });

    expect(() =>
      assertGuidedAttemptCanStart({
        revision: revision({ id: "rev_1", number: 1 }),
        currentRevisionId: "rev_2",
        decisions: [decision("plan"), decision("tool")],
      }),
    ).toThrow("STALE_TASK_REVISION");
  });

  test("requires a developer approval for a sensitive revision", () => {
    expect(() =>
      assertGuidedAttemptCanStart({
        revision: revision({ requiresTechnicalApproval: true }),
        currentRevisionId: "rev_2",
        decisions: [decision("plan"), decision("tool")],
      }),
    ).toThrow("TECHNICAL_APPROVAL_REQUIRED");

    expect(
      assertGuidedAttemptCanStart({
        revision: revision({ requiresTechnicalApproval: true }),
        currentRevisionId: "rev_2",
        decisions: [decision("plan"), decision("technical"), decision("tool")],
      }),
    ).toEqual({ revisionId: "rev_2" });
  });

  test("a later rejection revokes an earlier approval", () => {
    expect(() =>
      assertGuidedAttemptCanStart({
        revision: revision(),
        currentRevisionId: "rev_2",
        decisions: [
          decision("plan"),
          decision("tool"),
          { ...decision("tool", "rejected"), id: "decision_tool_rejected", decidedAt: "2026-08-06T08:02:00.000Z" },
        ],
      }),
    ).toThrow("TOOL_APPROVAL_REQUIRED");
  });

  test("never accepts a result without complete verified evidence", () => {
    expect(
      guidedAttemptCanBeAccepted({
        status: "completed",
        evidenceComplete: false,
        testsPassed: true,
        decisions: [decision("functional")],
      }),
    ).toBe(false);
    expect(
      guidedAttemptCanBeAccepted({
        status: "completed",
        evidenceComplete: true,
        testsPassed: false,
        decisions: [decision("functional")],
      }),
    ).toBe(false);
    expect(
      guidedAttemptCanBeAccepted({
        status: "completed",
        evidenceComplete: true,
        testsPassed: true,
        decisions: [decision("functional")],
      }),
    ).toBe(true);
  });
});
