import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Local disaster-recovery bundle contract.
 *
 * This module deliberately does not run pg_dump/tar, open a socket, or write
 * a target.  Capture and restore orchestration owns those side effects; this
 * file only defines the bytes/manifest contract and fail-closed preflight
 * checks that must run before an external copy or scratch restore.
 */
export const DR_BUNDLE_VERSION = 1 as const;
export const DR_BUNDLE_TYPE = "hermes_console_disaster_recovery" as const;
export const DR_BUNDLE_DATABASE_FORMAT = "pg_dump" as const;
export const DR_BUNDLE_FILES_FORMAT = "tar" as const;
export const MAX_DR_PAYLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_DR_BUNDLE_BYTES = 220 * 1024 * 1024;
export const MAX_DR_MIGRATIONS = 2_000;
export const MAX_DR_TABLES = 2_000;
export const MAX_DR_FILES = 100_000;

export type DrBundleBytes = string | Uint8Array;

const SHA256_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SECRET_KEY_RE = /(?:password|passphrase|secret|token|private.?key|api.?key|credential|encryption.?key)/i;

const sha256Schema = z.string().regex(SHA256_RE);
const identifierSchema = z.string().regex(IDENTIFIER_RE);

const migrationSchema = z.object({
  index: z.number().int().nonnegative(),
  tag: identifierSchema,
  sha256: sha256Schema,
}).strict();

const tableCountSchema = z.object({
  table: identifierSchema,
  rows: z.number().int().nonnegative(),
}).strict();

const manifestSchema = z.object({
  version: z.literal(DR_BUNDLE_VERSION),
  type: z.literal(DR_BUNDLE_TYPE),
  generatedAt: z.string().datetime({ offset: true }),
  schema: z.object({
    migrationCount: z.number().int().nonnegative(),
    migrations: z.array(migrationSchema).max(MAX_DR_MIGRATIONS),
  }).strict(),
  database: z.object({
    format: z.literal(DR_BUNDLE_DATABASE_FORMAT),
    byteSize: z.number().int().positive().max(MAX_DR_PAYLOAD_BYTES),
    sha256: sha256Schema,
    tableCounts: z.array(tableCountSchema).max(MAX_DR_TABLES),
  }).strict(),
  files: z.object({
    format: z.literal(DR_BUNDLE_FILES_FORMAT),
    byteSize: z.number().int().positive().max(MAX_DR_PAYLOAD_BYTES),
    sha256: sha256Schema,
    fileCount: z.number().int().nonnegative().max(MAX_DR_FILES),
    totalBytes: z.number().int().nonnegative().max(MAX_DR_PAYLOAD_BYTES),
  }).strict(),
}).strict();

const bundleSchema = z.object({
  version: z.literal(DR_BUNDLE_VERSION),
  type: z.literal(DR_BUNDLE_TYPE),
  manifest: manifestSchema,
  manifestSha256: sha256Schema,
  databaseDumpBase64: z.string().min(4).max(Math.ceil(MAX_DR_PAYLOAD_BYTES * 4 / 3) + 4).regex(BASE64_RE),
  filesArchiveBase64: z.string().min(4).max(Math.ceil(MAX_DR_PAYLOAD_BYTES * 4 / 3) + 4).regex(BASE64_RE),
  bundleSha256: sha256Schema,
}).strict();

export type DrBundleManifest = z.infer<typeof manifestSchema>;
export type DrBundleDocument = z.infer<typeof bundleSchema>;

export type DrBundleErrorCode =
  | "DR_BUNDLE_INVALID"
  | "DR_BUNDLE_DIGEST_MISMATCH"
  | "DR_BUNDLE_MANIFEST_MISMATCH"
  | "DR_BUNDLE_DUMP_MISMATCH"
  | "DR_BUNDLE_ARCHIVE_MISMATCH"
  | "DR_BUNDLE_TOO_LARGE"
  | "DR_BUNDLE_SECRET_FIELD"
  | "DR_BUNDLE_TARGET_NOT_EMPTY"
  | "DR_BUNDLE_ROLLBACK_REQUIRED";

export class DrBundleError extends Error {
  constructor(readonly code: DrBundleErrorCode, message: string) {
    super(message);
    this.name = "DrBundleError";
  }
}

function asBytes(input: DrBundleBytes): Buffer {
  return typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
}

