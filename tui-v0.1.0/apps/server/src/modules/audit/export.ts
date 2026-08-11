import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { auditLedgerEntries } from "@/db/schema";
import type { SiteRequestContext } from "@/modules/auth/service";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import {
  assertAuditEntryHash,
  resolveAuditHmacKey,
  type AuditChainEntry,
} from "./chain";
import { appendAuditEntry } from "./service";

type AuditDatabase = ReturnType<typeof getDatabase>;
export const MAX_AUDIT_EXPORT_ENTRIES = 1_000;

/** The export contract intentionally has no site selector: scope comes from the session. */
export const auditExportSchema = z
  .object({
    fromSequence: z.number().int().positive().safe(),
    toSequence: z.number().int().positive().safe(),
  })
  .strict()
  .refine(({ fromSequence, toSequence }) => fromSequence <= toSequence, {
    message: "fromSequence doit être inférieur ou égal à toSequence.",
    path: ["toSequence"],
  })
  .refine(
    ({ fromSequence, toSequence }) =>
      toSequence - fromSequence + 1 <= MAX_AUDIT_EXPORT_ENTRIES,
    {
      message: `Un export d’audit est limité à ${MAX_AUDIT_EXPORT_ENTRIES} entrées.`,
      path: ["toSequence"],
    },
  );

export type AuditExportRequest = z.infer<typeof auditExportSchema>;

export class AuditExportError extends Error {
  constructor(
    readonly code:
      | "AUDIT_EXPORT_RANGE_INVALID"
      | "AUDIT_EXPORT_CHAIN_INVALID"
      | "AUDIT_EXPORT_AUDIT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "AuditExportError";
  }
}

export type AuditExportDependencies = {
  database?: AuditDatabase;
  hmacKey?: string;
  append?: typeof appendAuditEntry;
  now?: () => Date;
};

export type AuditExportResult = {
  body: string;
  sha256: string;
  exportEventId: string;
  fromSequence: number;
  toSequence: number;
  entryCount: number;
};

/**
 * Read, verify and serialize one contiguous site ledger range.
 *
 * Every byte is prepared before the success audit is appended. Callers can
 * therefore return an empty body when the append fails without having emitted
 * a partial export.
 */
export async function createSiteAuditExport(
  context: SiteRequestContext,
  rawInput: unknown,
  dependencies: AuditExportDependencies = {},
): Promise<AuditExportResult> {
  await assertSiteAction(context, "audit.export");
  const input = auditExportSchema.parse(rawInput);
  // Resolve the key before touching the database. Missing secrets must fail closed.
  const hmacKey = resolveAuditHmacKey(dependencies.hmacKey);
  const db = dependencies.database ?? getDatabase();
  const rows = await readRange(db, context.siteId, input, hmacKey);
  const payload = serializeAuditEntries(rows);
  const sha256 = createHash("sha256").update(payload, "utf8").digest("hex");
  const exportEventId = randomUUID();

  try {
    await (dependencies.append ?? appendAuditEntry)({
      eventId: exportEventId,
      actorSiteId: context.siteId,
      targetSiteId: context.siteId,
      actorUserId: context.userId,
      actorRole: context.role,
      actorOrganizationId: context.actorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      mandateId: context.mandateId,
      action: "audit.export",
      resourceType: "audit_ledger",
      resourceId: `${input.fromSequence}-${input.toSequence}`,
      decision: "allowed",
      reasonCode: "AUDIT_EXPORT_COMPLETED",
      beforeState: {
        fromSequence: input.fromSequence,
        toSequence: input.toSequence,
      },
      afterState: {
        fromSequence: input.fromSequence,
        toSequence: input.toSequence,
        entryCount: rows.length,
        sha256,
      },
      correlationId: context.correlationId,
      occurredAt: (dependencies.now ?? (() => new Date()))(),
    });
  } catch (error) {
    throw new AuditExportError(
      "AUDIT_EXPORT_AUDIT_UNAVAILABLE",
      "L’export n’a pas pu être inscrit dans le journal d’audit.",
    );
  }

  const body = `${payload}${JSON.stringify({
    version: 1,
    type: "audit_export_trailer",
    sha256,
    exportEventId,
    fromSequence: input.fromSequence,
    toSequence: input.toSequence,
    entryCount: rows.length,
  })}\n`;

  return {
    body,
    sha256,
    exportEventId,
    fromSequence: input.fromSequence,
    toSequence: input.toSequence,
    entryCount: rows.length,
  };
}

