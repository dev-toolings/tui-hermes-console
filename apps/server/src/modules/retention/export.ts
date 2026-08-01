import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import {
  artifacts,
  dataLifecyclePreviewItems,
  dataLifecyclePreviews,
  messages,
  runEvents,
  runs,
  threads,
} from "@/db/schema";
import type { SiteRequestContext } from "@/modules/auth/service";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import { ArtifactIntegrityError, readVerifiedArtifact } from "@/modules/artifacts/integrity";
import { getConsoleArtifactRoot } from "@/modules/artifacts/paths";

export const lifecycleExportSchema = z.object({ previewId: z.string().trim().min(1).max(200) }).strict();

/** Aggregate cap prevents a JSON/base64 response from exhausting the server. */
export const MAX_LIFECYCLE_EXPORT_BYTES = 100 * 1024 * 1024;

type LifecycleExportDatabase = ReturnType<typeof getDatabase>;

export type LifecycleExportDependencies = {
  database?: LifecycleExportDatabase;
  now?: () => Date;
  artifactRoot?: string;
  appendInTransaction?: typeof appendAuditEntryInTransaction;
};

export class LifecycleExportError extends Error {
  constructor(
    readonly code:
      | "LIFECYCLE_EXPORT_NOT_FOUND"
      | "LIFECYCLE_EXPORT_SOURCE_MISSING"
      | "LIFECYCLE_EXPORT_SOURCE_CHANGED"
      | "LIFECYCLE_EXPORT_TOO_LARGE"
      | "LIFECYCLE_EXPORT_AUDIT_UNAVAILABLE",
    message: string,
    readonly status: 409 | 404 | 413 | 503,
  ) {
    super(message);
    this.name = "LifecycleExportError";
  }
}

export type LifecycleExportPayload = {
  version: 1;
  type: "hermes_console_business_export";
  siteId: string;
  previewId: string;
  policyVersion: number;
  retentionDays: number;
  cutoffAt: string;
  generatedAt: string;
  threads: readonly Record<string, unknown>[];
  runs: readonly Record<string, unknown>[];
  messages: readonly Record<string, unknown>[];
  events: readonly Record<string, unknown>[];
  artifacts: readonly Record<string, unknown>[];
  manifest: LifecycleExportManifest;
  manifestSha256: string;
};

export type LifecycleExportManifest = {
  version: 1;
  siteId: string;
  previewId: string;
  threadIds: readonly string[];
  runIds: readonly string[];
  messageIds: readonly string[];
  eventIds: readonly string[];
  artifactIds: readonly string[];
  relations: {
    runToThread: readonly { runId: string; threadId: string }[];
    messageToThread: readonly { messageId: string; threadId: string }[];
    messageToRun: readonly { messageId: string; runId: string | null }[];
    eventToRun: readonly { eventId: string; runId: string }[];
    artifactToRun: readonly { artifactId: string; runId: string }[];
  };
  artifactBytes: number;
};

type LifecycleExportCollections = Pick<
  LifecycleExportPayload,
  | "siteId"
  | "previewId"
  | "threads"
  | "runs"
  | "messages"
  | "events"
  | "artifacts"
>;

/** Builds the deterministic relationship manifest embedded in each bundle. */
export function buildLifecycleExportManifest(
  collections: LifecycleExportCollections,
): LifecycleExportManifest {
  const sorted = (values: readonly string[]) => [...values].map(String).sort();
  const threads = collections.threads;
  const runs = collections.runs;
  const messages = collections.messages;
  const events = collections.events;
  const artifacts = collections.artifacts;
  const relationSort = <T extends Record<string, unknown>>(rows: readonly T[]) =>
    [...rows].sort((left, right) => {
      const leftValue = JSON.stringify(left);
      const rightValue = JSON.stringify(right);
      return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    });
  return {
    version: 1,
    siteId: collections.siteId,
    previewId: collections.previewId,
    threadIds: sorted(threads.map((row) => String(row.id))),
    runIds: sorted(runs.map((row) => String(row.id))),
    messageIds: sorted(messages.map((row) => String(row.id))),
    eventIds: sorted(events.map((row) => String(row.id))),
    artifactIds: sorted(artifacts.map((row) => String(row.id))),
    relations: {
      runToThread: relationSort(
        runs.map((row) => ({ runId: String(row.id), threadId: String(row.threadId) })),
      ),
      messageToThread: relationSort(
        messages.map((row) => ({ messageId: String(row.id), threadId: String(row.threadId) })),
      ),
      messageToRun: relationSort(
        messages.map((row) => ({
          messageId: String(row.id),
          runId: row.runId == null ? null : String(row.runId),
        })),
      ),
      eventToRun: relationSort(
        events.map((row) => ({ eventId: String(row.id), runId: String(row.runId) })),
      ),
      artifactToRun: relationSort(
        artifacts.map((row) => ({ artifactId: String(row.id), runId: String(row.runId) })),
      ),
    },
    artifactBytes: artifacts.reduce((sum, row) => sum + Number(row.sizeBytes ?? 0), 0),
  };
}

