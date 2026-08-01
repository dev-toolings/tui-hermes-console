import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import {
  artifacts,
  dataLifecyclePreviewItems,
  dataLifecyclePreviews,
  runs,
  siteDataLifecyclePolicies,
  threads,
} from "@/db/schema";
import type { SiteRequestContext } from "@/modules/auth/service";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import {
  appendAuditEntry,
  appendAuditEntryInTransaction,
} from "@/modules/audit/service";
import {
  buildLifecycleManifest,
  findLifecycleCandidates,
  hashLifecycleManifest,
  type LifecyclePreviewCandidate,
  DataLifecycleError,
} from "./service";
import {
  getConsoleArtifactRoot,
  getSharedWorkdirRoot,
  runArtifactDir,
  runWorkdirPath,
} from "@/modules/artifacts/paths";

export const lifecyclePurgeSchema = z
  .object({ previewId: z.string().trim().min(1).max(200) })
  .strict();

type LifecyclePurgeCode =
  | "LIFECYCLE_PURGE_NOT_FOUND"
  | "LIFECYCLE_PURGE_ALREADY_CONSUMED"
  | "LIFECYCLE_PURGE_LEGAL_HOLD"
  | "LIFECYCLE_PURGE_POLICY_CHANGED"
  | "LIFECYCLE_PURGE_MANIFEST_MISMATCH"
  | "LIFECYCLE_PURGE_SOURCE_CHANGED"
  | "LIFECYCLE_PURGE_ACTIVE_RUN"
  | "LIFECYCLE_PURGE_STORAGE_INVALID"
  | "LIFECYCLE_PURGE_AUDIT_UNAVAILABLE"
  | "LIFECYCLE_PURGE_CLEANUP_PENDING";

export class LifecyclePurgeError extends DataLifecycleError {
  constructor(code: LifecyclePurgeCode, message: string, status: number) {
    super(code, message, status);
    this.name = "LifecyclePurgeError";
  }
}

type LifecyclePurgeDatabase = ReturnType<typeof getDatabase>;
type PurgeFilesystem = Pick<typeof fs, "lstat" | "mkdir" | "rename" | "rm">;

export type LifecyclePurgeDependencies = {
  database?: LifecyclePurgeDatabase;
  now?: () => Date;
  artifactRoot?: string;
  sharedWorkdirRoot?: string;
  filesystem?: PurgeFilesystem;
  append?: typeof appendAuditEntry;
  appendInTransaction?: typeof appendAuditEntryInTransaction;
};

export type PurgeFilePlan = {
  runIds: string[];
  directories: string[];
};

/**
 * Derive every filesystem target from a validated run id. The persisted
 * storage_path is deliberately not consulted: it is data, not authority for
 * a destructive path.
 */
export function buildPurgeFilePlan(
  runIds: readonly string[],
  artifactRoot = getConsoleArtifactRoot(),
  sharedWorkdirRoot = getSharedWorkdirRoot(),
): PurgeFilePlan {
  const normalized = [...new Set(runIds.map((runId) => {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
      throw new LifecyclePurgeError(
        "LIFECYCLE_PURGE_STORAGE_INVALID",
        "Un identifiant de mission contient un chemin non sûr.",
        409,
      );
    }
    return runId;
  }))];
  return {
    runIds: normalized,
    directories: normalized.flatMap((runId) => [
      runArtifactDir(runId, artifactRoot),
      runWorkdirPath(runId, sharedWorkdirRoot),
    ]),
  };
}

type PurgeManifestPreview = {
  policyVersion: number;
  retentionDays: number;
  cutoffAt: Date | string;
  manifestSha256: string;
  items: readonly LifecyclePreviewCandidate[];
};

type PurgeManifestPolicy = {
  version?: number;
  retentionDays?: number;
  legalHoldEnabled: boolean;
};

