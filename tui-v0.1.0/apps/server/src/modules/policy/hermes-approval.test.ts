import { describe, expect, test } from "bun:test";
import { generateDecisionKeyPair, payloadSha256 } from "./decision-envelope";
import {
  enforceHermesApproval,
  hermesApprovalPayload,
  loadHermesPolicyAuthority,
  policyAuthorityFromKeys,
} from "./hermes-approval";
import type { SiteRequestContext } from "@/modules/auth/service";

const NOW = 1_700_000_000_000;
const context: SiteRequestContext = {
  siteId: "site-policy",
  userId: "user-policy",
  role: "approver",
  actorOrganizationId: "org-policy",
  clientOrganizationId: "org-policy",
  mandateId: null,
  mandateProjectId: null,
  correlationId: "correlation-policy",
};

function input(effect: () => unknown | Promise<unknown>) {
  return {
    context,
    runId: "run-policy",
    hermesRunId: "hermes-policy",
    approvalRequestId: "approval-policy",
    approvalNonce: "nonce-policy",
    runtimeBaseUrl: "http://hermes.test",
    choice: "once" as const,
    approved: true,
    effect,
  };
}

describe("Hermes pre-effect policy boundary", () => {
  test("signs the exact Hermes approval payload and runs the effect once", async () => {
    const keys = generateDecisionKeyPair();
    let effects = 0;
    const request = input(() => {
      effects += 1;
      return "remote-ok";
    });
    const result = await enforceHermesApproval(request, {
      authority: policyAuthorityFromKeys(keys),
      now: () => NOW,
    });

    expect(result.effectResult).toBe("remote-ok");
    expect(effects).toBe(1);
    expect(result.decision.actionKind).toBe("hermes.run.approval");
    expect(result.decision.payloadSha256).toBe(payloadSha256(hermesApprovalPayload(request)));
    expect(result.decision.runId).toBe(request.runId);
    expect(result.decision.scopeId).toBe(request.approvalRequestId);
    expect(result.decision.approverUserId).toBe(context.userId);
  });

  test("fails closed when the server policy key is absent", async () => {
    expect(() => loadHermesPolicyAuthority({})).toThrow("La policy Hermes n’est pas configurée");
    let effects = 0;
    await expect(
      enforceHermesApproval(input(() => { effects += 1; }), {
        loadAuthority: () => loadHermesPolicyAuthority({}),
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "HERMES_POLICY_UNAVAILABLE", status: 503 });
    expect(effects).toBe(0);
  });

  test("does not hide an error raised by the remote effect", async () => {
    const keys = generateDecisionKeyPair();
    await expect(
      enforceHermesApproval(input(() => { throw new Error("remote failed"); }), {
        authority: policyAuthorityFromKeys(keys),
        now: () => NOW,
      }),
    ).rejects.toThrow("remote failed");
  });
});
