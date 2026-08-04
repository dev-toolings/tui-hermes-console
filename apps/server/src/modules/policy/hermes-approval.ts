import {
  createPrivateKey,
  createPublicKey,
  createHash,
  type KeyObject,
} from "node:crypto";
import type { ApprovalChoice } from "@console/core/lib/thread-snapshot-mutations";
import type { SiteRequestContext } from "@/modules/auth/service";
import {
  createDecisionEnvelope,
  encodePublicKey,
  keyIdForPublicKey,
  type DecisionEnvelope,
  type DecisionRequestScope,
} from "./decision-envelope";
import {
  createReferenceEnforcer,
  type ReferencePolicyResolver,
} from "./reference-enforcer";

export const HERMES_APPROVAL_ACTION = "hermes.run.approval" as const;

export type HermesApprovalPolicyInput = {
  context: SiteRequestContext;
  runId: string;
  hermesRunId: string;
  approvalRequestId: string;
  approvalNonce: string;
  runtimeBaseUrl: string;
  choice: ApprovalChoice;
  approved: boolean;
  effect: () => unknown | Promise<unknown>;
};

export type HermesPolicyAuthority = {
  privateKey: KeyObject;
  publicKey: string;
};

export type HermesApprovalPolicyResult = {
  decision: DecisionEnvelope;
  effectResult: unknown;
};

export class HermesPolicyError extends Error {
  constructor(
    readonly code:
      | "HERMES_POLICY_UNAVAILABLE"
      | "HERMES_POLICY_DENIED"
      | "HERMES_POLICY_INVALID",
    message: string,
    readonly status: 403 | 503 = code === "HERMES_POLICY_DENIED" ? 403 : 503,
  ) {
    super(message);
    this.name = "HermesPolicyError";
  }
}

/** Exact bytes covered by the signed decision and sent to the runtime effect. */
export function hermesApprovalPayload(input: Pick<
  HermesApprovalPolicyInput,
  "hermesRunId" | "runtimeBaseUrl" | "choice" | "approved"
>) {
  return JSON.stringify({
    method: "POST",
    url: `${input.runtimeBaseUrl.replace(/\/+$/, "")}/v1/runs/${encodeURIComponent(input.hermesRunId)}/approval`,
    body: { choice: input.choice, approved: input.approved },
  });
}

function decisionNonceForApproval(input: Pick<HermesApprovalPolicyInput, "runId" | "approvalRequestId" | "approvalNonce">) {
  return createHash("sha256")
    .update("hermes-console/hermes-approval-decision/v1\0", "utf8")
    .update(input.runId, "utf8")
    .update("\0", "utf8")
    .update(input.approvalRequestId, "utf8")
    .update("\0", "utf8")
    .update(input.approvalNonce, "utf8")
    .digest("base64url");
}

export function policyAuthorityFromKeys(input: {
  privateKey: KeyObject;
  publicKey?: string;
}): HermesPolicyAuthority {
  const derivedPublicKey = encodePublicKey(createPublicKey(input.privateKey));
  if (input.publicKey && input.publicKey !== derivedPublicKey) {
    throw new HermesPolicyError(
      "HERMES_POLICY_INVALID",
      "La clé publique de policy ne correspond pas à la clé privée.",
    );
  }
  return { privateKey: input.privateKey, publicKey: input.publicKey ?? derivedPublicKey };
}