/** Revalidates the immutable preview contract before any destructive effect. */
export function assertPurgeManifest(
  preview: PurgeManifestPreview,
  policy: PurgeManifestPolicy,
  currentItems?: readonly LifecyclePreviewCandidate[],
) {
  if (policy.legalHoldEnabled) {
    throw new LifecyclePurgeError(
      "LIFECYCLE_PURGE_LEGAL_HOLD",
      "La rétention légale active bloque la purge.",
      409,
    );
  }
  if (
    (policy.version !== undefined && policy.version !== preview.policyVersion) ||
    (policy.retentionDays !== undefined && policy.retentionDays !== preview.retentionDays)
  ) {
    throw new LifecyclePurgeError(
      "LIFECYCLE_PURGE_POLICY_CHANGED",
      "La politique a changé depuis la création de l’aperçu.",
      409,
    );
  }

  const cutoffAt = preview.cutoffAt instanceof Date
    ? preview.cutoffAt
    : new Date(preview.cutoffAt);
  const expectedManifest = buildLifecycleManifest(
    { version: preview.policyVersion, retentionDays: preview.retentionDays },
    cutoffAt,
    preview.items,
  );
  const expectedHash = hashLifecycleManifest(expectedManifest);
  if (preview.manifestSha256 !== expectedHash) {
    throw new LifecyclePurgeError(
      "LIFECYCLE_PURGE_MANIFEST_MISMATCH",
      "Le manifeste de purge ne correspond plus à son aperçu.",
      409,
    );
  }
  if (currentItems) {
    const currentHash = hashLifecycleManifest(
      buildLifecycleManifest(
        { version: preview.policyVersion, retentionDays: preview.retentionDays },
        cutoffAt,
        currentItems,
      ),
    );
    if (currentHash !== expectedHash) {
      throw new LifecyclePurgeError(
        "LIFECYCLE_PURGE_SOURCE_CHANGED",
        "Les données ont changé depuis la création de l’aperçu.",
        409,
      );
    }
  }
}

