import { and, desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  auditLedgerEntries,
  auditLedgerHeads,
  sites,
  type AuditDecision,
  type SiteMembershipRole,
} from "@/db/schema";
import {
  assertAuditEntryHash,
  canonicalizeAuditValue,
  computeAuditEntryHash,
  resolveAuditHmacKey,
  type AuditChainEntry,
  type AuditHashPayload,
  type AuditJsonValue,
} from "./chain";

type AuditDatabase = ReturnType<typeof getDatabase>;
export type AuditTransaction = Parameters<
  Parameters<AuditDatabase["transaction"]>[0]
>[0];

export interface AppendAuditEntryInput {
  eventId: string;
  actorSiteId: string;
  targetSiteId: string;
  actorUserId: string;
  actorRole: SiteMembershipRole;
  actorOrganizationId: string;
  clientOrganizationId: string;
  mandateId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  decision: AuditDecision;
  reasonCode: string;
  beforeState: AuditJsonValue;
  afterState: AuditJsonValue;
  correlationId: string;
  occurredAt: Date;
}

export interface AuditServiceDependencies {
  database?: AuditDatabase;
  hmacKey?: string;
}

export class AuditLedgerError extends Error {
  constructor(
    readonly code: "AUDIT_EVENT_ID_CONFLICT" | "AUDIT_CHAIN_INTEGRITY_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AuditLedgerError";
  }
}

export async function appendAuditEntry(
  input: AppendAuditEntryInput,
  dependencies: AuditServiceDependencies = {},
) {
  // Résoudre la clé avant même d'ouvrir une connexion : aucune écriture non
  // authentifiée ne doit être possible lorsque le secret serveur manque.
  const hmacKey = resolveAuditHmacKey(dependencies.hmacKey);
  const db = dependencies.database ?? getDatabase();

  return db.transaction((tx) =>
    appendAuditEntryInTransaction(input, tx, { hmacKey }),
  );
}

export async function appendAuditEntryInTransaction(
  input: AppendAuditEntryInput,
  tx: AuditTransaction,
  dependencies: Pick<AuditServiceDependencies, "hmacKey"> = {},
) {
    const hmacKey = resolveAuditHmacKey(dependencies.hmacKey);
    const [targetSite] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.id, input.targetSiteId))
      .for("update");
    if (!targetSite) {
      throw new AuditLedgerError(
        "AUDIT_CHAIN_INTEGRITY_FAILED",
        "Le site cible du ledger audit est introuvable.",
      );
    }

    const [head] = await tx
      .select()
      .from(auditLedgerHeads)
      .where(eq(auditLedgerHeads.targetSiteId, input.targetSiteId));

    const [lastEntry] = await tx
      .select()
      .from(auditLedgerEntries)
      .where(eq(auditLedgerEntries.targetSiteId, input.targetSiteId))
      .orderBy(desc(auditLedgerEntries.sequence))
      .limit(1);
    if (
      (head?.nextSequence ?? 1) !== (lastEntry?.sequence ?? 0) + 1 ||
      (head?.lastEntryHash ?? null) !== (lastEntry?.entryHash ?? null)
    ) {
      throw new AuditLedgerError(
        "AUDIT_CHAIN_INTEGRITY_FAILED",
        "La tête et la dernière entrée du ledger audit divergent.",
      );
    }

    const [existing] = await tx
      .select()
      .from(auditLedgerEntries)
      .where(
        and(
          eq(auditLedgerEntries.targetSiteId, input.targetSiteId),
          eq(auditLedgerEntries.eventId, input.eventId),
        ),
      )
      .limit(1);
    if (existing) {
      const chainEntry = rowToChainEntry(existing);
      assertAuditEntryHash(chainEntry, hmacKey);
      if (!sameEvent(existing, input)) {
        throw new AuditLedgerError(
          "AUDIT_EVENT_ID_CONFLICT",
          "Un event_id identique porte un contenu différent.",
        );
      }
      return existing;
    }

    if (lastEntry) assertAuditEntryHash(rowToChainEntry(lastEntry), hmacKey);
    const recordedAt = new Date();
    const payload: AuditHashPayload = {
      ...input,
      envelopeVersion: 2,
      occurredAt: input.occurredAt.toISOString(),
      recordedAt: recordedAt.toISOString(),
      sequence: head?.nextSequence ?? 1,
      previousHash: head?.lastEntryHash ?? null,
    };
    const entryHash = computeAuditEntryHash(payload, hmacKey);
    const rows = await tx.execute<AuditLedgerRawRow>(sql`
      SELECT * FROM public.append_audit_ledger_entry(
        ${input.eventId}::text,
        ${input.actorSiteId}::text,
        ${input.targetSiteId}::text,
        ${input.actorUserId}::text,
        ${input.actorRole}::text,
        ${input.actorOrganizationId}::text,
        ${input.clientOrganizationId}::text,
        ${input.mandateId}::text,
        ${2}::integer,
        ${input.action}::text,
        ${input.resourceType}::text,
        ${input.resourceId}::text,
        ${input.decision}::text,
        ${input.reasonCode}::text,
        ${JSON.stringify(input.beforeState)}::jsonb,
        ${JSON.stringify(input.afterState)}::jsonb,
        ${input.correlationId}::text,
        ${input.occurredAt.toISOString()}::timestamp with time zone,
        ${recordedAt.toISOString()}::timestamp with time zone,
        ${payload.sequence}::bigint,
        ${payload.previousHash}::text,
        ${entryHash}::text
      )
    `);
    const rawCreated = rows[0];
    if (!rawCreated) {
      throw new AuditLedgerError(
        "AUDIT_CHAIN_INTEGRITY_FAILED",
        "L’écriture audit n’a produit aucune entrée.",
      );
    }
    return mapAuditLedgerRow(rawCreated);
}