function decodePrivateKey(value: string, name: string) {
  try {
    return createPrivateKey({
      key: Buffer.from(value, "base64url"),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    throw new HermesPolicyError(
      "HERMES_POLICY_INVALID",
      `${name} n’est pas une clé Ed25519 DER base64url valide.`,
    );
  }
}

/**
 * The signing key stays in the Console server environment. It is never sent
 * to the browser, Hermes, an audit payload, or a transcript. Missing config is
 * deliberately an unavailable policy, not an implicit allow.
 */
export function loadHermesPolicyAuthority(
  env: Record<string, string | undefined> = process.env,
): HermesPolicyAuthority {
  const privateKeyValue = env.HERMES_POLICY_PRIVATE_KEY_B64URL?.trim();
  const publicKeyValue = env.HERMES_POLICY_PUBLIC_KEY_B64URL?.trim();
  if (!privateKeyValue) {
    throw new HermesPolicyError(
      "HERMES_POLICY_UNAVAILABLE",
      "La policy Hermes n’est pas configurée : clé privée absente.",
    );
  }

  const privateKey = decodePrivateKey(privateKeyValue, "HERMES_POLICY_PRIVATE_KEY_B64URL");
  let publicKey: string | undefined;
  if (publicKeyValue) {
    try {
      const publicKeyObject = createPublicKey({
        key: Buffer.from(publicKeyValue, "base64url"),
        format: "der",
        type: "spki",
      });
      publicKey = encodePublicKey(publicKeyObject);
    } catch {
      throw new HermesPolicyError(
        "HERMES_POLICY_INVALID",
        "HERMES_POLICY_PUBLIC_KEY_B64URL n’est pas une clé Ed25519 DER base64url valide.",
      );
    }
  }
  return policyAuthorityFromKeys({ privateKey, publicKey });
}

function policyFor(input: HermesApprovalPolicyInput): ReferencePolicyResolver {
  return ({ envelope, scope }: { envelope: DecisionEnvelope; scope: DecisionRequestScope }) => {
    if (
      envelope.approverUserId !== input.context.userId ||
      envelope.approverRole !== input.context.role ||
      scope.siteId !== input.context.siteId ||
      scope.runId !== input.runId ||
      scope.correlationId !== input.context.correlationId ||
      scope.scopeId !== input.approvalRequestId
    ) {
      return {
        available: true,
        allowed: false,
        reason: "L’identité ou la portée de l’approbation ne correspond pas à la demande.",
      };
    }
    return { available: true, allowed: true };
  };
}

export async function enforceHermesApproval(
  input: HermesApprovalPolicyInput,
  dependencies: {
    authority?: HermesPolicyAuthority;
    loadAuthority?: () => HermesPolicyAuthority;
    now?: () => number;
  } = {},
): Promise<HermesApprovalPolicyResult> {
  const authority = dependencies.authority ?? (dependencies.loadAuthority ?? loadHermesPolicyAuthority)();
  const scope = {
    requestId: input.approvalRequestId,
    runId: input.runId,
    siteId: input.context.siteId,
    correlationId: input.context.correlationId,
    actionKind: HERMES_APPROVAL_ACTION,
    scopeId: input.approvalRequestId,
  } as const;
  const payload = hermesApprovalPayload(input);
  const issuedAtMs = (dependencies.now ?? Date.now)();
  const decision = createDecisionEnvelope({
    ...scope,
    privateKey: authority.privateKey,
    publicKey: authority.publicKey,
    outcome: "allow",
    payload,
    approverUserId: input.context.userId,
    approverRole: input.context.role,
    issuedAtMs,
    nonce: decisionNonceForApproval(input),
  });
  const enforcer = createReferenceEnforcer({
    trustedPublicKeys: [authority.publicKey],
    trustedKeyIds: [keyIdForPublicKey(authority.publicKey)],
    now: dependencies.now,
    policy: policyFor(input),
  });

  let effectStarted = false;
  try {
    const effectResult = await enforcer.execute({
      envelope: decision,
      payload,
      scope,
      effect: () => {
        effectStarted = true;
        return input.effect();
      },
    });
    return { decision, effectResult };
  } catch (error) {
    if (error instanceof HermesPolicyError) throw error;
    if (effectStarted) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "HERMES_POLICY_DENIED";
    throw new HermesPolicyError(
      code === "DECISION_POLICY_UNAVAILABLE" ? "HERMES_POLICY_UNAVAILABLE" : "HERMES_POLICY_DENIED",
      "La policy Hermes a refusé l’action avant l’effet.",
      code === "DECISION_POLICY_UNAVAILABLE" ? 503 : 403,
    );
  }
}
