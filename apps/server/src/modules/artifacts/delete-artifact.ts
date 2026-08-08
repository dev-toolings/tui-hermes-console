import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { artifacts, runs, siteDataLifecyclePolicies } from "@/db/schema";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { appendAuditEntry, appendAuditEntryInTransaction } from "@/modules/audit/service";
import { describeError, log } from "@/observability/log";
import {
  assertSafeRegularFile,
  assertWithinDir,
  runArtifactInputDir,
  runArtifactOutputDir,
  runInputDir,
  runOutputDir,
  sanitizeFilename,
} from "./paths";
import { removeRemoteArtifact } from "./remote-sync";

export class ArtifactDeletionError extends Error {
  constructor(
    readonly code:
      | "ARTIFACT_NOT_FOUND"
      | "ARTIFACT_RUN_ACTIVE"
      | "ARTIFACT_LEGAL_HOLD"
      | "ARTIFACT_STORAGE_INVALID",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ArtifactDeletionError";
  }
}

type ArtifactDeletionTarget = {
  id: string;
  runId: string;
  direction: "input" | "output";
  filename: string;
  storagePath: string;
  sizeBytes: number;
  checksumSha256: string;
  projectId: string | null;
  ownerUserId: string;
  status: string;
};

type QuarantinedFile = { source: string; quarantine: string };

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function artifactDeletionPaths(
  target: Pick<ArtifactDeletionTarget, "runId" | "direction" | "filename" | "storagePath">,
  roots: { artifactRoot?: string; workRoot?: string } = {},
) {
  const filename = sanitizeFilename(target.filename);
  if (filename !== target.filename) throw storageInvalid();
  const privateDir = target.direction === "input"
    ? runArtifactInputDir(target.runId, roots.artifactRoot)
    : runArtifactOutputDir(target.runId, roots.artifactRoot);
  const workDir = target.direction === "input"
    ? runInputDir(target.runId, roots.workRoot)
    : runOutputDir(target.runId, roots.workRoot);
  const privateFile = assertWithinDir(path.join(privateDir, filename), privateDir);
  if (path.resolve(target.storagePath) !== privateFile) throw storageInvalid();
  return {
    privateFile,
    workFile: assertWithinDir(path.join(workDir, filename), workDir),
    privateDir,
    workDir,
  };
}

