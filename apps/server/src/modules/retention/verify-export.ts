import { createHash } from "node:crypto";
import { z } from "zod";
import {
  buildLifecycleExportManifest,
  hashLifecycleExportManifest,
  type LifecycleExportManifest,
} from "./export";

const id = z.union([z.string().min(1), z.number().int().nonnegative()]);
const rowSchema = z.object({ id }).passthrough();
const artifactSchema = rowSchema
  .extend({
    siteId: z.string().min(1),
    runId: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/i),
    bytesBase64: z.string(),
  });

const relationRunToThread = z.object({ runId: z.string().min(1), threadId: z.string().min(1) }).strict();
const relationMessageToThread = z.object({ messageId: z.string().min(1), threadId: z.string().min(1) }).strict();
const relationMessageToRun = z.object({ messageId: z.string().min(1), runId: z.string().min(1).nullable() }).strict();
const relationEventToRun = z.object({ eventId: z.string().min(1), runId: z.string().min(1) }).strict();
const relationArtifactToRun = z.object({ artifactId: z.string().min(1), runId: z.string().min(1) }).strict();
const manifestSchema = z.object({
  version: z.literal(1),
  siteId: z.string().min(1),
  previewId: z.string().min(1),
  threadIds: z.array(z.string().min(1)),
  runIds: z.array(z.string().min(1)),
  messageIds: z.array(z.string().min(1)),
  eventIds: z.array(z.string().min(1)),
  artifactIds: z.array(z.string().min(1)),
  relations: z.object({
    runToThread: z.array(relationRunToThread),
    messageToThread: z.array(relationMessageToThread),
    messageToRun: z.array(relationMessageToRun),
    eventToRun: z.array(relationEventToRun),
    artifactToRun: z.array(relationArtifactToRun),
  }).strict(),
  artifactBytes: z.number().int().nonnegative(),
}).strict();

export const lifecycleExportBundleSchema = z.object({
  version: z.literal(1),
  type: z.literal("hermes_console_business_export"),
  siteId: z.string().min(1),
  previewId: z.string().min(1),
  policyVersion: z.number().int().positive(),
  retentionDays: z.number().int().positive(),
  cutoffAt: z.string().datetime(),
  generatedAt: z.string().datetime(),
  threads: z.array(rowSchema.extend({ siteId: z.string().min(1) })),
  runs: z.array(rowSchema.extend({ siteId: z.string().min(1), threadId: z.string().min(1) })),
  messages: z.array(rowSchema.extend({ threadId: z.string().min(1), runId: z.string().min(1).nullable() })),
  events: z.array(rowSchema.extend({ runId: z.string().min(1) })),
  artifacts: z.array(artifactSchema),
  manifest: manifestSchema,
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).passthrough();

export type LifecycleExportBundle = z.infer<typeof lifecycleExportBundleSchema>;

export type VerifiedLifecycleExport = {
  sha256: string;
  previewId: string;
  siteId: string;
  manifestSha256: string;
  artifactCount: number;
  artifactBytes: number;
};

const MAX_VERIFIED_EXPORT_BYTES = 100 * 1024 * 1024;

/**
 * Verifies a bundle without writing to disk, invoking a shell, or mutating a
 * database. This is the gate used before an external backup or scratch restore.
 */
export function verifyLifecycleExport(
  input: string | Uint8Array,
  expectedSha256?: string,
): VerifiedLifecycleExport {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const body = new TextDecoder().decode(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 && sha256 !== expectedSha256.toLowerCase()) {
    throw new Error("LIFECYCLE_EXPORT_DIGEST_MISMATCH");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("LIFECYCLE_EXPORT_INVALID_JSON");
  }
  const bundle = lifecycleExportBundleSchema.parse(parsed);
  if (bundle.manifest.siteId !== bundle.siteId || bundle.manifest.previewId !== bundle.previewId) {
    throw new Error("LIFECYCLE_EXPORT_MANIFEST_SCOPE_MISMATCH");
  }
  if (bundle.threads.some((thread) => thread.siteId !== bundle.siteId)) {
    throw new Error("LIFECYCLE_EXPORT_SITE_MISMATCH");
  }
  if (bundle.runs.some((run) => run.siteId !== bundle.siteId) || bundle.artifacts.some((artifact) => artifact.siteId !== bundle.siteId)) {
    throw new Error("LIFECYCLE_EXPORT_SITE_MISMATCH");
  }

  assertUniqueIds(bundle.threads, "THREAD");
  assertUniqueIds(bundle.runs, "RUN");
  assertUniqueIds(bundle.messages, "MESSAGE");
  assertUniqueIds(bundle.events, "EVENT");
  assertUniqueIds(bundle.artifacts, "ARTIFACT");
  assertRelations(bundle);

  const expectedManifest = buildLifecycleExportManifest({
    siteId: bundle.siteId,
    previewId: bundle.previewId,
    threads: bundle.threads,
    runs: bundle.runs,
    messages: bundle.messages,
    events: bundle.events,
    artifacts: bundle.artifacts,
  });
  if (JSON.stringify(expectedManifest) !== JSON.stringify(bundle.manifest)) {
    throw new Error("LIFECYCLE_EXPORT_MANIFEST_MISMATCH");
  }
  const manifestSha256 = hashLifecycleExportManifest(bundle.manifest as LifecycleExportManifest);
  if (manifestSha256 !== bundle.manifestSha256) {
    throw new Error("LIFECYCLE_EXPORT_MANIFEST_DIGEST_MISMATCH");
  }

  let artifactBytes = 0;
  for (const artifact of bundle.artifacts) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(artifact.bytesBase64)) {
      throw new Error("LIFECYCLE_EXPORT_INVALID_BASE64");
    }
    const decoded = Buffer.from(artifact.bytesBase64, "base64");
    if (decoded.toString("base64") !== artifact.bytesBase64) {
      throw new Error("LIFECYCLE_EXPORT_INVALID_BASE64");
    }
    const digest = createHash("sha256").update(decoded).digest("hex");
    if (decoded.byteLength !== artifact.sizeBytes || digest !== artifact.checksumSha256.toLowerCase()) {
      throw new Error("LIFECYCLE_EXPORT_ARTIFACT_INTEGRITY_FAILED");
    }
    artifactBytes += decoded.byteLength;
    if (artifactBytes > MAX_VERIFIED_EXPORT_BYTES) {
      throw new Error("LIFECYCLE_EXPORT_TOO_LARGE");
    }
  }
  if (artifactBytes !== bundle.manifest.artifactBytes) {
    throw new Error("LIFECYCLE_EXPORT_MANIFEST_MISMATCH");
  }
  return {
    sha256,
    previewId: bundle.previewId,
    siteId: bundle.siteId,
    manifestSha256,
    artifactCount: bundle.artifacts.length,
    artifactBytes,
  };
}