function digest(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Deterministic JSON used for the manifest and bundle digest.  Object keys
 * are sorted recursively.  Arrays are intentionally not reordered: callers
 * must provide the canonical order and builders below do so explicitly.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function sha256Bytes(input: DrBundleBytes): string {
  return digest(asBytes(input));
}

export function hashManifest(manifest: DrBundleManifest): string {
  return digest(Buffer.from(canonicalJson(manifest), "utf8"));
}

export type DrBundleManifestInput = {
  generatedAt: Date | string;
  migrations: readonly { index: number; tag: string; sha256: string }[];
  tableCounts: readonly { table: string; rows: number }[];
  databaseDump: DrBundleBytes;
  filesArchive: DrBundleBytes;
  fileCount: number;
  totalFileBytes: number;
};

/** Build a sorted, strict manifest from already-captured bytes. */
export function buildDrBundleManifest(input: DrBundleManifestInput): DrBundleManifest {
  assertNoSecretFields(input);
  const databaseDump = asBytes(input.databaseDump);
  const filesArchive = asBytes(input.filesArchive);
  assertNonEmptyCapture(databaseDump, "PostgreSQL dump");
  assertNonEmptyCapture(filesArchive, "files-data archive");

  const migrations = [...input.migrations]
    .map((migration) => ({ ...migration }))
    .sort((left, right) => left.index - right.index || left.tag.localeCompare(right.tag));
  const tableCounts = [...input.tableCounts]
    .map((count) => ({ ...count }))
    .sort((left, right) => left.table.localeCompare(right.table));

  const manifestCandidate = {
    version: DR_BUNDLE_VERSION,
    type: DR_BUNDLE_TYPE,
    generatedAt: input.generatedAt instanceof Date ? input.generatedAt.toISOString() : input.generatedAt,
    schema: { migrationCount: migrations.length, migrations },
    database: {
      format: DR_BUNDLE_DATABASE_FORMAT,
      byteSize: databaseDump.byteLength,
      sha256: digest(databaseDump),
      tableCounts,
    },
    files: {
      format: DR_BUNDLE_FILES_FORMAT,
      byteSize: filesArchive.byteLength,
      sha256: digest(filesArchive),
      fileCount: input.fileCount,
      totalBytes: input.totalFileBytes,
    },
  };

  const parsed = manifestSchema.safeParse(manifestCandidate);
  if (!parsed.success) throw invalid("manifest fields are invalid");
  assertCanonicalCollections(parsed.data);
  return parsed.data;
}

export type SerializedDrBundle = {
  document: DrBundleDocument;
  body: string;
  sha256: string;
};

/** Serialize a bundle; no external side effect is performed. */
export function serializeDrBundle(input: {
  manifest: DrBundleManifest;
  databaseDump: DrBundleBytes;
  filesArchive: DrBundleBytes;
}): SerializedDrBundle {
  assertNoSecretFields(input.manifest);
  const databaseDump = asBytes(input.databaseDump);
  const filesArchive = asBytes(input.filesArchive);
  assertPayloadMatchesManifest(input.manifest, databaseDump, filesArchive);

  const unsigned = {
    version: DR_BUNDLE_VERSION,
    type: DR_BUNDLE_TYPE,
    manifest: input.manifest,
    manifestSha256: hashManifest(input.manifest),
    databaseDumpBase64: databaseDump.toString("base64"),
    filesArchiveBase64: filesArchive.toString("base64"),
  };
  const document = {
    ...unsigned,
    bundleSha256: digest(Buffer.from(canonicalJson(unsigned), "utf8")),
  } satisfies DrBundleDocument;
  const body = canonicalJson(document);
  if (Buffer.byteLength(body, "utf8") > MAX_DR_BUNDLE_BYTES) {
    throw new DrBundleError("DR_BUNDLE_TOO_LARGE", "Disaster-recovery bundle exceeds the maximum size.");
  }
  return { document, body, sha256: digest(Buffer.from(body, "utf8")) };
}

export type VerifiedDrBundle = {
  document: DrBundleDocument;
  databaseDump: Buffer;
  filesArchive: Buffer;
  sha256: string;
};

/**
 * Verify every envelope, digest, counter and payload before copy/restore.
 * Any parse, schema, digest, secret or target precondition failure throws a
 * typed error; there is no permissive fallback.
 */
export function verifyDrBundle(input: DrBundleBytes, expectedSha256?: string): VerifiedDrBundle {
  const raw = asBytes(input);
  const rawSha256 = digest(raw);
  if (raw.byteLength > MAX_DR_BUNDLE_BYTES) {
    throw new DrBundleError("DR_BUNDLE_TOO_LARGE", "Disaster-recovery bundle exceeds the maximum size.");
  }
  if (expectedSha256 !== undefined) {
    if (!SHA256_RE.test(expectedSha256) || rawSha256 !== expectedSha256) {
      throw new DrBundleError("DR_BUNDLE_DIGEST_MISMATCH", "Bundle digest does not match the expected SHA-256.");
    }
  }

  let document: DrBundleDocument;
  try {
    const parsedJson: unknown = JSON.parse(raw.toString("utf8"));
    const parsed = bundleSchema.safeParse(parsedJson);
    if (!parsed.success) throw new Error("strict bundle schema rejected the document");
    document = parsed.data;
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : "invalid JSON");
  }

  try {
    assertNoSecretFields(document);
    assertCanonicalCollections(document.manifest);
  } catch (error) {
    if (error instanceof DrBundleError) throw error;
    throw invalid(error instanceof Error ? error.message : "manifest collections are invalid");
  }

  if (document.manifestSha256 !== hashManifest(document.manifest)) {
    throw new DrBundleError("DR_BUNDLE_MANIFEST_MISMATCH", "Manifest SHA-256 is invalid.");
  }

  const unsigned = {
    version: document.version,
    type: document.type,
    manifest: document.manifest,
    manifestSha256: document.manifestSha256,
    databaseDumpBase64: document.databaseDumpBase64,
    filesArchiveBase64: document.filesArchiveBase64,
  };
  if (document.bundleSha256 !== digest(Buffer.from(canonicalJson(unsigned), "utf8"))) {
    throw new DrBundleError("DR_BUNDLE_DIGEST_MISMATCH", "Bundle SHA-256 is invalid.");
  }

  const databaseDump = decodeBase64(document.databaseDumpBase64, "PostgreSQL dump");
  const filesArchive = decodeBase64(document.filesArchiveBase64, "files-data archive");
  assertPayloadMatchesManifest(document.manifest, databaseDump, filesArchive);
  return { document, databaseDump, filesArchive, sha256: rawSha256 };
}

