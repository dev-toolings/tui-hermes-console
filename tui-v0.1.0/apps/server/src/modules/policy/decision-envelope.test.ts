import { describe, expect, test } from "bun:test";
import {
  MAX_DECISION_TTL_MS,
  DecisionEnvelopeError,
  createDecisionEnvelope,
  generateDecisionKeyPair,
  type DecisionEnvelope,
  type DecisionErrorCode,
} from "./decision-envelope";
import { createReferenceEnforcer, scopeFor, type ReferencePolicyResolver } from "./reference-enforcer";

const NOW = 1_700_000_000_000;
const PAYLOAD = "fixture.marker.write\0artifact-g1-004a";
const scope = scopeFor({
  requestId: "request-g1-004a",
  runId: "run-g1-004a",
  siteId: "site-g1-004a",
  correlationId: "correlation-g1-004a",
  scopeId: "scope-g1-004a",
});

function fixture(overrides: Partial<Parameters<typeof createDecisionEnvelope>[0]> = {}) {
  const keys = generateDecisionKeyPair();
  const envelope = createDecisionEnvelope({
    ...scope,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    decisionId: "decision-g1-004a",
    outcome: "allow",
    payload: PAYLOAD,
    approverUserId: "user-approver",
    approverRole: "site-admin",
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
    ...overrides,
  });
  return { keys, envelope };
}

function enforcer(keys: ReturnType<typeof generateDecisionKeyPair>, policy: ReferencePolicyResolver = () => ({ available: true, allowed: true })) {
  return createReferenceEnforcer({
    trustedPublicKeys: [keys.publicKey],
    trustedKeyIds: [fixtureKeyId(keys)],
    now: () => NOW,
    policy,
  });
}

function fixtureKeyId(keys: ReturnType<typeof generateDecisionKeyPair>) {
  return createDecisionEnvelope({
    ...scope,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    outcome: "deny",
    payload: PAYLOAD,
    approverUserId: "user-approver",
    approverRole: "site-admin",
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
  }).keyId;
}

async function expectCode(action: () => unknown | Promise<unknown>, code: DecisionErrorCode) {
  try {
    await action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DecisionEnvelopeError);
    expect((error as DecisionEnvelopeError).code).toBe(code);
  }
}

