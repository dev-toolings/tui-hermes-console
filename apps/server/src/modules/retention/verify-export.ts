import { createHash } from "node:crypto";
import { z } from "zod";

const artifactSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/i),
    bytesBase64: z.string(),
  })
  .passthrough();

const exportSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("hermes_console_business_export"),
    previewId: z.string().min(1),
    artifacts: z.array(artifactSchema),
  })
  .passthrough();

export type VerifiedLifecycleExport = {
  sha256: string;
  previewId: string;
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
  const bundle = exportSchema.parse(parsed);
  const ids = new Set<string>();
  let artifactBytes = 0;
  for (const artifact of bundle.artifacts) {
    if (ids.has(artifact.id)) throw new Error("LIFECYCLE_EXPORT_DUPLICATE_ARTIFACT");
    ids.add(artifact.id);
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
  return {
    sha256,
    previewId: bundle.previewId,
    artifactCount: bundle.artifacts.length,
    artifactBytes,
  };
}
