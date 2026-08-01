import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  artifacts,
  messages,
  runs,
  sites,
  threads,
} from "@/db/schema";
import { verifyLifecycleExport } from "./verify-export";

type LifecycleRestoreDatabase = ReturnType<typeof getDatabase>;

type LifecycleExportRow = Record<string, unknown> & { id: string | number };
type LifecycleExportArtifact = LifecycleExportRow & {
  siteId: string;
  runId: string;
  sizeBytes: number;
  checksumSha256: string;
  bytesBase64: string;
};
type LifecycleExportBundle = {
  siteId: string;
  previewId: string;
  manifestSha256: string;
  threads: LifecycleExportRow[];
  runs: LifecycleExportRow[];
  messages: LifecycleExportRow[];
  events: LifecycleExportRow[];
  artifacts: LifecycleExportArtifact[];
};

export type LifecycleRestoreDependencies = {
  database?: LifecycleRestoreDatabase;
  artifactRoot: string;
  targetSiteId: string;
};

export class LifecycleRestoreError extends Error {
  constructor(
    readonly code:
      | "LIFECYCLE_RESTORE_TARGET_NOT_EMPTY"
      | "LIFECYCLE_RESTORE_SITE_MISMATCH"
      | "LIFECYCLE_RESTORE_SITE_NOT_FOUND"
      | "LIFECYCLE_RESTORE_INVALID_BUNDLE"
      | "LIFECYCLE_RESTORE_DATABASE_FAILED"
      | "LIFECYCLE_RESTORE_ARTIFACT_FAILED",
    message: string,
    readonly status: 400 | 404 | 409 | 422,
  ) {
    super(message);
    this.name = "LifecycleRestoreError";
  }
}

export type LifecycleRestoreResult = {
  siteId: string;
  sha256: string;
  previewId: string;
  manifestSha256: string;
  restored: {
    threads: number;
    runs: number;
    messages: number;
    events: number;
    artifacts: number;
    artifactBytes: number;
  };
  artifactPaths: readonly string[];
};

/**
 * Restores one verified business export into an empty scratch database/files
 * pair. The target site and storage root are explicit, and neither existing
 * rows nor existing files are overwritten.
 */