export async function purgeDataLifecycle(
  context: SiteRequestContext,
  rawInput: unknown,
  dependencies: LifecyclePurgeDependencies = {},
) {
  await assertSiteAction(context, "data.lifecycle.purge");
  const input = lifecyclePurgeSchema.parse(rawInput);
  const db = dependencies.database ?? getDatabase();
  const now = (dependencies.now ?? (() => new Date()))();
  const filesystem = dependencies.filesystem ?? fs;
  const artifactRoot = path.resolve(dependencies.artifactRoot ?? getConsoleArtifactRoot());
  const sharedWorkdirRoot = path.resolve(dependencies.sharedWorkdirRoot ?? getSharedWorkdirRoot());
  let moved: QuarantinedMove[] = [];
  let completed = false;
  let result: PurgeResult;

  try {
    result = await db.transaction(async (tx) => {
      const [preview] = await tx
        .select()
        .from(dataLifecyclePreviews)
        .where(and(eq(dataLifecyclePreviews.siteId, context.siteId), eq(dataLifecyclePreviews.id, input.previewId)))
        .for("update");
      if (!preview) throw new LifecyclePurgeError("LIFECYCLE_PURGE_NOT_FOUND", "Aperçu introuvable.", 404);
      if (preview.purgedAt) {
        throw new LifecyclePurgeError("LIFECYCLE_PURGE_ALREADY_CONSUMED", "Aperçu déjà consommé.", 409);
      }

      const [policy] = await tx
        .select()
        .from(siteDataLifecyclePolicies)
        .where(eq(siteDataLifecyclePolicies.siteId, context.siteId))
        .for("update");
      if (!policy) {
        throw new LifecyclePurgeError(
          "LIFECYCLE_PURGE_POLICY_CHANGED",
          "La politique de cycle de vie est absente.",
          412,
        );
      }

      const previewRows = await tx
        .select()
        .from(dataLifecyclePreviewItems)
        .where(and(
          eq(dataLifecyclePreviewItems.siteId, context.siteId),
          eq(dataLifecyclePreviewItems.previewId, preview.id),
        ))
        .orderBy(asc(dataLifecyclePreviewItems.resourceId));
      const previewItems = previewRows.map(toCandidate);
      const previewThreadIds = previewItems.map((item) => item.resourceId);
      if (previewThreadIds.length > 0) {
        const [active] = await tx
          .select({ id: runs.id })
          .from(runs)
          .where(and(
            eq(runs.siteId, context.siteId),
            inArray(runs.threadId, previewThreadIds),
            notInArray(runs.status, ["completed", "failed", "cancelled"]),
          ))
          .limit(1);
        if (active) {
          throw new LifecyclePurgeError(
            "LIFECYCLE_PURGE_ACTIVE_RUN",
            "Une mission active empêche la purge.",
            409,
          );
        }
      }
      const currentItems = await findLifecycleCandidates(tx, context.siteId, preview.cutoffAt);
      assertPurgeManifest({ ...preview, items: previewItems }, policy, currentItems);

      const threadIds = currentItems.map((item) => item.resourceId);

      const runIds = currentItems.flatMap((item) => item.runIds);
      const artifactCount = runIds.length
        ? (await tx.select({ id: artifacts.id }).from(artifacts).where(and(eq(artifacts.siteId, context.siteId), inArray(artifacts.runId, runIds)))).length
        : 0;
      const plan = buildPurgeFilePlan(runIds, artifactRoot, sharedWorkdirRoot);
      const appendInTransaction = dependencies.appendInTransaction ?? appendAuditEntryInTransaction;
      try {
        await appendInTransaction({
          eventId: randomUUID(),
          actorSiteId: context.siteId,
          targetSiteId: context.siteId,
          actorUserId: context.userId,
          actorRole: context.role,
          actorOrganizationId: context.actorOrganizationId,
          clientOrganizationId: context.clientOrganizationId,
          mandateId: context.mandateId,
          action: "data.lifecycle.purge",
          resourceType: "data_lifecycle_preview",
          resourceId: preview.id,
          decision: "allowed",
          reasonCode: "DATA_LIFECYCLE_PURGE_INTENT",
          beforeState: { status: "ready", threadCount: threadIds.length, runCount: runIds.length },
          afterState: { status: "quarantining", previewId: preview.id },
          correlationId: context.correlationId,
          occurredAt: now,
        }, tx);
      } catch {
        throw new LifecyclePurgeError(
          "LIFECYCLE_PURGE_AUDIT_UNAVAILABLE",
          "La purge n’a pas pu être inscrite dans le journal d’audit.",
          503,
        );
      }

      moved = await quarantine(plan, filesystem, now);
      try {
        if (threadIds.length > 0) {
          await tx.delete(threads).where(and(eq(threads.siteId, context.siteId), inArray(threads.id, threadIds)));
        }
        await tx
          .update(dataLifecyclePreviews)
          .set({ purgedAt: now, cleanupPending: false })
          .where(and(eq(dataLifecyclePreviews.siteId, context.siteId), eq(dataLifecyclePreviews.id, preview.id)));
        try {
          await appendInTransaction({
            eventId: randomUUID(),
            actorSiteId: context.siteId,
            targetSiteId: context.siteId,
            actorUserId: context.userId,
            actorRole: context.role,
            actorOrganizationId: context.actorOrganizationId,
            clientOrganizationId: context.clientOrganizationId,
            mandateId: context.mandateId,
            action: "data.lifecycle.purge",
            resourceType: "data_lifecycle_preview",
            resourceId: preview.id,
            decision: "allowed",
            reasonCode: "DATA_LIFECYCLE_PURGE_COMPLETED",
            beforeState: { status: "quarantining", previewId: preview.id },
            afterState: { status: "purged", threadCount: threadIds.length, runCount: runIds.length, artifactCount },
            correlationId: context.correlationId,
            occurredAt: now,
          }, tx);
        } catch {
          throw new LifecyclePurgeError(
            "LIFECYCLE_PURGE_AUDIT_UNAVAILABLE",
            "La purge n’a pas pu inscrire son résultat dans le journal d’audit.",
            503,
          );
        }
      } catch (error) {
        await restoreMoves(moved, filesystem);
        moved = [];
        throw error;
      }
      return {
        previewId: preview.id,
        purgedAt: now.toISOString(),
        purgedThreadCount: threadIds.length,
        purgedRunCount: runIds.length,
        purgedArtifactCount: artifactCount,
        cleanupPending: false,
        _plan: plan,
      };
    });
    completed = true;
  } catch (error) {
    if (moved.length > 0) {
      await restoreMoves(moved, filesystem);
      moved = [];
    }
    if (error instanceof LifecyclePurgeError) {
      await auditPurgeDenial(context, input.previewId, error, dependencies, now);
    }
    throw error;
  }

  if (!completed) throw new Error("Purge did not complete.");
  let cleanupPending = false;
  for (const move of moved) {
    try {
      await filesystem.rm(move.quarantine, { recursive: true, force: true });
    } catch {
      cleanupPending = true;
    }
  }
  if (cleanupPending) {
    try {
      await db
        .update(dataLifecyclePreviews)
        .set({ cleanupPending: true })
        .where(and(eq(dataLifecyclePreviews.siteId, context.siteId), eq(dataLifecyclePreviews.id, input.previewId)));
    } catch {
      // The durable purged marker remains authoritative; operators can retry
      // cleanup from the quarantine root on the next maintenance pass.
    }
  }
  const { _plan: _ignored, ...publicResult } = result!;
  return { ...publicResult, cleanupPending };
}

