import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";

export const POLICY_DECISION_DOMAIN = "hermes-console/policy-decision/v1\0" as const;
export const POLICY_DECISION_VERSION = 1 as const;
export const POLICY_DECISION_ALGORITHM = "Ed25519" as const;
export const MAX_DECISION_TTL_MS = 5 * 60 * 1000;

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const envelopeSchema = z
  .object({
    version: z.literal(POLICY_DECISION_VERSION),
    domain: z.literal(POLICY_DECISION_DOMAIN),
    algorithm: z.literal(POLICY_DECISION_ALGORITHM),
    policyVersion: z.literal(1),
    keyId: z.string().regex(identifierPattern),
    decisionId: z.string().regex(identifierPattern),
    requestId: z.string().regex(identifierPattern),
    runId: z.string().regex(identifierPattern),
    siteId: z.string().regex(identifierPattern),
    correlationId: z.string().regex(identifierPattern),
    actionKind: z.literal("fixture.marker.write"),
    scopeId: z.string().regex(identifierPattern),
    payloadSha256: z.string().regex(sha256Pattern),
    outcome: z.enum(["allow", "deny"]),
    approverUserId: z.string().regex(identifierPattern),
    approverRole: z.string().regex(identifierPattern),
    issuedAtMs: z.number().int().nonnegative(),
    expiresAtMs: z.number().int().nonnegative(),
    nonce: z.string().regex(base64UrlPattern),
    publicKey: z.string().regex(base64UrlPattern),
    signature: z.string().regex(base64UrlPattern),
  })
  .strict();

export type DecisionEnvelope = z.infer<typeof envelopeSchema>;
export type DecisionPayload = string | Uint8Array;
export type DecisionOutcome = DecisionEnvelope["outcome"];

export type DecisionRequestScope = {
  requestId: string;
  runId: string;
  siteId: string;
  correlationId: string;
  actionKind: "fixture.marker.write";
  scopeId: string;
};

export type DecisionErrorCode =
  | "DECISION_ENVELOPE_INVALID"
  | "DECISION_DOMAIN_INVALID"
  | "DECISION_ALGORITHM_INVALID"
  | "DECISION_KEY_INVALID"
  | "DECISION_SIGNATURE_INVALID"
  | "DECISION_PAYLOAD_MISMATCH"
  | "DECISION_APPROVER_REQUIRED"
  | "DECISION_SCOPE_MISMATCH"
  | "DECISION_NOT_YET_VALID"
  | "DECISION_EXPIRED"
  | "DECISION_TTL_INVALID"
  | "DECISION_NONCE_INVALID"
  | "DECISION_DENIED"
  | "DECISION_POLICY_UNAVAILABLE"
  | "DECISION_POLICY_DENIED"
  | "DECISION_REPLAY"
  | "DECISION_KEY_UNTRUSTED";

export class DecisionEnvelopeError extends Error {
  readonly code: DecisionErrorCode;

  constructor(code: DecisionErrorCode, message: string) {
    super(message);
    this.name = "DecisionEnvelopeError";
    this.code = code;
  }
}

export function generateDecisionKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey: encodePublicKey(publicKey), privateKey };
}

export function encodePublicKey(key: KeyObject): string {
  return key.export({ format: "der", type: "spki" }).toString("base64url");
}

export function keyIdForPublicKey(publicKey: string): string {
  return createHash("sha256").update(publicKey, "utf8").digest("hex").slice(0, 32);
}

export function payloadSha256(payload: DecisionPayload): string {
  return createHash("sha256").update(payload).digest("hex");
}

type CreateDecisionEnvelopeInput = DecisionRequestScope & {
  privateKey: KeyObject;
  publicKey: string;
  policyVersion?: 1;
  keyId?: string;
  decisionId?: string;
  outcome: DecisionOutcome;
  payload: DecisionPayload;
  approverUserId: string;
  approverRole: string;
  issuedAtMs?: number;
  expiresAtMs?: number;
  nonce?: string;
};

export function createDecisionEnvelope(input: CreateDecisionEnvelopeInput): DecisionEnvelope {
  const issuedAtMs = input.issuedAtMs ?? Date.now();
  const expiresAtMs = input.expiresAtMs ?? issuedAtMs + MAX_DECISION_TTL_MS;
  const unsigned = {
    version: POLICY_DECISION_VERSION,
    domain: POLICY_DECISION_DOMAIN,
    algorithm: POLICY_DECISION_ALGORITHM,
    policyVersion: input.policyVersion ?? 1,
    keyId: input.keyId ?? keyIdForPublicKey(input.publicKey),
    decisionId: input.decisionId ?? `decision-${randomUUID()}`,
    requestId: input.requestId,
    runId: input.runId,
    siteId: input.siteId,
    correlationId: input.correlationId,
    actionKind: input.actionKind,
    scopeId: input.scopeId,
    payloadSha256: payloadSha256(input.payload),
    outcome: input.outcome,
    approverUserId: input.approverUserId,
    approverRole: input.approverRole,
    issuedAtMs,
    expiresAtMs,
    nonce: input.nonce ?? randomBytes(16).toString("base64url"),
    publicKey: input.publicKey,
  } satisfies Omit<DecisionEnvelope, "signature">;
  const signature = sign(null, canonicalDecisionTuple(unsigned), input.privateKey).toString("base64url");
  return { ...unsigned, signature };
}

