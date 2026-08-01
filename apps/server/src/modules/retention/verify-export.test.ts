import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { buildLifecycleExportManifest, hashLifecycleExportManifest } from "./export";
import { verifyLifecycleExport } from "./verify-export";

function fixture() {
  const bytes = Buffer.from("verified artifact");
  const payload = {
    version: 1,
    type: "hermes_console_business_export",
    siteId: "site-paris",
    previewId: "preview_1",
    policyVersion: 1,
    retentionDays: 30,
    cutoffAt: "2026-07-01T00:00:00.000Z",
    generatedAt: "2026-08-01T00:00:00.000Z",
    threads: [{ id: "thread_1", siteId: "site-paris" }],
    runs: [{ id: "run_1", siteId: "site-paris", threadId: "thread_1" }],
    messages: [{ id: "message_1", threadId: "thread_1", runId: "run_1" }],
    events: [{ id: 1, runId: "run_1" }],
    artifacts: [{
      id: "artifact_1",
      siteId: "site-paris",
      runId: "run_1",
      sizeBytes: bytes.byteLength,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      bytesBase64: bytes.toString("base64"),
    }],
  };
  const manifest = buildLifecycleExportManifest(payload);
  return JSON.stringify({ ...payload, manifest, manifestSha256: hashLifecycleExportManifest(manifest) });
}

describe("lifecycle export verifier", () => {
  test("verifies bundle digest and every artifact before external handling", () => {
    const body = fixture();
    const digest = createHash("sha256").update(body).digest("hex");
    expect(verifyLifecycleExport(body, digest)).toMatchObject({
      sha256: digest,
      previewId: "preview_1",
      artifactCount: 1,
      artifactBytes: 17,
    });
  });

  test("rejects a changed bundle or corrupted artifact", () => {
    const body = fixture();
    expect(() => verifyLifecycleExport(body, "0".repeat(64))).toThrow("LIFECYCLE_EXPORT_DIGEST_MISMATCH");
    const parsed = JSON.parse(body) as { artifacts: Array<{ bytesBase64: string }> };
    parsed.artifacts[0]!.bytesBase64 = Buffer.from("tampered").toString("base64");
    expect(() => verifyLifecycleExport(JSON.stringify(parsed))).toThrow(
      "LIFECYCLE_EXPORT_ARTIFACT_INTEGRITY_FAILED",
    );
  });

  test("rejects a tampered manifest and cross-site or orphan relations", () => {
    const tampered = JSON.parse(fixture()) as { manifest: { artifactBytes: number } };
    tampered.manifest.artifactBytes = 999;
    expect(() => verifyLifecycleExport(JSON.stringify(tampered))).toThrow(
      "LIFECYCLE_EXPORT_MANIFEST_MISMATCH",
    );

    const crossSite = JSON.parse(fixture()) as { runs: Array<{ siteId: string }> };
    crossSite.runs[0]!.siteId = "site-lyon";
    expect(() => verifyLifecycleExport(JSON.stringify(crossSite))).toThrow(
      "LIFECYCLE_EXPORT_SITE_MISMATCH",
    );

    const orphan = JSON.parse(fixture()) as { messages: Array<{ threadId: string }> };
    orphan.messages[0]!.threadId = "thread-missing";
    expect(() => verifyLifecycleExport(JSON.stringify(orphan))).toThrow(
      "LIFECYCLE_EXPORT_ORPHAN_MESSAGE",
    );
  });
});