type PurgeResult = {
  previewId: string;
  purgedAt: string;
  purgedThreadCount: number;
  purgedRunCount: number;
  purgedArtifactCount: number;
  cleanupPending: boolean;
  _plan: PurgeFilePlan;
};

type QuarantinedMove = { source: string; quarantine: string };

async function quarantine(
  plan: PurgeFilePlan,
  filesystem: PurgeFilesystem,
  now: Date,
): Promise<QuarantinedMove[]> {
  const moves: QuarantinedMove[] = [];
  const roots = new Set(plan.directories.map((directory) => path.dirname(path.dirname(directory))));
  try {
    for (const directory of plan.directories) {
      const root = [...roots].find((candidate) => directory.startsWith(`${candidate}${path.sep}`));
      if (!root) throw purgeStorageError();
      const rootInfo = await safeLstat(filesystem, root);
      if (rootInfo && (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())) throw purgeStorageError();
      const sourceInfo = await safeLstat(filesystem, directory);
      if (!sourceInfo) continue;
      if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw purgeStorageError();
      const quarantineRoot = path.join(root, ".purge-quarantine");
      await filesystem.mkdir(quarantineRoot, { recursive: true });
      const quarantine = path.join(quarantineRoot, `${now.getTime()}-${randomUUID()}-${path.basename(directory)}`);
      await filesystem.rename(directory, quarantine);
      moves.push({ source: directory, quarantine });
    }
    return moves;
  } catch (error) {
    await restoreMoves(moves, filesystem);
    throw error instanceof LifecyclePurgeError ? error : purgeStorageError();
  }
}

async function restoreMoves(moves: readonly QuarantinedMove[], filesystem: PurgeFilesystem) {
  for (const move of [...moves].reverse()) {
    try {
      await filesystem.rename(move.quarantine, move.source);
    } catch {
      // Keep the quarantine as the evidence of an incomplete rollback.
    }
  }
}

async function safeLstat(filesystem: PurgeFilesystem, filePath: string) {
  try {
    return await filesystem.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

function toCandidate(item: typeof dataLifecyclePreviewItems.$inferSelect): LifecyclePreviewCandidate {
  return {
    resourceId: item.resourceId,
    activityAt: item.activityAt.toISOString(),
    runCount: item.runCount,
    messageCount: item.messageCount,
    artifactCount: item.artifactCount,
    artifactBytes: item.artifactBytes,
    runIds: item.runIds.map(String),
    artifactHashes: item.artifactHashes.map(String),
  };
}

async function auditPurgeDenial(
  context: SiteRequestContext,
  previewId: string,
  error: LifecyclePurgeError,
  dependencies: LifecyclePurgeDependencies,
  now: Date,
) {
  if (error.code === "LIFECYCLE_PURGE_AUDIT_UNAVAILABLE") return;
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
      action: "data.lifecycle.purge",
      resourceType: "data_lifecycle_preview",
      resourceId: previewId,
      decision: "denied",
      reasonCode: error.code,
      beforeState: { status: "unchanged", previewId },
      afterState: { status: "unchanged", previewId },
      correlationId: context.correlationId,
      occurredAt: now,
    });
  } catch {
    throw new LifecyclePurgeError(
      "LIFECYCLE_PURGE_AUDIT_UNAVAILABLE",
      "La purge n’a pas pu inscrire son refus dans le journal d’audit.",
      503,
    );
  }
}

function purgeStorageError() {
  return new LifecyclePurgeError(
    "LIFECYCLE_PURGE_STORAGE_INVALID",
    "Le stockage dérivé de la mission est absent ou non sûr.",
    409,
  );
}