/** Parses only after applying the same digest, scope, relation, and octet checks. */
export function parseVerifiedLifecycleExport(
  input: string | Uint8Array,
  expectedSha256?: string,
): LifecycleExportBundle {
  verifyLifecycleExport(input, expectedSha256);
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return lifecycleExportBundleSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

function assertUniqueIds(rows: readonly { id: string | number }[], label: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    const value = String(row.id);
    if (ids.has(value)) throw new Error(`LIFECYCLE_EXPORT_DUPLICATE_${label}`);
    ids.add(value);
  }
}

function assertRelations(bundle: z.infer<typeof lifecycleExportBundleSchema>) {
  const threadIds = new Set(bundle.threads.map((row) => String(row.id)));
  const runIds = new Set(bundle.runs.map((row) => String(row.id)));
  const messageIds = new Set(bundle.messages.map((row) => String(row.id)));
  const eventIds = new Set(bundle.events.map((row) => String(row.id)));
  const artifactIds = new Set(bundle.artifacts.map((row) => String(row.id)));
  const runThread = new Map(bundle.runs.map((row) => [String(row.id), row.threadId]));
  for (const run of bundle.runs) if (!threadIds.has(run.threadId)) throw new Error("LIFECYCLE_EXPORT_ORPHAN_RUN");
  for (const message of bundle.messages) {
    if (!threadIds.has(message.threadId) || (message.runId !== null && (!runIds.has(message.runId) || runThread.get(message.runId) !== message.threadId))) {
      throw new Error("LIFECYCLE_EXPORT_ORPHAN_MESSAGE");
    }
  }
  for (const event of bundle.events) if (!runIds.has(event.runId)) throw new Error("LIFECYCLE_EXPORT_ORPHAN_EVENT");
  for (const artifact of bundle.artifacts) if (!runIds.has(artifact.runId)) throw new Error("LIFECYCLE_EXPORT_ORPHAN_ARTIFACT");
  const relations = bundle.manifest.relations;
  if (
    relations.runToThread.length !== runIds.size ||
    relations.messageToThread.length !== messageIds.size ||
    relations.messageToRun.length !== messageIds.size ||
    relations.eventToRun.length !== eventIds.size ||
    relations.artifactToRun.length !== artifactIds.size
  ) throw new Error("LIFECYCLE_EXPORT_MANIFEST_RELATIONS_MISMATCH");
}