interface AuditLedgerRawRow extends Record<string, unknown> {
  id: number | string;
  event_id: string;
  actor_site_id: string;
  target_site_id: string;
  actor_user_id: string;
  actor_role: SiteMembershipRole;
  actor_organization_id: string | null;
  client_organization_id: string | null;
  mandate_id: string | null;
  envelope_version: 1 | 2;
  action: string;
  resource_type: string;
  resource_id: string;
  decision: AuditDecision;
  reason_code: string;
  before_state: unknown;
  after_state: unknown;
  correlation_id: string;
  occurred_at: Date;
  recorded_at: Date;
  sequence: number | string;
  previous_hash: string | null;
  entry_hash: string;
}

function mapAuditLedgerRow(
  row: AuditLedgerRawRow,
): typeof auditLedgerEntries.$inferSelect {
  return {
    id: Number(row.id),
    eventId: row.event_id,
    actorSiteId: row.actor_site_id,
    targetSiteId: row.target_site_id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    actorOrganizationId: row.actor_organization_id,
    clientOrganizationId: row.client_organization_id,
    mandateId: row.mandate_id,
    envelopeVersion: row.envelope_version,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    decision: row.decision,
    reasonCode: row.reason_code,
    beforeState: row.before_state,
    afterState: row.after_state,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    sequence: Number(row.sequence),
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
  };
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
    beforeState: row.beforeState as AuditJsonValue,
    afterState: row.afterState as AuditJsonValue,
    correlationId: row.correlationId,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    sequence: row.sequence,
    previousHash: row.previousHash,
    entryHash: row.entryHash,
  };
}

function sameEvent(
  row: typeof auditLedgerEntries.$inferSelect,
  input: AppendAuditEntryInput,
): boolean {
  return (
    row.actorSiteId === input.actorSiteId &&
    row.targetSiteId === input.targetSiteId &&
    row.actorUserId === input.actorUserId &&
    row.actorRole === input.actorRole &&
    row.actorOrganizationId === input.actorOrganizationId &&
    row.clientOrganizationId === input.clientOrganizationId &&
    row.mandateId === input.mandateId &&
    row.action === input.action &&
    row.resourceType === input.resourceType &&
    row.resourceId === input.resourceId &&
    row.decision === input.decision &&
    row.reasonCode === input.reasonCode &&
    canonicalizeAuditValue(row.beforeState) ===
      canonicalizeAuditValue(input.beforeState) &&
    canonicalizeAuditValue(row.afterState) ===
      canonicalizeAuditValue(input.afterState) &&
    row.correlationId === input.correlationId &&
    row.occurredAt.getTime() === input.occurredAt.getTime()
  );
}