export function hashLifecycleExportManifest(manifest: LifecycleExportManifest) {
  return createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
}

export function serializeLifecycleExport(payload: LifecycleExportPayload) {
  const body = JSON.stringify(payload);
  return {
    body,
    sha256: createHash("sha256").update(body, "utf8").digest("hex"),
  };
}

export type LifecycleExportSourceComparison = {
  expectedRunIds: readonly string[];
  actualRunIds: readonly string[];
  expectedMessageCount: number;
  actualMessageCount: number;
  expectedArtifactCount: number;
  actualArtifactCount: number;
  expectedArtifactBytes: number;
  actualArtifactBytes: number;
  expectedArtifactHashes: readonly string[];
  actualArtifactHashes: readonly string[];
};

/** Fails closed when a persisted preview no longer describes current rows. */
export function assertLifecycleExportSourceMatches(
  comparison: LifecycleExportSourceComparison,
) {
  const sorted = (values: readonly string[]) => [...values].map(String).sort();
  if (
    JSON.stringify(sorted(comparison.actualRunIds)) !==
      JSON.stringify(sorted(comparison.expectedRunIds)) ||
    comparison.actualMessageCount !== comparison.expectedMessageCount ||
    comparison.actualArtifactCount !== comparison.expectedArtifactCount ||
    comparison.actualArtifactBytes !== comparison.expectedArtifactBytes ||
    JSON.stringify(sorted(comparison.actualArtifactHashes)) !==
      JSON.stringify(sorted(comparison.expectedArtifactHashes))
  ) {
    throw sourceChanged();
  }
}