async function readRange(
  db: AuditDatabase,
  siteId: string,
  input: AuditExportRequest,
  hmacKey: string,
): Promise<AuditChainEntry[]> {
  const lowerBound = input.fromSequence > 1 ? input.fromSequence - 1 : input.fromSequence;
  const rows = await db
    .select()
    .from(auditLedgerEntries)
    .where(
      and(
        eq(auditLedgerEntries.targetSiteId, siteId),
        gte(auditLedgerEntries.sequence, lowerBound),
        lte(auditLedgerEntries.sequence, input.toSequence),
      ),
    )
    .orderBy(asc(auditLedgerEntries.sequence));

  const previous = input.fromSequence > 1 ? rows.shift() : undefined;
  const expectedCount = input.toSequence - input.fromSequence + 1;
  if (
    rows.length !== expectedCount ||
    rows[0]?.sequence !== input.fromSequence ||
    rows.at(-1)?.sequence !== input.toSequence ||
    (previous && previous.sequence !== input.fromSequence - 1)
  ) {
    throw new AuditExportError(
      "AUDIT_EXPORT_CHAIN_INVALID",
      "La plage d’export ne forme pas une séquence d’audit complète.",
    );
  }

  let previousHash: string | null = null;
  if (previous) {
    const previousEntry = rowToChainEntry(previous);
    try {
      assertAuditEntryHash(previousEntry, hmacKey);
    } catch {
      throw new AuditExportError(
        "AUDIT_EXPORT_CHAIN_INVALID",
        "L’intégrité HMAC du ledger audit est invalide.",
      );
    }
    previousHash = previousEntry.entryHash;
  }

  const entries: AuditChainEntry[] = [];
  for (const [index, row] of rows.entries()) {
    const entry = rowToChainEntry(row);
    if (
      entry.sequence !== input.fromSequence + index ||
      entry.previousHash !== previousHash
    ) {
      throw new AuditExportError(
        "AUDIT_EXPORT_CHAIN_INVALID",
        "La continuité du ledger audit est invalide.",
      );
    }
    try {
      assertAuditEntryHash(entry, hmacKey);
    } catch {
      throw new AuditExportError(
        "AUDIT_EXPORT_CHAIN_INVALID",
        "L’intégrité HMAC du ledger audit est invalide.",
      );
    }
    entries.push(entry);
    previousHash = entry.entryHash;
  }
  return entries;
}

export function serializeAuditEntries(entries: readonly AuditChainEntry[]): string {
  return entries
    .map((entry) =>
      JSON.stringify({
        version: 1,
        eventId: entry.eventId,
        actorRole: entry.actorRole,
        envelopeVersion: entry.envelopeVersion,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: redactIdentifier(entry.resourceId),
        decision: entry.decision,
        reasonCode: entry.reasonCode,
        correlationId: redactIdentifier(entry.correlationId),
        occurredAt: entry.occurredAt,
        recordedAt: entry.recordedAt,
        sequence: entry.sequence,
        previousHash: entry.previousHash,
        entryHash: entry.entryHash,
      }),
    )
    .map((line) => `${line}\n`)
    .join("");
}

export function redactIdentifier(value: string): string {
  return `sha256:${createHash("sha256").update(value.slice(0, 512), "utf8").digest("hex")}`;
}

function rowToChainEntry(
  row: typeof auditLedgerEntries.$inferSelect,
): AuditChainEntry {
  return {
    eventId: row.eventId,
    actorSiteId: row.actorSiteId,
    targetSiteId: row.targetSiteId,
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    actorOrganizationId: row.actorOrganizationId,
    clientOrganizationId: row.clientOrganizationId,
    mandateId: row.mandateId,
    envelopeVersion: row.envelopeVersion as 1 | 2,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    decision: row.decision,
    reasonCode: row.reasonCode,
    beforeState: row.beforeState as AuditChainEntry["beforeState"],
    afterState: row.afterState as AuditChainEntry["afterState"],
    correlationId: row.correlationId,
    occurredAt: toIsoString(row.occurredAt),
    recordedAt: toIsoString(row.recordedAt),
    sequence: row.sequence,
    previousHash: row.previousHash,
    entryHash: row.entryHash,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