function decodeBase64(value: string, label: string): Buffer {
  if (!BASE64_RE.test(value)) throw invalid(`${label} is not canonical base64`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength === 0 || decoded.toString("base64") !== value) {
    throw invalid(`${label} is empty or not canonical base64`);
  }
  return decoded;
}

function assertPayloadMatchesManifest(
  manifest: DrBundleManifest,
  databaseDump: Uint8Array,
  filesArchive: Uint8Array,
) {
  if (
    databaseDump.byteLength === 0 ||
    databaseDump.byteLength > MAX_DR_PAYLOAD_BYTES ||
    manifest.database.byteSize !== databaseDump.byteLength ||
    manifest.database.sha256 !== digest(databaseDump)
  ) {
    throw new DrBundleError("DR_BUNDLE_DUMP_MISMATCH", "PostgreSQL dump size or SHA-256 is invalid.");
  }
  if (
    filesArchive.byteLength === 0 ||
    filesArchive.byteLength > MAX_DR_PAYLOAD_BYTES ||
    manifest.files.byteSize !== filesArchive.byteLength ||
    manifest.files.sha256 !== digest(filesArchive)
  ) {
    throw new DrBundleError("DR_BUNDLE_ARCHIVE_MISMATCH", "files-data archive size or SHA-256 is invalid.");
  }
}

function assertNonEmptyCapture(bytes: Uint8Array, label: string) {
  if (bytes.byteLength === 0) throw invalid(`${label} must not be empty`);
}

