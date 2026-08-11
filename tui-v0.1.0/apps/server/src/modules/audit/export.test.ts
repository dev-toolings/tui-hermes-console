import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  MAX_AUDIT_EXPORT_ENTRIES,
  auditExportSchema,
  createSiteAuditExport,
  redactIdentifier,
  serializeAuditEntries,
} from "./export";
import { computeAuditEntryHash, type AuditChainEntry } from "./chain";

const HMAC_KEY = "test-audit-export-key";

const context = {
  siteId: "site_a",
  userId: "user_1",
  role: "auditor" as const,
  actorOrganizationId: "org_a",
  clientOrganizationId: "client_a",
  mandateId: null,
  mandateProjectId: null,
  correlationId: "corr_export",
};

function entry(overrides: Partial<AuditChainEntry> = {}): AuditChainEntry {
  const candidate = {
    eventId: "evt_1",
    actorSiteId: "site_a",
    targetSiteId: "site_a",
    actorUserId: "user_secret",
    actorRole: "auditor",
    actorOrganizationId: "org_secret",
    clientOrganizationId: "client_secret",
    mandateId: "mandate_secret",
    envelopeVersion: 2,
    action: "thread.read",
    resourceType: "thread",
    resourceId: "thread-secret",
    decision: "allowed",
    reasonCode: "READ_ALLOWED",
    beforeState: { secret: "before" },
    afterState: { secret: "after" },
    correlationId: "corr-secret",
    occurredAt: "2026-08-01T00:00:00.000Z",
    recordedAt: "2026-08-01T00:00:01.000Z",
    sequence: 1,
    previousHash: null,
    entryHash: "a".repeat(64),
    ...overrides,
  } satisfies AuditChainEntry;
  const { entryHash: _placeholder, ...payload } = candidate;
  return {
    ...candidate,
    entryHash: computeAuditEntryHash(payload, HMAC_KEY),
  };
}

function fakeDatabase(rows: readonly AuditChainEntry[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => rows,
        }),
      }),
    }),
  } as never;
}

describe("audit export", () => {
  test("requires a strict, ordered, bounded range", () => {
    expect(auditExportSchema.parse({ fromSequence: 1, toSequence: 2 })).toEqual({
      fromSequence: 1,
      toSequence: 2,
    });
    expect(() => auditExportSchema.parse({ fromSequence: 2, toSequence: 1 })).toThrow();
    expect(() => auditExportSchema.parse({ fromSequence: 1, toSequence: 1_001 })).toThrow();
    expect(() => auditExportSchema.parse({ fromSequence: 1, toSequence: 1, siteId: "other" })).toThrow();
    expect(MAX_AUDIT_EXPORT_ENTRIES).toBe(1_000);
  });

  test("serializes an allowlist without raw identities or state", () => {
    const body = serializeAuditEntries([entry()]);
    const projected = JSON.parse(body.trim()) as Record<string, unknown>;
    expect(projected).toMatchObject({
      version: 1,
      eventId: "evt_1",
      actorRole: "auditor",
      action: "thread.read",
      resourceType: "thread",
      decision: "allowed",
      sequence: 1,
    });
    expect(projected.resourceId).toBe(redactIdentifier("thread-secret"));
    expect(projected.correlationId).toBe(redactIdentifier("corr-secret"));
    for (const key of [
      "actorUserId",
      "actorOrganizationId",
      "clientOrganizationId",
      "mandateId",
      "beforeState",
      "afterState",
      "actorSiteId",
      "targetSiteId",
    ]) {
      expect(projected).not.toHaveProperty(key);
    }
    expect(body).not.toContain("user_secret");
    expect(body).not.toContain("before");
  });

  test("identifier pseudonym is deterministic and non-raw", () => {
    const value = redactIdentifier("corr-secret");
    expect(value).toBe(`sha256:${createHash("sha256").update("corr-secret").digest("hex")}`);
    expect(value).not.toContain("corr-secret");
  });

  test("audits a successful export and returns the trailer only after append", async () => {
    const appended: unknown[] = [];
    const result = await createSiteAuditExport(
      context,
      { fromSequence: 1, toSequence: 1 },
      {
        database: fakeDatabase([entry()]),
        hmacKey: HMAC_KEY,
        append: async (input) => {
          appended.push(input);
          return {} as never;
        },
        now: () => new Date("2026-08-01T00:01:00.000Z"),
      },
    );
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      action: "audit.export",
      decision: "allowed",
      targetSiteId: "site_a",
      reasonCode: "AUDIT_EXPORT_COMPLETED",
    });
    const trailer = JSON.parse(result.body.trim().split("\n").at(-1)!) as Record<string, unknown>;
    expect(trailer).toMatchObject({
      version: 1,
      type: "audit_export_trailer",
      sha256: result.sha256,
      exportEventId: expect.any(String),
      fromSequence: 1,
      toSequence: 1,
      entryCount: 1,
    });
    expect(result.body).not.toContain("user_secret");
    expect(result.body).not.toContain("before");
  });

  test("returns no export result when the success audit append fails", async () => {
    await expect(
      createSiteAuditExport(
        context,
        { fromSequence: 1, toSequence: 1 },
        {
          database: fakeDatabase([entry()]),
          hmacKey: HMAC_KEY,
          append: async () => {
            throw new Error("ledger unavailable");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "AUDIT_EXPORT_AUDIT_UNAVAILABLE" });
  });
});