export async function deleteArtifactEverywhere(
  context: SiteRequestContext,
  fileId: string,
  dependencies: {
    removeRemote?: typeof removeRemoteArtifact;
    now?: () => Date;
  } = {},
) {
  const db = getDatabase();
  const now = (dependencies.now ?? (() => new Date()))();
  const removeRemote = dependencies.removeRemote ?? removeRemoteArtifact;
  let moved: QuarantinedFile[] = [];
  let target: ArtifactDeletionTarget | null = null;

  try {
    target = await db.transaction(async (tx) => {
      // US-G1-006 : une rétention légale active refuse toute suppression, comme la purge.
      const [policy] = await tx
        .select({ legalHoldEnabled: siteDataLifecyclePolicies.legalHoldEnabled })
        .from(siteDataLifecyclePolicies)
        .where(eq(siteDataLifecyclePolicies.siteId, context.siteId))
        .for("update");
      if (policy?.legalHoldEnabled) {
        throw new ArtifactDeletionError(
          "ARTIFACT_LEGAL_HOLD",
          "Une rétention légale est active sur ce site, la suppression est refusée.",
          409,
        );
      }

      const [row] = await tx
        .select({
          id: artifacts.id,
          runId: artifacts.runId,
          direction: artifacts.direction,
          filename: artifacts.filename,
          storagePath: artifacts.storagePath,
          sizeBytes: artifacts.sizeBytes,
          checksumSha256: artifacts.checksumSha256,
          projectId: artifacts.projectId,
          ownerUserId: artifacts.ownerUserId,
          status: runs.status,
        })
        .from(artifacts)
        .innerJoin(runs, eq(runs.id, artifacts.runId))
        .where(and(
          eq(artifacts.siteId, context.siteId),
          eq(artifacts.id, fileId),
          isNull(artifacts.deletedAt),
          context.mandateProjectId
            ? eq(artifacts.projectId, context.mandateProjectId)
            : undefined,
          context.role === "requester"
            ? eq(artifacts.ownerUserId, context.userId)
            : undefined,
        ))
        .for("update");
      if (!row) throw notFound();
      if (!TERMINAL_RUN_STATUSES.has(row.status)) {
        throw new ArtifactDeletionError(
          "ARTIFACT_RUN_ACTIVE",
          "Le fichier ne peut pas être supprimé pendant l’exécution de la mission.",
          409,
        );
      }

      const paths = artifactDeletionPaths(row);
      moved = await quarantineFiles([
        { file: paths.privateFile, root: paths.privateDir },
        { file: paths.workFile, root: paths.workDir },
      ]);
      await removeRemote(row.runId, row.direction, row.filename);

      await tx
        .update(artifacts)
        .set({ deletedAt: now })
        .where(and(
          eq(artifacts.siteId, context.siteId),
          eq(artifacts.id, row.id),
          isNull(artifacts.deletedAt),
        ));
      await appendAuditEntryInTransaction({
        eventId: randomUUID(),
        actorSiteId: context.siteId,
        targetSiteId: context.siteId,
        actorUserId: context.userId,
        actorRole: context.role,
        actorOrganizationId: context.actorOrganizationId,
        clientOrganizationId: context.clientOrganizationId,
        mandateId: context.mandateId,
        action: "artifact.delete",
        resourceType: "artifact",
        resourceId: row.id,
        decision: "allowed",
        reasonCode: "ARTIFACT_DELETED_EVERYWHERE",
        beforeState: {
          runId: row.runId,
          projectId: row.projectId,
          ownerUserId: row.ownerUserId,
          filename: row.filename,
          direction: row.direction,
          sizeBytes: row.sizeBytes,
          checksumSha256: row.checksumSha256,
        },
        afterState: { deletedAt: now.toISOString() },
        correlationId: context.correlationId,
        occurredAt: now,
      }, tx);
      return row;
    });
  } catch (error) {
    await restoreFiles(moved);
    if (error instanceof ArtifactDeletionError && error.code === "ARTIFACT_NOT_FOUND") {
      await auditScopedMiss(context, {
        action: "artifact.delete",
        resourceType: "artifact",
        resourceId: fileId,
      });
    }
    // CONVENTIONS.md § mutation sensible : un refus doit rester attribué.
    if (error instanceof ArtifactDeletionError && error.code !== "ARTIFACT_NOT_FOUND") {
      await auditDeletionDenied(context, fileId, error.code, now);
    }
    throw error;
  }

  let cleanupPending = false;
  for (const item of moved) {
    try {
      await rm(item.quarantine, { force: true });
    } catch (error) {
      cleanupPending = true;
      log.error("Artifact delete: quarantine cleanup pending", {
        artifactId: target.id,
        quarantine: item.quarantine,
        ...describeError(error),
      });
    }
  }
  return {
    artifactId: target.id,
    runId: target.runId,
    filename: target.filename,
    deletedAt: now.toISOString(),
    cleanupPending,
  };
}

/** Le refus d'une suppression reste une décision attribuée, hors transaction annulée. */
async function auditDeletionDenied(
  context: SiteRequestContext,
  fileId: string,
  reasonCode: string,
  occurredAt: Date,
) {
  try {
    await appendAuditEntry({
      eventId: randomUUID(),
      actorSiteId: context.siteId,
      targetSiteId: context.siteId,
      actorUserId: context.userId,
      actorRole: context.role,
      actorOrganizationId: context.actorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      mandateId: context.mandateId,
      action: "artifact.delete",
      resourceType: "artifact",
      resourceId: fileId,
      decision: "denied",
      reasonCode,
      beforeState: {},
      afterState: {},
      correlationId: context.correlationId,
      occurredAt,
    });
  } catch (error) {
    log.error("Artifact delete: denial audit failed", {
      artifactId: fileId,
      reasonCode,
      ...describeError(error),
    });
  }
}

async function quarantineFiles(
  files: Array<{ file: string; root: string }>,
): Promise<QuarantinedFile[]> {
  const moved: QuarantinedFile[] = [];
  try {
    for (const { file, root } of files) {
      try {
        await assertSafeRegularFile(file, root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const quarantineRoot = path.join(root, ".delete-quarantine");
      await mkdir(quarantineRoot, { recursive: true });
      const quarantine = assertWithinDir(
        path.join(quarantineRoot, `${randomUUID()}-${path.basename(file)}`),
        quarantineRoot,
      );
      await rename(file, quarantine);
      moved.push({ source: file, quarantine });
    }
    return moved;
  } catch (error) {
    await restoreFiles(moved);
    throw error;
  }
}

async function restoreFiles(files: readonly QuarantinedFile[]) {
  for (const item of [...files].reverse()) {
    try {
      await lstat(item.source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await rename(item.quarantine, item.source);
      }
    }
  }
}

function notFound() {
  return new ArtifactDeletionError(
    "ARTIFACT_NOT_FOUND",
    "Fichier introuvable.",
    404,
  );
}

function storageInvalid() {
  return new ArtifactDeletionError(
    "ARTIFACT_STORAGE_INVALID",
    "Le stockage du fichier est invalide, suppression refusée.",
    409,
  );
}
