import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { verifyLifecycleExport } from "./verify-export";

function fixture() {
  const bytes = Buffer.from("verified artifact");
  return JSON.stringify({
    version: 1,
    type: "hermes_console_business_export",
    previewId: "preview_1",
    artifacts: [{
      id: "artifact_1",
      runId: "run_1",
      sizeBytes: bytes.byteLength,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      bytesBase64: bytes.toString("base64"),
    }],
  });
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
});
