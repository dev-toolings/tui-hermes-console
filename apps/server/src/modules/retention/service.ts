import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import {
  dataLifecyclePreviewItems,
  dataLifecyclePreviews,
  siteDataLifecyclePolicies,
  sites,
} from "@/db/schema";
import type { SiteRequestContext } from "@/modules/auth/service";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import {
  appendAuditEntry,
  appendAuditEntryInTransaction,
  type AuditTransaction,
} from "@/modules/audit/service";

type LifecycleDatabase = ReturnType<typeof getDatabase>;

export const lifecyclePolicySchema = z
  .object({
    retentionDays: z.number().int().min(1).max(3650),
    legalHoldEnabled: z.boolean(),
    legalHoldReason: z.string().trim().min(1).max(1000).nullable().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.legalHoldEnabled && !input.legalHoldReason) {
      ctx.addIssue({
        code: "custom",
        path: ["legalHoldReason"],
        message: "Un motif est obligatoire lorsqu’une rétention légale est active.",
      });
    }
    if (!input.legalHoldEnabled && input.legalHoldReason != null) {
      ctx.addIssue({
        code: "custom",
        path: ["legalHoldReason"],
        message: "Le motif doit être nul lorsque la rétention légale est inactive.",
      });
    }
  });

export type LifecyclePolicyInput = z.infer<typeof lifecyclePolicySchema>;

export class DataLifecycleError extends Error {
  constructor(
    readonly code:
      | "LIFECYCLE_POLICY_REQUIRED"
      | "LEGAL_HOLD_ACTIVE"
      | "LIFECYCLE_VERSION_CONFLICT"
      | "LIFECYCLE_PREVIEW_NOT_FOUND"
      | "LIFECYCLE_AUDIT_UNAVAILABLE",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DataLifecycleError";
  }
}

export type LifecycleDependencies = {
  database?: LifecycleDatabase;
  now?: () => Date;
  append?: typeof appendAuditEntry;
  appendInTransaction?: typeof appendAuditEntryInTransaction;
};

export type LifecyclePolicy = typeof siteDataLifecyclePolicies.$inferSelect;
export type LifecyclePreviewItem = typeof dataLifecyclePreviewItems.$inferSelect;

export type LifecyclePreviewCandidate = {
  resourceId: string;
  activityAt: string;
  runCount: number;
  messageCount: number;
  artifactCount: number;
  artifactBytes: number;
  runIds: string[];
  artifactHashes: string[];
};

export function buildLifecycleManifest(
  policy: Pick<LifecyclePolicy, "version" | "retentionDays">,
  cutoffAt: Date,
  candidates: readonly LifecyclePreviewCandidate[],
) {
  return {
    policyVersion: policy.version,
    retentionDays: policy.retentionDays,
    cutoffAt: cutoffAt.toISOString(),
    items: candidates,
  };
}

export function hashLifecycleManifest(manifest: ReturnType<typeof buildLifecycleManifest>) {
  return createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
}

export async function getSiteDataLifecyclePolicy(
  context: SiteRequestContext,
  dependencies: LifecycleDependencies = {},
) {
  await assertSiteAction(context, "data.lifecycle.read");
  const db = dependencies.database ?? getDatabase();
  const [policy] = await db
    .select()
    .from(siteDataLifecyclePolicies)
    .where(eq(siteDataLifecyclePolicies.siteId, context.siteId));
  if (!policy) throw policyRequired();
  return serializePolicy(policy);
}

