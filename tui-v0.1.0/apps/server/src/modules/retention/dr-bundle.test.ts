import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  DrBundleError,
  type DrBundleErrorCode,
  assertNoSecretFields,
  assertScratchTargetEmpty,
  buildDrBundleManifest,
  canonicalJson,
  createScratchRollbackPlan,
  hashManifest,
  MAX_DR_PAYLOAD_BYTES,
  rollbackState,
  serializeDrBundle,
  verifyDrBundle,
} from "./dr-bundle";

const DUMP = Buffer.from("-- pg_dump hermes-console fixture --\n", "utf8");
const ARCHIVE = Buffer.from("files-data tar fixture\n", "utf8");

function fixture() {
  const manifest = buildDrBundleManifest({
    generatedAt: "2026-08-01T19:00:00.000Z",
    migrations: [
      { index: 2, tag: "0025_data_lifecycle_preview", sha256: "b".repeat(64) },
      { index: 1, tag: "0001_initial", sha256: "a".repeat(64) },
    ],
    tableCounts: [
      { table: "threads", rows: 2 },
      { table: "sites", rows: 1 },
    ],
    databaseDump: DUMP,
    filesArchive: ARCHIVE,
    fileCount: 1,
    totalFileBytes: 17,
  });
  return serializeDrBundle({ manifest, databaseDump: DUMP, filesArchive: ARCHIVE });
}

async function expectCode(action: () => unknown, code: DrBundleErrorCode) {
  try {
    await action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DrBundleError);
    expect((error as DrBundleError).code).toBe(code);
  }
}

describe("G1-006D2 disaster-recovery bundle contract", () => {
  test("builds a canonical manifest and verifies dump/archive bytes", () => {
    const serialized = fixture();
    const verified = verifyDrBundle(serialized.body, serialized.sha256);

    expect(verified.sha256).toBe(serialized.sha256);
    expect(verified.databaseDump).toEqual(DUMP);
    expect(verified.filesArchive).toEqual(ARCHIVE);
    expect(verified.document.manifest.schema.migrations.map((migration) => migration.index)).toEqual([1, 2]);
    expect(verified.document.manifest.database.tableCounts.map((table) => table.table)).toEqual(["sites", "threads"]);
    expect(verified.document.manifest.database.sha256).toBe(createHash("sha256").update(DUMP).digest("hex"));
  });

  test("rejects outer digest, manifest, unknown fields, and non-canonical collections", async () => {
    const serialized = fixture();
    await expectCode(() => verifyDrBundle(serialized.body, "0".repeat(64)), "DR_BUNDLE_DIGEST_MISMATCH");

    const unknown = JSON.parse(serialized.body) as Record<string, unknown>;
    unknown.unexpected = true;
    await expectCode(() => verifyDrBundle(JSON.stringify(unknown)), "DR_BUNDLE_INVALID");

    const manifestTamper = JSON.parse(serialized.body) as { manifest: { files: { fileCount: number } } };
    manifestTamper.manifest.files.fileCount = 99;
    await expectCode(() => verifyDrBundle(JSON.stringify(manifestTamper)), "DR_BUNDLE_MANIFEST_MISMATCH");

    const nonCanonical = JSON.parse(serialized.body) as {
      manifest: { schema: { migrations: unknown[] } };
    };
    nonCanonical.manifest.schema.migrations.reverse();
    await expectCode(() => verifyDrBundle(JSON.stringify(nonCanonical)), "DR_BUNDLE_MANIFEST_MISMATCH");
  });

  test("rejects altered payloads even when the outer document is rehashed", async () => {
    const serialized = fixture();
    const document = JSON.parse(serialized.body) as Record<string, any>;
    document.databaseDumpBase64 = Buffer.from("tampered dump", "utf8").toString("base64");
    const unsigned = { ...document };
    delete unsigned.bundleSha256;
    document.bundleSha256 = createHash("sha256").update(canonicalJson(unsigned), "utf8").digest("hex");
    await expectCode(() => verifyDrBundle(JSON.stringify(document)), "DR_BUNDLE_DUMP_MISMATCH");

    const archiveTamper = JSON.parse(serialized.body) as Record<string, any>;
    archiveTamper.filesArchiveBase64 = Buffer.from("tampered archive", "utf8").toString("base64");
    const archiveUnsigned = { ...archiveTamper };
    delete archiveUnsigned.bundleSha256;
    archiveTamper.bundleSha256 = createHash("sha256").update(canonicalJson(archiveUnsigned), "utf8").digest("hex");
    await expectCode(() => verifyDrBundle(JSON.stringify(archiveTamper)), "DR_BUNDLE_ARCHIVE_MISMATCH");
  });

  test("rejects a manifest that exceeds the bounded payload quota", async () => {
    const serialized = fixture();
    const oversized = JSON.parse(serialized.body) as { manifest: { database: { byteSize: number } } };
    oversized.manifest.database.byteSize = MAX_DR_PAYLOAD_BYTES + 1;
    await expectCode(() => verifyDrBundle(JSON.stringify(oversized)), "DR_BUNDLE_INVALID");
  });

  test("rejects secret-shaped metadata and empty captures", async () => {
    await expectCode(() => assertNoSecretFields({ manifest: { APP_ENCRYPTION_KEY: "not-in-bundle" } }), "DR_BUNDLE_SECRET_FIELD");
    await expectCode(
      () =>
        buildDrBundleManifest({
          generatedAt: "2026-08-01T19:00:00.000Z",
          migrations: [],
          tableCounts: [],
          databaseDump: DUMP,
          filesArchive: Buffer.alloc(0),
          fileCount: 0,
          totalFileBytes: 0,
        }),
      "DR_BUNDLE_INVALID",
    );
  });

  test("fails closed for occupied scratch and preserves rollback invariants", async () => {
    await expectCode(() => assertScratchTargetEmpty({ databaseRows: 1, filePaths: [] }), "DR_BUNDLE_TARGET_NOT_EMPTY");
    await expectCode(() => assertScratchTargetEmpty({ databaseRows: 0, filePaths: ["restored/file.bin"] }), "DR_BUNDLE_TARGET_NOT_EMPTY");
    expect(rollbackState({ staged: true, sourceChanged: false, targetRows: 0, targetFiles: 0 })).toEqual({
      sourceChanged: false,
      targetRows: 0,
      targetFiles: 0,
    });
    await expectCode(() => rollbackState({ staged: true, sourceChanged: true, targetRows: 0, targetFiles: 0 }), "DR_BUNDLE_ROLLBACK_REQUIRED");
    expect(createScratchRollbackPlan({ sourceId: "source-1", targetId: "scratch-1", sourceSha256: "a".repeat(64) })).toMatchObject({
      sourceMustRemainUnchanged: true,
      actions: ["freeze-source", "drop-scratch-target", "verify-source-digest"],
    });
  });

  test("binds manifest digest to the canonical representation", () => {
    const serialized = fixture();
    expect(serialized.document.manifestSha256).toBe(hashManifest(serialized.document.manifest));
    expect(serialized.document.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
