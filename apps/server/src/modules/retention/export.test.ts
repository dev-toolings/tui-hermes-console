import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertLifecycleExportSourceMatches,
  buildLifecycleExportManifest,
  hashLifecycleExportManifest,
  LifecycleExportError,
  MAX_LIFECYCLE_EXPORT_BYTES,
  lifecycleExportSchema,
  serializeLifecycleExport,
} from "./export";
import { readVerifiedArtifact } from "@/modules/artifacts/integrity";

describe("lifecycle business export", () => {
  test("requires only a preview id and rejects forged site scope", () => {
    expect(lifecycleExportSchema.parse({ previewId: "preview_1" })).toEqual({
      previewId: "preview_1",
    });
    expect(() => lifecycleExportSchema.parse({ previewId: "preview_1", siteId: "other" })).toThrow();
    expect(() => lifecycleExportSchema.parse({})).toThrow();
    expect(MAX_LIFECYCLE_EXPORT_BYTES).toBe(100 * 1024 * 1024);
  });

  test("serializes a deterministic, readable bundle and exposes its digest", () => {
    const payload = {
      version: 1 as const,
      type: "hermes_console_business_export" as const,
      siteId: "site_paris",
      previewId: "preview_1",
      policyVersion: 2,
      retentionDays: 30,
      cutoffAt: "2026-07-01T00:00:00.000Z",
      generatedAt: "2026-08-01T00:00:00.000Z",
      threads: [{ id: "thread_1", siteId: "site_paris" }],
      runs: [{ id: "run_1", siteId: "site_paris", threadId: "thread_1" }],
      messages: [],
      events: [],
      artifacts: [{
        id: "artifact_1",
        siteId: "site_paris",
        runId: "run_1",
        sizeBytes: 5,
        checksumSha256: createHash("sha256").update("hello").digest("hex"),
        bytesBase64: Buffer.from("hello").toString("base64"),
      }],
    };
    const manifest = buildLifecycleExportManifest(payload);
    const fullPayload = {
      ...payload,
      manifest,
      manifestSha256: hashLifecycleExportManifest(manifest),
    };
    const result = serializeLifecycleExport(fullPayload);
    expect(result.sha256).toBe(createHash("sha256").update(result.body).digest("hex"));
    expect(JSON.parse(result.body)).toEqual(fullPayload);
    expect(result.body).toContain("hermes_console_business_export");
  });

  test("fails closed when preview source rows drift", () => {
    let thrown: unknown;
    try {
      assertLifecycleExportSourceMatches({
        expectedRunIds: ["run_1"],
        actualRunIds: ["run_1", "run_2"],
        expectedMessageCount: 1,
        actualMessageCount: 1,
        expectedArtifactCount: 0,
        actualArtifactCount: 0,
        expectedArtifactBytes: 0,
        actualArtifactBytes: 0,
        expectedArtifactHashes: [],
        actualArtifactHashes: [],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LifecycleExportError);
    expect(thrown).toMatchObject({ code: "LIFECYCLE_EXPORT_SOURCE_CHANGED", status: 409 });
  });

  test("includes octets only after regular-file size and SHA verification", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-lifecycle-export-"));
    try {
      const bytes = Buffer.from("verified export bytes");
      const storagePath = path.join(root, "artifact.bin");
      await writeFile(storagePath, bytes);
      const read = await readVerifiedArtifact(storagePath, root, {
        sizeBytes: bytes.byteLength,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(Buffer.from(read)).toEqual(bytes);
      await expect(
        readVerifiedArtifact(storagePath, root, {
          sizeBytes: bytes.byteLength,
          checksumSha256: "0".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "ARTIFACT_INTEGRITY_FAILED" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