export async function restoreLifecycleExportToScratch(
  input: string | Uint8Array,
  expectedSha256: string | undefined,
  dependencies: LifecycleRestoreDependencies,
): Promise<LifecycleRestoreResult> {
  let bundle: LifecycleExportBundle;
  let sha256: string;
  try {
    bundle = parseVerifiedLifecycleExport(input, expectedSha256);
    sha256 = digest(input);
  } catch (error) {
    if (error instanceof LifecycleRestoreError) throw error;
    throw new LifecycleRestoreError(
      "LIFECYCLE_RESTORE_INVALID_BUNDLE",
      error instanceof Error ? error.message : "Le bundle de restauration est invalide.",
      422,
    );
  }

  if (bundle.siteId !== dependencies.targetSiteId) {
    throw new LifecycleRestoreError(
      "LIFECYCLE_RESTORE_SITE_MISMATCH",
      "Le bundle et la cible scratch ne portent pas le même site.",
      409,
    );
  }

  await ensureEmptyArtifactRoot(dependencies.artifactRoot);
  const db = dependencies.database ?? getDatabase();
  const createdPaths: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      const [site] = await tx
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.id, dependencies.targetSiteId));
      if (!site) {
        throw new LifecycleRestoreError(
          "LIFECYCLE_RESTORE_SITE_NOT_FOUND",
          "Le site cible n’existe pas dans la base scratch.",
          404,
        );
      }

      await assertEmptyBusinessScope(tx, dependencies.targetSiteId);

      const artifactRows = [] as Array<{
        id: string;
        siteId: string;
        projectId: string | null;
        ownerUserId: string;
        authorUserId: string;
        runId: string;
        direction: string;
        filename: string;
        storagePath: string;
        mimeType: string | null;
        sizeBytes: number;
        checksumSha256: string;
        createdAt: Date;
      }>;
      for (const artifact of bundle.artifacts) {
        const bytes = Buffer.from(artifact.bytesBase64, "base64");
        const storagePath = join(
          "restored",
          `${createHash("sha256").update(`${bundle.siteId}\0${String(artifact.id)}`).digest("hex")}.bin`,
        );
        const destination = join(dependencies.artifactRoot, storagePath);
        await mkdir(join(dependencies.artifactRoot, "restored"), { recursive: true });
        try {
          await writeFile(destination, bytes, { flag: "wx" });
        } catch (error) {
          throw new LifecycleRestoreError(
            "LIFECYCLE_RESTORE_ARTIFACT_FAILED",
            error instanceof Error ? error.message : "Les octets d’un artefact ne sont pas restaurables.",
            422,
          );
        }
        createdPaths.push(destination);
        artifactRows.push({
          id: requiredString(artifact, "id"),
          siteId: bundle.siteId,
          projectId: optionalString(artifact, "projectId"),
          ownerUserId: requiredString(artifact, "ownerUserId"),
          authorUserId: requiredString(artifact, "authorUserId"),
          runId: requiredString(artifact, "runId"),
          direction: requiredString(artifact, "direction"),
          filename: requiredString(artifact, "filename"),
          storagePath,
          mimeType: optionalString(artifact, "mimeType"),
          sizeBytes: Number(artifact.sizeBytes),
          checksumSha256: requiredString(artifact, "checksumSha256"),
          createdAt: requiredDate(artifact, "createdAt"),
        });
      }

      if (bundle.threads.length > 0) {
        await tx.insert(threads).values(
          bundle.threads.map((row) => ({
            id: requiredString(row, "id"),
            siteId: bundle.siteId,
            projectId: optionalString(row, "projectId"),
            ownerUserId: requiredString(row, "ownerUserId"),
            authorUserId: requiredString(row, "authorUserId"),
            title: requiredString(row, "title"),
            agentId: optionalString(row, "agentId"),
            agentName: requiredString(row, "agentName"),
            instructions: requiredString(row, "instructions"),
            provider: optionalString(row, "provider"),
            model: requiredString(row, "model"),
            reasoningEffort: optionalString(row, "reasoningEffort"),
            source: requiredString(row, "source") as "chat" | "mission",
            hermesConversation: requiredString(row, "hermesConversation"),
            createdAt: requiredDate(row, "createdAt"),
            updatedAt: requiredDate(row, "updatedAt"),
          })),
        );
      }
      if (bundle.runs.length > 0) {
        const runRows = bundle.runs.map((row) => ({
            id: requiredString(row, "id"),
            siteId: bundle.siteId,
            projectId: optionalString(row, "projectId"),
            ownerUserId: requiredString(row, "ownerUserId"),
            authorUserId: requiredString(row, "authorUserId"),
            mandateId: optionalString(row, "mandateId"),
            operatorOrganizationId: optionalString(row, "operatorOrganizationId"),
            clientOrganizationId: optionalString(row, "clientOrganizationId"),
            threadId: requiredString(row, "threadId"),
            input: requiredString(row, "input"),
            status: requiredString(row, "status"),
            hermesResponseId: optionalString(row, "hermesResponseId"),
            output: optionalString(row, "output"),
            usage: row.usage ?? null,
            error: optionalString(row, "error"),
            createdAt: requiredDate(row, "createdAt"),
            startedAt: optionalDate(row, "startedAt"),
            endedAt: optionalDate(row, "endedAt"),
            lastEventAt: optionalDate(row, "lastEventAt"),
            workdir: optionalString(row, "workdir"),
          })) as unknown as (typeof runs.$inferInsert)[];
        await tx.insert(runs).values(runRows);
      }
      if (bundle.messages.length > 0) {
        const messageRows = bundle.messages.map((row) => ({
            id: requiredString(row, "id"),
            threadId: requiredString(row, "threadId"),
            runId: optionalString(row, "runId"),
            role: requiredString(row, "role"),
            content: row.content,
            createdAt: requiredDate(row, "createdAt"),
          })) as unknown as (typeof messages.$inferInsert)[];
        await tx.insert(messages).values(messageRows);
      }
      if (bundle.events.length > 0) {
        // `run_events.id` is GENERATED ALWAYS AS IDENTITY. OVERRIDING SYSTEM
        // VALUE preserves event correlation IDs from the verified bundle.
        const eventValues = bundle.events.map((row) => sql`(
          ${Number(requiredString(row, "id"))},
          ${requiredString(row, "runId")},
          ${Number(requiredString(row, "sequence"))},
          ${requiredString(row, "type")},
          ${JSON.stringify(row.payload)}::jsonb,
          ${requiredDate(row, "occurredAt").toISOString()},
          ${requiredDate(row, "createdAt").toISOString()}
        )`);
        await tx.execute(sql`
          INSERT INTO run_events
            (id, run_id, sequence, type, payload, occurred_at, created_at)
          OVERRIDING SYSTEM VALUE
          VALUES ${sql.join(eventValues, sql`, `)}
        `);
        await tx.execute(sql`
          SELECT setval(
            pg_get_serial_sequence('run_events', 'id'),
            GREATEST(COALESCE((SELECT max(id) FROM run_events), 1), 1),
            true
          )
        `);
      }
      if (artifactRows.length > 0) await tx.insert(artifacts).values(artifactRows as never);

      return {
        siteId: bundle.siteId,
        sha256,
        previewId: bundle.previewId,
        manifestSha256: bundle.manifestSha256,
        restored: {
          threads: bundle.threads.length,
          runs: bundle.runs.length,
          messages: bundle.messages.length,
          events: bundle.events.length,
          artifacts: artifactRows.length,
          artifactBytes: artifactRows.reduce((sum, row) => sum + row.sizeBytes, 0),
        },
        artifactPaths: artifactRows.map((row) => row.storagePath),
      } satisfies LifecycleRestoreResult;
    });
    return result;
  } catch (error) {
    await Promise.all(createdPaths.map((path) => rm(path, { force: true })));
    if (error instanceof LifecycleRestoreError) throw error;
    const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : null;
    throw new LifecycleRestoreError(
      "LIFECYCLE_RESTORE_DATABASE_FAILED",
      error instanceof Error
        ? `${error.message}${cause instanceof Error ? `: ${cause.message}` : ""}`
        : "La restauration scratch a échoué.",
      422,
    );
  }
}