function canonicalDecisionTuple(input: Omit<DecisionEnvelope, "signature">): Buffer {
  const tuple = [
    input.version,
    input.policyVersion,
    input.algorithm,
    input.keyId,
    input.decisionId,
    input.requestId,
    input.runId,
    input.siteId,
    input.correlationId,
    input.actionKind,
    input.scopeId,
    input.payloadSha256,
    input.outcome,
    input.approverUserId,
    input.approverRole,
    input.issuedAtMs,
    input.expiresAtMs,
    input.nonce,
  ];
  return Buffer.from(`${POLICY_DECISION_DOMAIN}${JSON.stringify(tuple)}`, "utf8");
}

function decodeBase64Url(value: string, code: DecisionErrorCode, label: string): Buffer {
  if (!base64UrlPattern.test(value) || Buffer.from(value, "base64url").toString("base64url") !== value) {
    throw new DecisionEnvelopeError(code, `${label} must be unpadded base64url.`);
  }
  return Buffer.from(value, "base64url");
}

function parseEnvelope(raw: unknown): DecisionEnvelope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DecisionEnvelopeError("DECISION_ENVELOPE_INVALID", "Decision envelope must be an object.");
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.domain !== POLICY_DECISION_DOMAIN) {
    throw new DecisionEnvelopeError("DECISION_DOMAIN_INVALID", "Decision domain is invalid.");
  }
  if (candidate.algorithm !== POLICY_DECISION_ALGORITHM) {
    throw new DecisionEnvelopeError("DECISION_ALGORITHM_INVALID", "Decision algorithm is invalid.");
  }
  if (typeof candidate.approverUserId !== "string" || candidate.approverUserId.trim() === "") {
    throw new DecisionEnvelopeError("DECISION_APPROVER_REQUIRED", "An approver is required.");
  }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DecisionEnvelopeError("DECISION_ENVELOPE_INVALID", "Decision envelope shape is invalid.");
  }
  return parsed.data;
}

function assertNonce(nonce: string) {
  const decoded = decodeBase64Url(nonce, "DECISION_NONCE_INVALID", "Nonce");
  if (decoded.byteLength < 16) {
    throw new DecisionEnvelopeError("DECISION_NONCE_INVALID", "Nonce must contain at least 128 bits.");
  }
}

function assertClock(envelope: DecisionEnvelope, now: number) {
  if (envelope.expiresAtMs <= envelope.issuedAtMs || envelope.expiresAtMs - envelope.issuedAtMs > MAX_DECISION_TTL_MS) {
    throw new DecisionEnvelopeError("DECISION_TTL_INVALID", "Decision TTL must be positive and at most five minutes.");
  }
  if (envelope.issuedAtMs > now) {
    throw new DecisionEnvelopeError("DECISION_NOT_YET_VALID", "Decision is issued in the future.");
  }
  if (envelope.expiresAtMs <= now) {
    throw new DecisionEnvelopeError("DECISION_EXPIRED", "Decision has expired.");
  }
}

function assertScope(envelope: DecisionEnvelope, expectedScope?: DecisionRequestScope) {
  if (!expectedScope) return;
  for (const field of ["requestId", "runId", "siteId", "correlationId", "actionKind", "scopeId"] as const) {
    if (envelope[field] !== expectedScope[field]) {
      throw new DecisionEnvelopeError("DECISION_SCOPE_MISMATCH", "Decision scope does not match the requested effect.");
    }
  }
}

export function verifyDecisionEnvelope(input: {
  envelope: unknown;
  payload: DecisionPayload;
  expectedScope?: DecisionRequestScope;
  now?: number;
  trustedPublicKeys?: readonly string[];
  trustedKeyIds?: readonly string[];
}): DecisionEnvelope {
  const envelope = parseEnvelope(input.envelope);
  assertNonce(envelope.nonce);
  assertClock(envelope, input.now ?? Date.now());
  assertScope(envelope, input.expectedScope);
  if (payloadSha256(input.payload) !== envelope.payloadSha256) {
    throw new DecisionEnvelopeError("DECISION_PAYLOAD_MISMATCH", "Decision payload hash does not match the effect.");
  }
  if (keyIdForPublicKey(envelope.publicKey) !== envelope.keyId) {
    throw new DecisionEnvelopeError("DECISION_KEY_INVALID", "Decision keyId does not bind the public key.");
  }
  const keyBytes = decodeBase64Url(envelope.publicKey, "DECISION_KEY_INVALID", "Public key");
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: keyBytes, format: "der", type: "spki" });
  } catch {
    throw new DecisionEnvelopeError("DECISION_KEY_INVALID", "Public key is not a valid Ed25519 SPKI key.");
  }
  const signature = decodeBase64Url(envelope.signature, "DECISION_SIGNATURE_INVALID", "Signature");
  const { signature: _signature, ...unsigned } = envelope;
  if (signature.byteLength !== 64 || !verify(null, canonicalDecisionTuple(unsigned), publicKey, signature)) {
    throw new DecisionEnvelopeError("DECISION_SIGNATURE_INVALID", "Decision signature is invalid.");
  }
  if (input.trustedPublicKeys && !input.trustedPublicKeys.includes(envelope.publicKey)) {
    throw new DecisionEnvelopeError("DECISION_KEY_UNTRUSTED", "Decision key is not trusted by the enforcer.");
  }
  if (input.trustedKeyIds && !input.trustedKeyIds.includes(envelope.keyId)) {
    throw new DecisionEnvelopeError("DECISION_KEY_UNTRUSTED", "Decision keyId is not trusted by the enforcer.");
  }
  return envelope;
}

export function decisionTupleForTesting(envelope: Omit<DecisionEnvelope, "signature">): Buffer {
  return canonicalDecisionTuple(envelope);
}