export async function updateSiteDataLifecyclePolicy(
  context: SiteRequestContext,
  rawInput: unknown,
  dependencies: LifecycleDependencies = {},
) {
  await assertSiteAction(context, "data.lifecycle.manage");
  const input = lifecyclePolicySchema.parse(rawInput);
  const db = dependencies.database ?? getDatabase();
  try {
    return await db.transaction(async (tx) => {
      // Locking the site closes the absent-policy race as well as the normal
      // update race: a first PUT and a concurrent PUT cannot both become v1.
      await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, context.siteId)).for("update");
      const [current] = await tx
        .select()
        .from(siteDataLifecyclePolicies)
        .where(eq(siteDataLifecyclePolicies.siteId, context.siteId))
        .for("update");
      const currentVersion = current?.version ?? 0;
      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw versionConflict(currentVersion);
      }
      const nextVersion = currentVersion + 1;
      const now = (dependencies.now ?? (() => new Date()))();
      const values = {
        siteId: context.siteId,
        version: nextVersion,
        retentionDays: input.retentionDays,
        legalHoldEnabled: input.legalHoldEnabled,
        legalHoldReason: input.legalHoldEnabled ? input.legalHoldReason ?? null : null,
        updatedByUserId: context.userId,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      if (current) {
        await tx
          .update(siteDataLifecyclePolicies)
          .set({
            version: nextVersion,
            retentionDays: values.retentionDays,
            legalHoldEnabled: values.legalHoldEnabled,
            legalHoldReason: values.legalHoldReason,
            updatedByUserId: values.updatedByUserId,
            updatedAt: values.updatedAt,
          })
          .where(eq(siteDataLifecyclePolicies.siteId, context.siteId));
      } else {
        await tx.insert(siteDataLifecyclePolicies).values(values);
      }
      const after = serializePolicy(values);
      try {
        await (dependencies.appendInTransaction ?? appendAuditEntryInTransaction)(
          {
            eventId: randomUUID(),
            actorSiteId: context.siteId,
            targetSiteId: context.siteId,
            actorUserId: context.userId,
            actorRole: context.role,
            actorOrganizationId: context.actorOrganizationId,
            clientOrganizationId: context.clientOrganizationId,
            mandateId: context.mandateId,
            action: "data.lifecycle.policy.update",
            resourceType: "site_data_lifecycle_policy",
            resourceId: context.siteId,
            decision: "allowed",
            reasonCode: "DATA_LIFECYCLE_POLICY_UPDATED",
            beforeState: current ? serializePolicy(current) : { version: 0 },
            afterState: after,
            correlationId: context.correlationId,
            occurredAt: now,
          },
          tx,
        );
      } catch {
        throw auditUnavailable();
      }
      return after;
    });
  } catch (error) {
    if (error instanceof DataLifecycleError) throw error;
    throw error;
  }
}

