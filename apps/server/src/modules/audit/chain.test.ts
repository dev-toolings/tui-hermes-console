import { describe, expect, test } from "bun:test";
import {
  assertAuditChain,
  computeAuditEntryHash,
  type AuditChainEntry,
  type AuditHashPayload,
} from "./chain";
import { appendAuditEntry } from "./service";

const TEST_KEY = "audit-ledger-unit-test-key";

function payload(
  sequence: number,
  previousHash: string | null,
): AuditHashPayload {
  return {
    eventId: `evt-${sequence}`,
    actorSiteId: "site-paris",
    targetSiteId: "site-paris",
    actorUserId: "user-1",
    actorRole: "admin",
    action: "agent.updated",
    resourceType: "agent",
    resourceId: "agt-1",
    decision: "allowed",
    reasonCode: "agent_update",
    beforeState: { enabled: false, nested: { b: 2, a: 1 } },
    afterState: { nested: { a: 1, b: 2 }, enabled: true },
    correlationId: "corr-1",
    occurredAt: `2026-08-01T10:00:0${sequence}.000Z`,
    recordedAt: `2026-08-01T10:01:0${sequence}.000Z`,
    sequence,
    previousHash,
  };
}

describe("audit ledger HMAC chain", () => {
  test("the service fails closed before database access without APP_ENCRYPTION_KEY", async () => {
    const previousKey = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    try {
      await expect(
        appendAuditEntry({
          ...payload(1, null),
          occurredAt: new Date("2026-08-01T10:00:01.000Z"),
        }),
      ).rejects.toThrow("APP_ENCRYPTION_KEY_MISSING");
    } finally {
      if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
      else process.env.APP_ENCRYPTION_KEY = previousKey;
    }
  });

  test("a valid domain-separated chain verifies and canonicalizes JSON keys", () => {
    const firstPayload = payload(1, null);
    const first: AuditChainEntry = {
      ...firstPayload,
      entryHash: computeAuditEntryHash(firstPayload, TEST_KEY),
    };
    const secondPayload = payload(2, first.entryHash);
    const second: AuditChainEntry = {
      ...secondPayload,
      entryHash: computeAuditEntryHash(secondPayload, TEST_KEY),
    };

    expect(() => assertAuditChain([first, second], TEST_KEY)).not.toThrow();
    expect(
      computeAuditEntryHash(
        { ...firstPayload, beforeState: { nested: { a: 1, b: 2 }, enabled: false } },
        TEST_KEY,
      ),
    ).toBe(first.entryHash);
  });

  test("a broken link or tampered state fails chain verification", () => {
    const firstPayload = payload(1, null);
    const first: AuditChainEntry = {
      ...firstPayload,
      entryHash: computeAuditEntryHash(firstPayload, TEST_KEY),
    };
    const secondPayload = payload(2, first.entryHash);
    const second: AuditChainEntry = {
      ...secondPayload,
      entryHash: computeAuditEntryHash(secondPayload, TEST_KEY),
    };

    expect(() =>
      assertAuditChain(
        [{ ...first, afterState: { enabled: false } }, second],
        TEST_KEY,
      ),
    ).toThrow("AUDIT_CHAIN_INTEGRITY_FAILED");
    expect(() =>
      assertAuditChain(
        [first, { ...second, previousHash: "0".repeat(64) }],
        TEST_KEY,
      ),
    ).toThrow("AUDIT_CHAIN_INTEGRITY_FAILED");
  });
});
