import {
  createDecisionEnvelope,
  generateDecisionKeyPair,
  type DecisionErrorCode,
} from "../src/modules/policy/decision-envelope";
import { createReferenceEnforcer, scopeFor } from "../src/modules/policy/reference-enforcer";

const now = 1_700_000_000_000;
const payload = "fixture.marker.write\0g1-004-local";
const scope = scopeFor({
  requestId: "request-g1-004-local",
  runId: "run-g1-004-local",
  siteId: "site-g1-004-local",
  correlationId: "correlation-g1-004-local",
  scopeId: "scope-g1-004-local",
});

function fail(message: string): never {
  throw new Error(message);
}

async function expectCode(action: () => unknown | Promise<unknown>, expected: DecisionErrorCode) {
  try {
    await action();
  } catch (error) {
    if ((error as { code?: string }).code === expected) return;
    fail(`expected ${expected}, received ${(error as { code?: string }).code ?? String(error)}`);
  }
  fail(`expected ${expected}, action succeeded`);
}

async function main() {
  const keys = generateDecisionKeyPair();
  const envelope = createDecisionEnvelope({
    ...scope,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    decisionId: "decision-g1-004-local",
    outcome: "allow",
    payload,
    approverUserId: "approver-g1-004-local",
    approverRole: "site-admin",
    issuedAtMs: now - 1_000,
    expiresAtMs: now + 60_000,
  });
  const policy = () => ({ available: true as const, allowed: true as const });
  const enforcer = createReferenceEnforcer({
    trustedPublicKeys: [keys.publicKey],
    trustedKeyIds: [envelope.keyId],
    now: () => now,
    policy,
  });

  let markerWrites = 0;
  await enforcer.execute({
    envelope,
    payload,
    scope,
    effect: () => {
      markerWrites += 1;
    },
  });
  if (markerWrites !== 1) fail("valid decision did not produce exactly one synthetic effect");

  const fresh = () => createDecisionEnvelope({
    ...scope,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    outcome: "allow",
    payload,
    approverUserId: "approver-g1-004-local",
    approverRole: "site-admin",
    issuedAtMs: now - 1_000,
    expiresAtMs: now + 60_000,
  });
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy: () => ({ available: false }) }).execute({ envelope: fresh(), payload, scope, effect: () => markerWrites++ }), "DECISION_POLICY_UNAVAILABLE");
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy }).execute({ envelope: fresh(), payload: `${payload}!`, scope, effect: () => markerWrites++ }), "DECISION_PAYLOAD_MISMATCH");
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy }).execute({ envelope: fresh(), payload, scope: { ...scope, scopeId: "scope-other" }, effect: () => markerWrites++ }), "DECISION_SCOPE_MISMATCH");
  await expectCode(() => enforcer.execute({ envelope, payload, scope, effect: () => markerWrites++ }), "DECISION_REPLAY");
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy }).execute({ envelope: { ...fresh(), expiresAtMs: now }, payload, scope, effect: () => markerWrites++ }), "DECISION_EXPIRED");
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy }).execute({ envelope: { ...fresh(), issuedAtMs: now + 1 }, payload, scope, effect: () => markerWrites++ }), "DECISION_NOT_YET_VALID");
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy }).execute({ envelope: { ...fresh(), domain: "wrong-domain" }, payload, scope, effect: () => markerWrites++ }), "DECISION_DOMAIN_INVALID");
  await expectCode(() => createReferenceEnforcer({ trustedPublicKeys: [keys.publicKey], trustedKeyIds: [envelope.keyId], now: () => now, policy }).execute({ envelope: { ...fresh(), unexpected: true }, payload, scope, effect: () => markerWrites++ }), "DECISION_ENVELOPE_INVALID");
  if (markerWrites !== 1) fail("a refused decision reached the synthetic effect");

  process.stdout.write(JSON.stringify({
    status: "PASS",
    scope: "local-reference-enforcer",
    actionKind: "fixture.marker.write",
    markerWrites,
    consumedDecisionKeys: enforcer.consumedDecisionKeys(),
    checks: [
      "signed allow",
      "policy unavailable",
      "payload mismatch",
      "scope mismatch",
      "replay",
      "expired/future",
      "invalid domain",
      "unknown field",
    ],
    limitations: ["synthetic effect only", "P-CODE/P-INT local", "no P-SEC/P-E2E", "does not integrate runner or Hermes"],
  }) + "\n");
}

await main();