export async function createDataLifecyclePreview(
  context: SiteRequestContext,
  dependencies: LifecycleDependencies = {},
) {
  await assertSiteAction(context, "data.lifecycle.preview");
  const db = dependencies.database ?? getDatabase();
  const now = (dependencies.now ?? (() => new Date()))();
  try {
    return await db.transaction(async (tx) => {
      const [policy] = await tx
        .select()
        .from(siteDataLifecyclePolicies)
        .where(eq(siteDataLifecyclePolicies.siteId, context.siteId))
        .for("update");
      if (!policy) throw policyRequired();
      if (policy.legalHoldEnabled) throw legalHoldActive();

      const cutoffAt = new Date(now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
      const candidates = await findCandidates(tx, context.siteId, cutoffAt);
      const manifest = buildLifecycleManifest(policy, cutoffAt, candidates);
      const manifestSha256 = hashLifecycleManifest(manifest);
      const previewId = randomUUID();
      await tx.insert(dataLifecyclePreviews).values({
        id: previewId,
        siteId: context.siteId,
        policyVersion: policy.version,
        retentionDays: policy.retentionDays,
        cutoffAt,
        manifestSha256,
        createdByUserId: context.userId,
        createdAt: now,
      });
      if (candidates.length > 0) {
        await tx.insert(dataLifecyclePreviewItems).values(
          candidates.map((item) => ({
            previewId,
            siteId: context.siteId,
            resourceType: "thread",
            resourceId: item.resourceId,
            activityAt: new Date(item.activityAt),
            runCount: item.runCount,
            messageCount: item.messageCount,
            artifactCount: item.artifactCount,
            artifactBytes: item.artifactBytes,
            runIds: item.runIds,
            artifactHashes: item.artifactHashes,
          })),
        );
      }
      try {
        await (dependencies.appendInTransaction ?? appendAuditEntryInTransaction)(
          {
            eventId: randomUUID(),
            actorSiteId: context.siteId,
            targetSiteId: context.siteId,
            actorUserId: context.userId,
            actorRole: context.role,
            actorOrganizationId: context.actorOrganizationId,
            clientOrganizationId: context.clientOrganizationId,
            mandateId: context.mandateId,
            action: "data.lifecycle.preview",
            resourceType: "data_lifecycle_preview",
            resourceId: previewId,
            decision: "allowed",
            reasonCode: "DATA_LIFECYCLE_PREVIEW_CREATED",
            beforeState: {},
            afterState: {
              policyVersion: policy.version,
              cutoffAt: cutoffAt.toISOString(),
              itemCount: candidates.length,
              manifestSha256,
            },
            correlationId: context.correlationId,
            occurredAt: now,
          },
          tx,
        );
      } catch {
        throw auditUnavailable();
      }
      return {
        id: previewId,
        siteId: context.siteId,
        policyVersion: policy.version,
        retentionDays: policy.retentionDays,
        cutoffAt: cutoffAt.toISOString(),
        manifestSha256,
        createdByUserId: context.userId,
        createdAt: now.toISOString(),
        items: candidates,
      };
    });
  } catch (error) {
    if (error instanceof DataLifecycleError && error.code === "LEGAL_HOLD_ACTIVE") {
      // A legal-hold refusal is itself evidence, while the transaction above
      // has created neither a preview nor an item.
      try {
        await (dependencies.append ?? appendAuditEntry)({
          eventId: randomUUID(),
          actorSiteId: context.siteId,
          targetSiteId: context.siteId,
          actorUserId: context.userId,
          actorRole: context.role,
          actorOrganizationId: context.actorOrganizationId,
          clientOrganizationId: context.clientOrganizationId,
          mandateId: context.mandateId,
          action: "data.lifecycle.preview",
          resourceType: "data_lifecycle_policy",
          resourceId: context.siteId,
          decision: "denied",
          reasonCode: "LEGAL_HOLD_ACTIVE",
          beforeState: { legalHoldEnabled: true },
          afterState: { legalHoldEnabled: true },
          correlationId: context.correlationId,
          occurredAt: now,
        });
      } catch {
        throw auditUnavailable();
      }
    }
    throw error;
  }
}

export async function getDataLifecyclePreview(
  context: SiteRequestContext,
  previewId: string,
  dependencies: LifecycleDependencies = {},
) {
  await assertSiteAction(context, "data.lifecycle.preview");
  const db = dependencies.database ?? getDatabase();
  const [preview] = await db
    .select()
    .from(dataLifecyclePreviews)
    .where(and(eq(dataLifecyclePreviews.siteId, context.siteId), eq(dataLifecyclePreviews.id, previewId)));
  if (!preview) throw previewNotFound();
  const items = await db
    .select()
    .from(dataLifecyclePreviewItems)
    .where(and(eq(dataLifecyclePreviewItems.siteId, context.siteId), eq(dataLifecyclePreviewItems.previewId, previewId)));
  return {
    ...preview,
    cutoffAt: preview.cutoffAt.toISOString(),
    createdAt: preview.createdAt.toISOString(),
    items,
  };
}

type Candidate = LifecyclePreviewCandidate;

type CandidateRow = Record<string, unknown> & {
  resource_id: string;
  activity_at: Date | string;
  run_count: number | string;
  message_count: number | string;
  artifact_count: number | string;
  artifact_bytes: number | string;
  run_ids: string[];
  artifact_hashes: string[];
};

async function findCandidates(
  tx: AuditTransaction,
  siteId: string,
  cutoffAt: Date,
): Promise<Candidate[]> {
  const rows = await tx.execute<CandidateRow>(sql`
    SELECT candidate.resource_id,
           candidate.activity_at,
           candidate.run_count,
           candidate.message_count,
           candidate.artifact_count,
           candidate.artifact_bytes,
           candidate.run_ids,
           candidate.artifact_hashes
    FROM (
      SELECT t.id AS resource_id,
        greatest(
          t.updated_at,
          coalesce((SELECT max(m.created_at) FROM messages m WHERE m.thread_id = t.id), t.updated_at),
          coalesce((SELECT max(r.created_at) FROM runs r WHERE r.thread_id = t.id), t.updated_at),
          coalesce((SELECT max(r.last_event_at) FROM runs r WHERE r.thread_id = t.id), t.updated_at),
          coalesce((SELECT max(re.occurred_at) FROM run_events re JOIN runs r ON r.id = re.run_id WHERE r.thread_id = t.id), t.updated_at),
          coalesce((SELECT max(a.created_at) FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE r.thread_id = t.id), t.updated_at)
        ) AS activity_at,
        (SELECT count(*)::int FROM runs r WHERE r.thread_id = t.id) AS run_count,
        (SELECT count(*)::int FROM messages m WHERE m.thread_id = t.id) AS message_count,
        (SELECT count(*)::int FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE r.thread_id = t.id) AS artifact_count,
        coalesce((SELECT sum(a.size_bytes)::bigint FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE r.thread_id = t.id), 0)::bigint AS artifact_bytes,
        coalesce((SELECT jsonb_agg(r.id ORDER BY r.id) FROM runs r WHERE r.thread_id = t.id), '[]'::jsonb) AS run_ids,
        coalesce((SELECT jsonb_agg(h.checksum_sha256 ORDER BY h.checksum_sha256)
                  FROM (SELECT DISTINCT a.checksum_sha256
                        FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE r.thread_id = t.id) h), '[]'::jsonb) AS artifact_hashes
      FROM threads t
      WHERE t.site_id = ${siteId}
        AND NOT EXISTS (
          SELECT 1 FROM runs r
          WHERE r.thread_id = t.id
            AND r.status NOT IN ('completed', 'failed', 'cancelled')
        )
    ) candidate
    WHERE candidate.activity_at < ${cutoffAt.toISOString()}::timestamp with time zone
    ORDER BY candidate.resource_id
  `);
  return rows.map((row) => ({
    resourceId: row.resource_id,
    activityAt: toIso(row.activity_at),
    runCount: Number(row.run_count),
    messageCount: Number(row.message_count),
    artifactCount: Number(row.artifact_count),
    artifactBytes: Number(row.artifact_bytes),
    runIds: Array.isArray(row.run_ids) ? row.run_ids.map(String) : [],
    artifactHashes: Array.isArray(row.artifact_hashes) ? row.artifact_hashes.map(String) : [],
  }));
}

function serializePolicy(policy: LifecyclePolicy | Record<string, unknown>) {
  const value = policy as Record<string, unknown>;
  return {
    siteId: String(value.siteId ?? value.site_id),
    version: Number(value.version),
    retentionDays: Number(value.retentionDays ?? value.retention_days),
    legalHoldEnabled: Boolean(value.legalHoldEnabled ?? value.legal_hold_enabled),
    legalHoldReason: (value.legalHoldReason ?? value.legal_hold_reason ?? null) as string | null,
    updatedByUserId: String(value.updatedByUserId ?? value.updated_by_user_id),
    createdAt: toIso(value.createdAt ?? value.created_at),
    updatedAt: toIso(value.updatedAt ?? value.updated_at),
  };
}

function toIso(value: Date | string | unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function policyRequired() {
  return new DataLifecycleError(
    "LIFECYCLE_POLICY_REQUIRED",
    "Une politique de cycle de vie doit être configurée avant cette opération.",
    412,
  );
}
function legalHoldActive() {
  return new DataLifecycleError(
    "LEGAL_HOLD_ACTIVE",
    "La rétention légale active bloque tout aperçu de purge.",
    409,
  );
}
function versionConflict(version: number) {
  return new DataLifecycleError(
    "LIFECYCLE_VERSION_CONFLICT",
    `La politique a changé depuis la version ${version}.`,
    409,
  );
}
function previewNotFound() {
  return new DataLifecycleError("LIFECYCLE_PREVIEW_NOT_FOUND", "Aperçu introuvable.", 404);
}
function auditUnavailable() {
  return new DataLifecycleError(
    "LIFECYCLE_AUDIT_UNAVAILABLE",
    "L’opération n’a pas pu être inscrite dans le journal d’audit.",
    503,
  );
}
