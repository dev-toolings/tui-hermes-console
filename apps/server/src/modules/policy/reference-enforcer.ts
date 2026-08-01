import {
  type DecisionEnvelope,
  type DecisionPayload,
  type DecisionRequestScope,
  DecisionEnvelopeError,
  verifyDecisionEnvelope,
} from "./decision-envelope";

export type PolicyEvaluation =
  | { available: true; allowed: true }
  | { available: true; allowed: false; reason?: string }
  | { available: false; reason?: string };

export type ReferencePolicyResolver = (input: {
  envelope: DecisionEnvelope;
  scope: DecisionRequestScope;
}) => PolicyEvaluation | Promise<PolicyEvaluation>;

export type EnforceEffectInput<T> = {
  envelope: unknown;
  payload: DecisionPayload;
  scope: DecisionRequestScope;
  effect: () => T | Promise<T>;
};

export type ReferenceEnforcerOptions = {
  now?: () => number;
  trustedPublicKeys: readonly string[];
  trustedKeyIds?: readonly string[];
  policy?: ReferencePolicyResolver;
};

export type ReferenceEnforcer = {
  execute<T>(input: EnforceEffectInput<T>): Promise<T>;
  consumedNonces(): readonly string[];
  consumedDecisionKeys(): readonly string[];
};

const denyByDefault: ReferencePolicyResolver = () => ({
  available: true,
  allowed: false,
  reason: "No policy was configured.",
});

/**
 * Reference-only pre-effect enforcer. It intentionally has no Hermes or DB
 * integration: the nonce set models the atomic decision store used by the
 * local proof fixture. The check-and-add is synchronous and occurs before the
 * first await, so concurrent calls cannot both pass the replay gate.
 */
export function createReferenceEnforcer(options: ReferenceEnforcerOptions): ReferenceEnforcer {
  const consumed = new Set<string>();
  const consumedOrder: string[] = [];
  const policy = options.policy ?? denyByDefault;
  const now = options.now ?? (() => Date.now());

  return {
    async execute<T>(input: EnforceEffectInput<T>): Promise<T> {
      const envelope = verifyDecisionEnvelope({
        envelope: input.envelope,
        payload: input.payload,
        expectedScope: input.scope,
        now: now(),
        trustedPublicKeys: options.trustedPublicKeys,
        trustedKeyIds: options.trustedKeyIds,
      });
      if (envelope.outcome !== "allow") {
        throw new DecisionEnvelopeError("DECISION_DENIED", "Policy decisions deny effects by default.");
      }

      const evaluation = await policy({ envelope, scope: input.scope });
      if (!evaluation.available) {
        throw new DecisionEnvelopeError(
          "DECISION_POLICY_UNAVAILABLE",
          evaluation.reason ?? "Policy is unavailable; effect denied.",
        );
      }
      if (!evaluation.allowed) {
        throw new DecisionEnvelopeError(
          "DECISION_POLICY_DENIED",
          evaluation.reason ?? "Policy denied the effect.",
        );
      }
      const consumptionKey = [envelope.keyId, envelope.decisionId, envelope.nonce].join("\0");
      if (consumed.has(consumptionKey)) {
        throw new DecisionEnvelopeError("DECISION_REPLAY", "Decision nonce has already been consumed.");
      }
      // Atomic in-process consumption must precede the effect. Never move this
      // add below `await input.effect()`; a failing effect still consumes it.
      consumed.add(consumptionKey);
      consumedOrder.push(consumptionKey);
      return input.effect();
    },

    consumedNonces() {
      return consumedOrder.map((key) => key.split("\0")[2] ?? "");
    },

    consumedDecisionKeys() {
      return [...consumedOrder];
    },
  };
}

export function scopeFor(input: {
  requestId: string;
  runId: string;
  siteId: string;
  correlationId: string;
  scopeId: string;
}): DecisionRequestScope {
  return {
    requestId: input.requestId,
    runId: input.runId,
    siteId: input.siteId,
    correlationId: input.correlationId,
    actionKind: "fixture.marker.write",
    scopeId: input.scopeId,
  };
}