export async function createLifecycleExport(
  context: SiteRequestContext,
  rawInput: unknown,
  dependencies: LifecycleExportDependencies = {},
) {
  await assertSiteAction(context, "data.lifecycle.export");
  const input = lifecycleExportSchema.parse(rawInput);
  const db = dependencies.database ?? getDatabase();
  const now = (dependencies.now ?? (() => new Date()))();

  return db.transaction(async (tx) => {
    const [preview] = await tx
      .select()
      .from(dataLifecyclePreviews)
      .where(and(eq(dataLifecyclePreviews.siteId, context.siteId), eq(dataLifecyclePreviews.id, input.previewId)))
      .for("update");
    if (!preview) throw new LifecycleExportError("LIFECYCLE_EXPORT_NOT_FOUND", "Aperçu introuvable.", 404);

    const previewItems = await tx
      .select()
      .from(dataLifecyclePreviewItems)
      .where(and(eq(dataLifecyclePreviewItems.siteId, context.siteId), eq(dataLifecyclePreviewItems.previewId, preview.id)))
      .orderBy(asc(dataLifecyclePreviewItems.resourceId));
    const threadIds = previewItems.map((item) => item.resourceId);
    const threadRows = threadIds.length
      ? await tx
          .select()
          .from(threads)
          .where(and(eq(threads.siteId, context.siteId), inArray(threads.id, threadIds)))
          .orderBy(asc(threads.id))
          .for("update")
      : [];
    if (threadRows.length !== threadIds.length) {
      throw new LifecycleExportError(
        "LIFECYCLE_EXPORT_SOURCE_MISSING",
        "Une ressource du preview n’est plus disponible pour l’export.",
        409,
      );
    }

    const runRows = threadIds.length
      ? await tx
          .select()
          .from(runs)
          .where(and(eq(runs.siteId, context.siteId), inArray(runs.threadId, threadIds)))
          .orderBy(asc(runs.id))
          .for("update")
      : [];
    const runIds = runRows.map((run) => run.id);
    const messageRows = threadIds.length
      ? await tx
          .select({
            id: messages.id,
            threadId: messages.threadId,
            runId: messages.runId,
            role: messages.role,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .innerJoin(threads, eq(messages.threadId, threads.id))
          .where(and(eq(threads.siteId, context.siteId), inArray(messages.threadId, threadIds)))
          .orderBy(asc(messages.createdAt), asc(messages.id))
      : [];
    const eventRows = runIds.length
      ? await tx
          .select({
            id: runEvents.id,
            runId: runEvents.runId,
            sequence: runEvents.sequence,
            type: runEvents.type,
            payload: runEvents.payload,
            occurredAt: runEvents.occurredAt,
            createdAt: runEvents.createdAt,
          })
          .from(runEvents)
          .innerJoin(runs, eq(runEvents.runId, runs.id))
          .where(and(eq(runs.siteId, context.siteId), inArray(runEvents.runId, runIds)))
          .orderBy(asc(runEvents.runId), asc(runEvents.sequence))
      : [];
    const artifactRows = runIds.length
      ? await tx
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.siteId, context.siteId), inArray(artifacts.runId, runIds)))
          .orderBy(asc(artifacts.runId), asc(artifacts.id))
      : [];

    const runById = new Map(runRows.map((run) => [run.id, run]));
    for (const run of runRows) {
      if (!["completed", "failed", "cancelled"].includes(run.status)) {
        throw sourceChanged();
      }
    }
    for (const item of previewItems) {
      const itemRuns = runRows
        .filter((run) => run.threadId === item.resourceId)
        .map((run) => run.id)
        .sort();
      const itemMessages = messageRows.filter((message) => message.threadId === item.resourceId);
      const itemArtifacts = artifactRows.filter((artifact) => runById.get(artifact.runId)?.threadId === item.resourceId);
      const itemArtifactHashes = [...new Set(itemArtifacts.map((artifact) => artifact.checksumSha256))].sort();
      const expectedRunIds = [...item.runIds].map(String).sort();
      const expectedArtifactHashes = [...item.artifactHashes].map(String).sort();
      const itemArtifactBytes = itemArtifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
      assertLifecycleExportSourceMatches({
        expectedRunIds,
        actualRunIds: itemRuns,
        expectedMessageCount: item.messageCount,
        actualMessageCount: itemMessages.length,
        expectedArtifactCount: item.artifactCount,
        actualArtifactCount: itemArtifacts.length,
        expectedArtifactBytes: item.artifactBytes,
        actualArtifactBytes: itemArtifactBytes,
        expectedArtifactHashes,
        actualArtifactHashes: itemArtifactHashes,
      });
    }

    const expectedBytes = artifactRows.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
    if (expectedBytes > MAX_LIFECYCLE_EXPORT_BYTES) {
      throw new LifecycleExportError(
        "LIFECYCLE_EXPORT_TOO_LARGE",
        `L’export dépasse la limite de ${MAX_LIFECYCLE_EXPORT_BYTES} octets.`,
        413,
      );
    }

    const exportedArtifacts: Record<string, unknown>[] = [];
    for (const artifact of artifactRows) {
      let bytes: Uint8Array;
      try {
        bytes = await readVerifiedArtifact(
          artifact.storagePath,
          dependencies.artifactRoot ?? getConsoleArtifactRoot(),
          { sizeBytes: artifact.sizeBytes, checksumSha256: artifact.checksumSha256 },
        );
      } catch (error) {
        if (error instanceof ArtifactIntegrityError) throw error;
        throw new LifecycleExportError(
          "LIFECYCLE_EXPORT_SOURCE_MISSING",
          "Les octets d’un artefact ne sont pas exportables.",
          409,
        );
      }
      exportedArtifacts.push({
        id: artifact.id,
        siteId: context.siteId,
        runId: artifact.runId,
        direction: artifact.direction,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        checksumSha256: artifact.checksumSha256,
        createdAt: artifact.createdAt.toISOString(),
        bytesBase64: Buffer.from(bytes).toString("base64"),
      });
    }

    const collections: LifecycleExportCollections = {
      siteId: context.siteId,
      previewId: preview.id,
      threads: threadRows.map((row) => serializeRow(row)),
      runs: runRows.map((row) => serializeRow(row)),
      messages: messageRows.map((row) => serializeRow(row)),
      events: eventRows.map((row) => serializeRow(row)),
      artifacts: exportedArtifacts,
    };
    const manifest = buildLifecycleExportManifest(collections);
    const payload: LifecycleExportPayload = {
      version: 1,
      type: "hermes_console_business_export",
      policyVersion: preview.policyVersion,
      retentionDays: preview.retentionDays,
      cutoffAt: preview.cutoffAt.toISOString(),
      generatedAt: now.toISOString(),
      ...collections,
      manifest,
      manifestSha256: hashLifecycleExportManifest(manifest),
    };
    const serialized = serializeLifecycleExport(payload);
    if (Buffer.byteLength(serialized.body, "utf8") > MAX_LIFECYCLE_EXPORT_BYTES) {
      throw new LifecycleExportError(
        "LIFECYCLE_EXPORT_TOO_LARGE",
        `L’export sérialisé dépasse la limite de ${MAX_LIFECYCLE_EXPORT_BYTES} octets.`,
        413,
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
          action: "data.lifecycle.export",
          resourceType: "data_lifecycle_preview",
          resourceId: preview.id,
          decision: "allowed",
          reasonCode: "DATA_LIFECYCLE_EXPORT_COMPLETED",
          beforeState: {},
          afterState: {
            sha256: serialized.sha256,
            threadCount: threadRows.length,
            runCount: runRows.length,
            artifactCount: artifactRows.length,
            artifactBytes: expectedBytes,
          },
          correlationId: context.correlationId,
          occurredAt: now,
        },
        tx,
      );
    } catch {
      throw new LifecycleExportError(
        "LIFECYCLE_EXPORT_AUDIT_UNAVAILABLE",
        "L’export n’a pas pu être inscrit dans le journal d’audit.",
        503,
      );
    }
    return { ...serialized, previewId: preview.id, generatedAt: now.toISOString() };
  });
}

function serializeRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

function sourceChanged() {
  return new LifecycleExportError(
    "LIFECYCLE_EXPORT_SOURCE_CHANGED",
    "Les données ont changé depuis la création du preview ; l’export est refusé.",
    409,
  );
}