async function ensureEmptyArtifactRoot(root: string) {
  try {
    const entries = await readdir(root);
    if (entries.length > 0) {
      throw new LifecycleRestoreError(
        "LIFECYCLE_RESTORE_TARGET_NOT_EMPTY",
        "Le répertoire d’artefacts scratch n’est pas vide.",
        409,
      );
    }
  } catch (error) {
    if (error instanceof LifecycleRestoreError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(root, { recursive: true });
  }
}

async function assertEmptyBusinessScope(
  tx: Parameters<LifecycleRestoreDatabase["transaction"]>[0] extends (arg: infer T) => unknown
    ? T
    : never,
  siteId: string,
) {
  const [threadCount] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(threads)
    .where(eq(threads.siteId, siteId));
  const [runCount] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(runs)
    .where(eq(runs.siteId, siteId));
  const [artifactCount] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(artifacts)
    .where(eq(artifacts.siteId, siteId));
  if (Number(threadCount?.count ?? 0) || Number(runCount?.count ?? 0) || Number(artifactCount?.count ?? 0)) {
    throw new LifecycleRestoreError(
      "LIFECYCLE_RESTORE_TARGET_NOT_EMPTY",
      "La base scratch contient déjà des données métier pour ce site.",
      409,
    );
  }
}

function digest(input: string | Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

function parseVerifiedLifecycleExport(
  input: string | Uint8Array,
  expectedSha256: string | undefined,
): LifecycleExportBundle {
  verifyLifecycleExport(input, expectedSha256);
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return JSON.parse(new TextDecoder().decode(bytes)) as LifecycleExportBundle;
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    throw new LifecycleRestoreError(
      "LIFECYCLE_RESTORE_INVALID_BUNDLE",
      `Le champ ${key} est absent du bundle.`,
      422,
    );
  }
  return String(value);
}

function optionalString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value == null ? null : String(value);
}

function requiredDate(row: Record<string, unknown>, key: string) {
  const value = row[key];
  const date = new Date(String(value));
  if (!value || Number.isNaN(date.getTime())) {
    throw new LifecycleRestoreError(
      "LIFECYCLE_RESTORE_INVALID_BUNDLE",
      `Le champ ${key} n’est pas une date valide.`,
      422,
    );
  }
  return date;
}

function optionalDate(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value == null ? null : requiredDate(row, key);
}
