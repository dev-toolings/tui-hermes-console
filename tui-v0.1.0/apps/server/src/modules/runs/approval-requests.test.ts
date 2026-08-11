import { describe, expect, test } from "bun:test";
import {
  approvalRequestInputSchema,
  approvalOutcomeSchema,
  calculateApprovalExpiry,
  assertApprovalScope,
  ApprovalRequestError,
  type PersistedApprovalRequest,
} from "./approval-requests";

describe("persisted approval request contracts", () => {
  test("accepts a strict Hermes request identity and bounds TTL", () => {
    expect(
      approvalRequestInputSchema.parse({
        runId: "run_1",
        hermesRunId: "hermes_1",
        approvalRequestId: "approval_1",
      }),
    ).toMatchObject({
      runId: "run_1",
      hermesRunId: "hermes_1",
      approvalRequestId: "approval_1",
    });
    expect(() =>
      approvalRequestInputSchema.parse({
        runId: "run_1",
        hermesRunId: "hermes_1",
        approvalRequestId: "approval_1",
        ttlSeconds: 0,
      }),
    ).toThrow();
    expect(() =>
      approvalRequestInputSchema.parse({
        runId: "run_1",
        hermesRunId: "hermes_1",
        approvalRequestId: "approval_1",
        siteId: "forged-site",
      }),
    ).toThrow();
  });

  test("expiry is deterministic and cannot exceed the service TTL ceiling", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    expect(calculateApprovalExpiry(now, 30).toISOString()).toBe("2026-08-01T12:00:30.000Z");
    expect(() => calculateApprovalExpiry(now, 3_601)).toThrow(ApprovalRequestError);
  });

  test("only one-shot outcomes are persisted by this local slice", () => {
    expect(approvalOutcomeSchema.parse("once")).toBe("once");
    expect(approvalOutcomeSchema.parse("deny")).toBe("deny");
    expect(() => approvalOutcomeSchema.parse("always")).toThrow();
  });

  test("scope assertion rejects cross-site, cross-run, and cross-Hermes reuse", () => {
    const row = {
      siteId: "site_a",
      runId: "run_a",
      hermesRunId: "hermes_a",
      approvalRequestId: "approval_a",
    } satisfies Pick<
      PersistedApprovalRequest,
      "siteId" | "runId" | "hermesRunId" | "approvalRequestId"
    >;
    expect(() => assertApprovalScope(row, row)).not.toThrow();
    expect(() => assertApprovalScope(row, { ...row, siteId: "site_b" })).toThrow(
      "APPROVAL_REQUEST_SCOPE_MISMATCH",
    );
    expect(() => assertApprovalScope(row, { ...row, hermesRunId: "hermes_b" })).toThrow(
      "APPROVAL_REQUEST_SCOPE_MISMATCH",
    );
  });
});