describe("policy decision envelope v1", () => {
  test("allows a signed exact-payload effect and records the nonce", async () => {
    const { keys, envelope } = fixture();
    const reference = enforcer(keys);
    let effects = 0;
    const result = await reference.execute({
      envelope,
      payload: PAYLOAD,
      scope,
      effect: () => {
        effects += 1;
        return "effect-ok";
      },
    });
    expect(result).toBe("effect-ok");
    expect(effects).toBe(1);
    expect(reference.consumedNonces()).toEqual([envelope.nonce]);
    expect(reference.consumedDecisionKeys()[0]).toBe(`${envelope.keyId}\0${envelope.decisionId}\0${envelope.nonce}`);
  });

  test("denies when policy is unavailable or denies by default", async () => {
    const { keys, envelope } = fixture();
    const unavailable = enforcer(keys, () => ({ available: false, reason: "policy store down" }));
    let effects = 0;
    await expectCode(() => unavailable.execute({ envelope, payload: PAYLOAD, scope, effect: () => effects++ }), "DECISION_POLICY_UNAVAILABLE");
    expect(effects).toBe(0);

    const denied = createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => NOW });
    await expectCode(() => denied.execute({ envelope, payload: PAYLOAD, scope, effect: () => effects++ }), "DECISION_POLICY_DENIED");
    expect(effects).toBe(0);
  });

  test("denies an explicit signed deny decision", async () => {
    const { keys } = fixture();
    const envelope = createDecisionEnvelope({
      ...scope,
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      decisionId: "decision-deny-g1-004a",
      outcome: "deny",
      payload: PAYLOAD,
      approverUserId: "user-approver",
      approverRole: "site-admin",
      issuedAtMs: NOW - 1_000,
      expiresAtMs: NOW + 60_000,
    });
    const reference = enforcer(keys);
    let effects = 0;
    await expectCode(() => reference.execute({ envelope, payload: PAYLOAD, scope, effect: () => effects++ }), "DECISION_DENIED");
    expect(effects).toBe(0);
  });

  test("consumes atomically before a failing effect and rejects replay", async () => {
    const { keys, envelope } = fixture();
    const reference = enforcer(keys);
    let effects = 0;
    await expect(reference.execute({ envelope, payload: PAYLOAD, scope, effect: () => { effects += 1; throw new Error("fixture effect failed"); } })).rejects.toThrow("fixture effect failed");
    expect(effects).toBe(1);
    await expectCode(() => reference.execute({ envelope, payload: PAYLOAD, scope, effect: () => effects++ }), "DECISION_REPLAY");
    expect(effects).toBe(1);
  });

  test("rejects expired, future, and overlong TTL envelopes", async () => {
    const { keys, envelope } = fixture();
    const reference = enforcer(keys);
    await expectCode(() => reference.execute({ envelope: { ...envelope, expiresAtMs: NOW }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_EXPIRED");
    await expectCode(() => reference.execute({ envelope: { ...envelope, issuedAtMs: NOW + 1 }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_NOT_YET_VALID");
    await expectCode(() => reference.execute({ envelope: { ...envelope, expiresAtMs: envelope.issuedAtMs + MAX_DECISION_TTL_MS + 1 }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_TTL_INVALID");
  });

  test("rejects payload tampering and divergent scope", async () => {
    const { keys, envelope } = fixture();
    const reference = enforcer(keys);
    await expectCode(() => reference.execute({ envelope, payload: `${PAYLOAD} altered`, scope, effect: () => undefined }), "DECISION_PAYLOAD_MISMATCH");
    await expectCode(() => reference.execute({ envelope, payload: PAYLOAD, scope: { ...scope, scopeId: "scope-other" }, effect: () => undefined }), "DECISION_SCOPE_MISMATCH");
  });

  test("rejects absent approver, invalid domain, algorithm, key, signature, and key trust", async () => {
    const { keys, envelope } = fixture();
    const reference = enforcer(keys);
    const withoutApprover = { ...envelope } as Partial<DecisionEnvelope>;
    delete withoutApprover.approverUserId;
    await expectCode(() => reference.execute({ envelope: withoutApprover, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_APPROVER_REQUIRED");
    await expectCode(() => reference.execute({ envelope: { ...envelope, domain: "wrong-domain" }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_DOMAIN_INVALID");
    await expectCode(() => reference.execute({ envelope: { ...envelope, algorithm: "rsa" }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_ALGORITHM_INVALID");
    await expectCode(() => reference.execute({ envelope: { ...envelope, publicKey: Buffer.from("not-a-key").toString("base64url") }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_KEY_INVALID");
    await expectCode(() => reference.execute({ envelope: { ...envelope, signature: `${envelope.signature[0] === "A" ? "B" : "A"}${envelope.signature.slice(1)}` }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_SIGNATURE_INVALID");
    const otherKey = generateDecisionKeyPair();
    await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [otherKey.publicKey], trustedKeyIds: ["other-key"], now: () => NOW, policy: () => ({ available: true, allowed: true }) }).execute({ envelope, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_KEY_UNTRUSTED");
  });

  test("rejects nonce under 128 bits and unknown fields", async () => {
    const { keys, envelope } = fixture();
    const reference = enforcer(keys);
    await expectCode(() => reference.execute({ envelope: { ...envelope, unexpected: true }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_ENVELOPE_INVALID");
    await expectCode(() => reference.execute({ envelope: { ...envelope, nonce: "AQI" }, payload: PAYLOAD, scope, effect: () => undefined }), "DECISION_NONCE_INVALID");
  });
});
