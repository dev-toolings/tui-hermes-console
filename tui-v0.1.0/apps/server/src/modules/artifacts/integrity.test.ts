import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { readVerifiedArtifact } from "./integrity";

describe("readVerifiedArtifact", () => {
  test("returns bytes only when size and SHA-256 match", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-integrity-"));
    try {
      const bytes = Buffer.from("durable artifact");
      const storagePath = path.join(root, "artifact.txt");
      await writeFile(storagePath, bytes);

      const result = await readVerifiedArtifact(storagePath, root, {
        sizeBytes: bytes.byteLength,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      });

      expect(Buffer.from(result).toString()).toBe("durable artifact");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails explicitly when persisted bytes are missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-integrity-"));
    try {
      await expect(
        readVerifiedArtifact(path.join(root, "missing.txt"), root, {
          sizeBytes: 1,
          checksumSha256: "0".repeat(64),
        }),
      ).rejects.toMatchObject({
        code: "ARTIFACT_BYTES_MISSING",
        status: 410,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails explicitly when persisted bytes are corrupted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-integrity-"));
    try {
      const storagePath = path.join(root, "artifact.txt");
      await writeFile(storagePath, "tampered");

      await expect(
        readVerifiedArtifact(storagePath, root, {
          sizeBytes: 8,
          checksumSha256: createHash("sha256").update("expected").digest("hex"),
        }),
      ).rejects.toMatchObject({
        code: "ARTIFACT_INTEGRITY_FAILED",
        status: 409,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