function assertCanonicalCollections(manifest: DrBundleManifest) {
  if (manifest.schema.migrationCount !== manifest.schema.migrations.length) {
    throw new DrBundleError("DR_BUNDLE_MANIFEST_MISMATCH", "Migration counter does not match the manifest.");
  }
  const migrationIndexes = new Set<number>();
  const migrationTags = new Set<string>();
  for (const migration of manifest.schema.migrations) {
    if (migrationIndexes.has(migration.index) || migrationTags.has(migration.tag)) {
      throw new DrBundleError("DR_BUNDLE_MANIFEST_MISMATCH", "Migration identifiers are not unique.");
    }
    migrationIndexes.add(migration.index);
    migrationTags.add(migration.tag);
  }
  const expectedMigrations = [...manifest.schema.migrations]
    .sort((left, right) => left.index - right.index || left.tag.localeCompare(right.tag));
  if (canonicalJson(expectedMigrations) !== canonicalJson(manifest.schema.migrations)) {
    throw new DrBundleError("DR_BUNDLE_MANIFEST_MISMATCH", "Migrations are not in canonical order.");
  }

  const tables = new Set<string>();
  for (const tableCount of manifest.database.tableCounts) {
    if (tables.has(tableCount.table)) {
      throw new DrBundleError("DR_BUNDLE_MANIFEST_MISMATCH", "Database table counters are not unique.");
    }
    tables.add(tableCount.table);
  }
  const expectedTables = [...manifest.database.tableCounts].sort((left, right) => left.table.localeCompare(right.table));
  if (canonicalJson(expectedTables) !== canonicalJson(manifest.database.tableCounts)) {
    throw new DrBundleError("DR_BUNDLE_MANIFEST_MISMATCH", "Database table counters are not in canonical order.");
  }
}

/** Reject credential-shaped metadata; key material is supplied out of band. */
export function assertNoSecretFields(value: unknown): void {
  const visit = (current: unknown, path: string) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(key)) {
        throw new DrBundleError("DR_BUNDLE_SECRET_FIELD", `Secret field is forbidden: ${path}.${key}`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, "$" );
}

export type DrBundleScratchTarget = {
  databaseRows: number;
  filePaths: readonly string[];
};

/** A restore target must be a newly-created, empty database/files pair. */
export function assertScratchTargetEmpty(input: DrBundleScratchTarget): void {
  if (
    !Number.isSafeInteger(input.databaseRows) ||
    input.databaseRows < 0 ||
    input.filePaths.some((path) => typeof path !== "string" || path.length === 0)
  ) {
    throw new DrBundleError("DR_BUNDLE_TARGET_NOT_EMPTY", "Scratch target inventory is invalid.");
  }
  if (input.databaseRows > 0 || input.filePaths.length > 0) {
    throw new DrBundleError("DR_BUNDLE_TARGET_NOT_EMPTY", "Scratch target must be empty before restore.");
  }
}

export type DrBundleRollbackState = {
  staged: boolean;
  sourceChanged: boolean;
  targetRows: number;
  targetFiles: number;
};

/**
 * Check the post-failure invariant for a staged restore.  A failed restore is
 * only safe when the source is unchanged and the scratch target has been
 * cleaned; callers must destroy the scratch project before reporting success.
 */
export function rollbackState(input: DrBundleRollbackState) {
  if (
    !Number.isSafeInteger(input.targetRows) ||
    !Number.isSafeInteger(input.targetFiles) ||
    input.targetRows < 0 ||
    input.targetFiles < 0
  ) {
    throw new DrBundleError("DR_BUNDLE_ROLLBACK_REQUIRED", "Rollback inventory is invalid.");
  }
  if (input.staged && (input.sourceChanged || input.targetRows > 0 || input.targetFiles > 0)) {
    throw new DrBundleError(
      "DR_BUNDLE_ROLLBACK_REQUIRED",
      "Failed restore requires scratch rollback; source must remain unchanged.",
    );
  }
  return {
    sourceChanged: input.sourceChanged,
    targetRows: input.targetRows,
    targetFiles: input.targetFiles,
  };
}

/** Stable, side-effect-free rollback instructions for an orchestrator. */
export function createScratchRollbackPlan(input: {
  sourceId: string;
  targetId: string;
  sourceSha256: string;
}) {
  if (!IDENTIFIER_RE.test(input.sourceId) || !IDENTIFIER_RE.test(input.targetId) || !SHA256_RE.test(input.sourceSha256)) {
    throw new DrBundleError("DR_BUNDLE_ROLLBACK_REQUIRED", "Rollback plan identifiers or source digest are invalid.");
  }
  if (input.sourceId === input.targetId) {
    throw new DrBundleError("DR_BUNDLE_ROLLBACK_REQUIRED", "Source and scratch target must be distinct.");
  }
  return {
    sourceId: input.sourceId,
    targetId: input.targetId,
    sourceSha256: input.sourceSha256,
    actions: ["freeze-source", "drop-scratch-target", "verify-source-digest"] as const,
    sourceMustRemainUnchanged: true as const,
  };
}

function invalid(message: string): DrBundleError {
  return new DrBundleError("DR_BUNDLE_INVALID", `Invalid disaster-recovery bundle: ${message}`);
}
