import { expect, test } from "bun:test";
import { createDecisionEnvelope, generateDecisionKeyPair, type DecisionErrorCode } from "./decision-envelope";
import { createReferenceEnforcer, scopeFor, type ReferencePolicyResolver } from "./reference-enforcer";

const NOW = 1_700_000_000_000;
const payload = "fixture.marker.write\0reference-enforcer";
const scope = scopeFor({
  requestId: "request-reference",
  runId: "run-reference",
  siteId: "site-reference",
  correlationId: "correlation-reference",
  scopeId: "scope-reference",
});

function signed() {
  const keys = generateDecisionKeyPair();
  const envelope = createDecisionEnvelope({
    ...scope,
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    decisionId: "decision-reference",
    outcome: "allow",
    payload,
    approverUserId: "approver-reference",
    approverRole: "site-admin",
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
  });
  return { keys, envelope };
}

function makeEnforcer(keys: ReturnType<typeof generateDecisionKeyPair>, policy?: ReferencePolicyResolver) {
  return createReferenceEnforcer({
    trustedPublicKeys: [keys.publicKey],
    now: () => NOW,
    policy,
  });
}

async function expectCode(action: () => unknown | Promise<unknown>, code: DecisionErrorCode) {
  try {
    await action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

test("reference enforcer consumes a valid decision before the synthetic effect", async () => {
  const { keys, envelope } = signed();
  const enforcer = makeEnforcer(keys, () => ({ available: true, allowed: true }));
  const order: string[] = [];
  await enforcer.execute({
    envelope,
    payload,
    scope,
    effect: () => {
      order.push("effect");
      return "marker-written";
    },
  });
  expect(order).toEqual(["effect"]);
  expect(enforcer.consumedNonces()).toEqual([envelope.nonce]);
});

test("reference enforcer fails closed when policy is unavailable", async () => {
  const { keys, envelope } = signed();
  const enforcer = makeEnforcer(keys, () => ({ available: false, reason: "fixture unavailable" }));
  let writes = 0;
  await expectCode(() => enforcer.execute({ envelope, payload, scope, effect: () => writes++ }), "DECISION_POLICY_UNAVAILABLE");
  expect(writes).toBe(0);
});

test("reference enforcer denies without an explicit allow policy", async () => {
  const { keys, envelope } = signed();
  const enforcer = makeEnforcer(keys);
  let writes = 0;
  await expectCode(() => enforcer.execute({ envelope, payload, scope, effect: () => writes++ }), "DECISION_POLICY_DENIED");
  expect(writes).toBe(0);
});

test("reference enforcer refuses payload and scope divergence before effect", async () => {
  const { keys, envelope } = signed();
  const enforcer = makeEnforcer(keys, () => ({ available: true, allowed: true }));
  let writes = 0;
  await expectCode(() => enforcer.execute({ envelope, payload: `${payload}!`, scope, effect: () => writes++ }), "DECISION_PAYLOAD_MISMATCH");
  await expectCode(() => enforcer.execute({ envelope, payload, scope: { ...scope, scopeId: "scope-other" }, effect: () => writes++ }), "DECISION_SCOPE_MISMATCH");
  expect(writes).toBe(0);
});

test("reference enforcer refuses a replay even when the first effect throws", async () => {
  const { keys, envelope } = signed();
  const enforcer = makeEnforcer(keys, () => ({ available: true, allowed: true }));
  await expect(enforcer.execute({ envelope, payload, scope, effect: () => { throw new Error("fixture failed"); } })).rejects.toThrow("fixture failed");
  await expectCode(() => enforcer.execute({ envelope, payload, scope, effect: () => undefined }), "DECISION_REPLAY");
});
