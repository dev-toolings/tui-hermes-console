import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { APPROVAL_CHOICES } from "@console/core/lib/thread-snapshot-mutations";
import type { SiteRequestContext, SiteScope } from "@/modules/auth/service";
import type { AppendAuditEntryInput } from "@/modules/audit/service";
import type { RunCancelTarget } from "./repository";
import { enforceHermesApproval, HermesPolicyError, policyAuthorityFromKeys } from "@/modules/policy/hermes-approval";
import { generateDecisionKeyPair } from "@/modules/policy/decision-envelope";

/**
 * Contrat d'autorisation — Hermes valide `choice`, pas un booléen.
 *
 * Le runtime répond `400 Invalid approval choice; expected one of: once,
 * session, always, deny` à tout ce qui n'est pas ce vocabulaire. Le schéma de la
 * route doit donc rejeter en amont ce que le runtime rejetterait de toute façon,
 * plutôt que de relayer un corps invalide et d'afficher son 400 à l'utilisateur.
 */
describe("respondRunApproval contract", () => {
  test("expose la fonction et la forme de résultat documentée", async () => {
    const mod = await import("./respond-approval");
    expect(typeof mod.respondRunApproval).toBe("function");

    type Result = Awaited<ReturnType<typeof mod.respondRunApproval>>;
    const sample: Result = {
      runId: "run_x",
      choice: "once",
      approved: true,
      status: "running",
    };
    expect(sample.approved).toBe(sample.choice !== "deny");
  });

  test("le vocabulaire accepté est exactement celui d’Hermes", () => {
    const schema = z.object({ choice: z.enum(APPROVAL_CHOICES) });

    for (const choice of APPROVAL_CHOICES) {
      expect(schema.safeParse({ choice }).success).toBe(true);
    }
    // L'ancien corps `{ approved: boolean }` est précisément celui qui a produit
    // le 400 en production : il ne doit plus jamais passer pour valide.
    expect(schema.safeParse({ approved: true }).success).toBe(false);
    expect(schema.safeParse({ choice: "yolo" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  test("`deny` est le seul choix qui refuse", () => {
    const approvedFor = (choice: string) => choice !== "deny";
    expect(APPROVAL_CHOICES.filter((choice) => !approvedFor(choice))).toEqual(["deny"]);
  });
});

const context: SiteRequestContext = {
  siteId: "site-approval",
  userId: "user-approver",
  role: "approver",
  actorOrganizationId: "org-client",
  clientOrganizationId: "org-client",
  mandateId: null,
  mandateProjectId: null,
  correlationId: "corr-approval",
};

const run: RunCancelTarget = {
  id: "run-approval",
  siteId: context.siteId,
  projectId: null,
  threadId: "thread-approval",
  status: "awaiting_approval",
  hermesResponseId: "hermes-run-approval",
  input: "sensitive action",
};
const claim = { ...run, approvalClaimId: "claim-approval" };

const runtime = {
  baseUrl: "http://hermes.test",
  remoteBaseUrl: "http://hermes.test",
  token: "runtime-token",
  transport: "direct" as const,
  source: "database" as const,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const audits: AppendAuditEntryInput[] = [];
  const remoteCalls: unknown[] = [];
  const releases: string[] = [];
  const persistedReleases: string[] = [];
  const persistedResolutions: string[] = [];
  const persisted = {
    id: "approval-row",
    siteId: context.siteId,
    runId: run.id,
    hermesRunId: run.hermesResponseId!,
    approvalRequestId: "approval_1",
    nonce: "nonce-approval",
    claimState: "pending" as const,
    outcome: null,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    claimedAt: null,
    resolvedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const policyKeys = generateDecisionKeyPair();
  return {
    audits,
    remoteCalls,
    releases,
    persistedReleases,
    persistedResolutions,
    persisted,
    lookup: async () => run,
    claim: async () => claim,
    release: async (_scope: SiteScope, runId: string, _claimId: string) => { releases.push(runId); },
    finalize: async () => undefined,
    claimPersisted: async () => ({ ...persisted, claimState: "claimed" as const, claimedAt: new Date() }),
    releasePersisted: async () => { persistedReleases.push(run.id); return persisted; },
    resolvePersisted: async (_scope: unknown, rawOutcome: unknown) => {
      const outcome = rawOutcome as "once" | "deny";
      persistedResolutions.push(outcome);
      return { ...persisted, claimState: "resolved" as const, outcome, resolvedAt: new Date() };
    },
    resolveRuntime: async () => runtime,
    respondRemote: async (input: unknown) => { remoteCalls.push(input); },
    enforce: (input: Parameters<typeof enforceHermesApproval>[0]) =>
      enforceHermesApproval(input, {
        authority: policyAuthorityFromKeys(policyKeys),
        now: () => Date.parse("2026-01-01T00:00:00.000Z"),
      }),
    isReconciled: () => true,
    resume: () => undefined,
    audit: async (input: AppendAuditEntryInput) => {
      audits.push(input);
      return {} as Awaited<ReturnType<typeof import("@/modules/audit/service").appendAuditEntry>>;
    },
    ...overrides,
  };
}

describe("respondRunApproval G1-004B claim and truthful audit", () => {
  test("requires the persisted approval identity before any remote call", async () => {
    const deps = dependencies({
      claimPersisted: async () => {
        const { ApprovalRequestError } = await import("./approval-requests");
        throw new ApprovalRequestError("APPROVAL_REQUEST_SCOPE_MISMATCH", "wrong request", 404);
      },
    });
    await expect(
      (await import("./respond-approval")).respondRunApproval(
        context,
        run.id,
        { choice: "once", approvalRequestId: "approval_wrong" },
        deps,
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUEST_SCOPE_MISMATCH", status: 404 });
    expect(deps.remoteCalls).toHaveLength(0);
    expect(deps.releases).toEqual([run.id]);
  });

  test("writes intent before Hermes and resolves only after the remote result", async () => {
    const order: string[] = [];
    const deps = dependencies({
      audit: async (input: AppendAuditEntryInput) => {
        order.push(input.reasonCode === "RUN_APPROVAL_INTENT" ? "intent" : "outcome");
        return {} as Awaited<ReturnType<typeof import("@/modules/audit/service").appendAuditEntry>>;
      },
      respondRemote: async () => { order.push("remote"); },
      resolvePersisted: async (_scope: unknown, rawOutcome: unknown) => {
        order.push(`resolve:${String(rawOutcome)}`);
        return { ...dependencies().persisted, claimState: "resolved" as const, outcome: rawOutcome as "once" | "deny" };
      },
    });
    await (await import("./respond-approval")).respondRunApproval(
      context,
      run.id,
      { choice: "once", approvalRequestId: "approval_1" },
      deps,
    );
    expect(order).toEqual(["intent", "remote", "resolve:once", "outcome"]);
  });

  test("claims once, calls Hermes, then records an allowed decision", async () => {
    const deps = dependencies();
    const result = await (await import("./respond-approval")).respondRunApproval(
      context,
      run.id,
      { choice: "once", approvalRequestId: "approval_1" },
      deps,
    );

    expect(result).toEqual({ runId: run.id, choice: "once", approved: true, status: "running" });
    expect(deps.remoteCalls).toHaveLength(1);
    expect(deps.audits).toHaveLength(2);
    expect(deps.audits.at(-1)).toMatchObject({
      decision: "allowed",
      reasonCode: "RUN_APPROVAL_ALLOWED",
      beforeState: { status: "running", approvalClaimed: true },
      afterState: { status: "running", approvalClaimed: false, choice: "once", approved: true },
    });
  });

  test("force la reconnexion si la réconciliation a déjà un flux actif", async () => {
    const resumeCalls: unknown[][] = [];
    const deps = dependencies({
      resume: (...args: unknown[]) => { resumeCalls.push(args); },
    });

    await (await import("./respond-approval")).respondRunApproval(
      context,
      run.id,
      { choice: "once", approvalRequestId: "approval_1" },
      deps,
    );

    expect(resumeCalls).toHaveLength(1);
    expect(resumeCalls[0]?.[4]).toEqual({ force: true });
  });

  test("records deny as denied after the remote decision", async () => {
    const deps = dependencies();
    await (await import("./respond-approval")).respondRunApproval(
      context,
      run.id,
      { choice: "deny", approvalRequestId: "approval_1" },
      deps,
    );

    expect(deps.remoteCalls).toHaveLength(1);
    expect(deps.audits.at(-1)).toMatchObject({
      decision: "denied",
      reasonCode: "RUN_APPROVAL_DENIED",
      beforeState: { status: "running", choice: "deny", approved: false },
      afterState: { status: "running", choice: "deny", approved: false },
    });
    expect(deps.audits.at(-1)?.beforeState).toEqual(deps.audits.at(-1)?.afterState);
    expect(deps.audits.at(-1)?.afterState).toMatchObject({
      policyDecision: { actionKind: "hermes.run.approval" },
    });
  });

  test("releases the claim and never writes allowed when Hermes fails", async () => {
    const deps = dependencies({
      respondRemote: async () => {
        const { HermesRuntimeError } = await import("@/modules/runtime/hermes-adapter");
        throw new HermesRuntimeError("hermes unavailable", 400, "HERMES_HTTP_ERROR");
      },
    });

    await expect(
      (await import("./respond-approval")).respondRunApproval(context, run.id, { choice: "once", approvalRequestId: "approval_1" }, deps),
    ).rejects.toThrow("hermes unavailable");
    expect(deps.releases).toEqual([run.id]);
    expect(deps.audits.at(-1)).toMatchObject({
      decision: "denied",
      reasonCode: "RUN_APPROVAL_REMOTE_FAILED",
    });
    expect(deps.audits.some((entry) =>
      entry.decision === "allowed" && entry.reasonCode !== "RUN_APPROVAL_INTENT"
    )).toBe(false);
  });

  test("fails closed before Hermes when the policy is denied", async () => {
    const deps = dependencies({
      enforce: async () => {
        throw new HermesPolicyError("HERMES_POLICY_DENIED", "policy denied", 403);
      },
    });

    await expect(
      (await import("./respond-approval")).respondRunApproval(
        context,
        run.id,
        { choice: "once", approvalRequestId: "approval_1" },
        deps,
      ),
    ).rejects.toMatchObject({ code: "HERMES_POLICY_DENIED", status: 403 });
    expect(deps.remoteCalls).toHaveLength(0);
    expect(deps.releases).toEqual([run.id]);
    expect(deps.persistedReleases).toEqual([run.id]);
    expect(deps.audits.at(-1)).toMatchObject({
      decision: "denied",
      reasonCode: "RUN_APPROVAL_POLICY_FAILED",
    });
  });

  test("keeps the durable claim when the remote result is ambiguous", async () => {
    const deps = dependencies({
      respondRemote: async () => { throw new Error("connection lost after send"); },
    });

    await expect(
      (await import("./respond-approval")).respondRunApproval(context, run.id, { choice: "once", approvalRequestId: "approval_1" }, deps),
    ).rejects.toThrow("connection lost after send");
    expect(deps.releases).toHaveLength(0);
    expect(deps.audits.at(-1)).toMatchObject({
      decision: "denied",
      reasonCode: "RUN_APPROVAL_REMOTE_UNKNOWN",
      beforeState: { status: "running", choice: "once" },
      afterState: { status: "running", choice: "once" },
    });
  });

  test("does not call Hermes when the atomic claim was already consumed", async () => {
    const deps = dependencies({ claim: async () => null });

    await expect(
      (await import("./respond-approval")).respondRunApproval(context, run.id, { choice: "once", approvalRequestId: "approval_1" }, deps),
    ).rejects.toMatchObject({ code: "RUN_NOT_AWAITING_APPROVAL" });
    expect(deps.remoteCalls).toHaveLength(0);
    expect(deps.audits).toHaveLength(0);
  });
});
