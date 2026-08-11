import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { ArtifactPathError, assertSafeRegularFile } from "./paths";

export type ArtifactIntegrityExpectation = {
  sizeBytes: number;
  checksumSha256: string;
};

export class ArtifactIntegrityError extends Error {
  constructor(
    readonly code:
      | "ARTIFACT_BYTES_MISSING"
      | "ARTIFACT_STORAGE_INVALID"
      | "ARTIFACT_INTEGRITY_FAILED"
      | "ARTIFACT_READ_FAILED",
    message: string,
    readonly status: 409 | 410 | 503,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ArtifactIntegrityError";
  }
}

/**
 * Lit l'artefact en entier avant de construire la réponse HTTP. Le buffer est
 * borné par le quota d'upload (20 MiB par défaut) et évite d'émettre un 200
 * partiel avant de découvrir une corruption en fin de flux.
 */
export async function readVerifiedArtifact(
  storagePath: string,
  root: string,
  expected: ArtifactIntegrityExpectation,
): Promise<Uint8Array> {
  let safe: Awaited<ReturnType<typeof assertSafeRegularFile>>;
  try {
    safe = await assertSafeRegularFile(storagePath, root);
  } catch (error) {
    if (isMissing(error)) {
      throw new ArtifactIntegrityError(
        "ARTIFACT_BYTES_MISSING",
        "Les octets de l’artefact ne sont plus disponibles.",
        410,
        { cause: error },
      );
    }
    if (error instanceof ArtifactPathError) {
      throw new ArtifactIntegrityError(
        "ARTIFACT_STORAGE_INVALID",
        "Le chemin de stockage de l’artefact est refusé.",
        409,
        { cause: error },
      );
    }
    throw readFailure(error);
  }

  if (safe.size !== expected.sizeBytes) {
    throw integrityFailure();
  }

  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(safe.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isMissing(error)) {
      throw new ArtifactIntegrityError(
        "ARTIFACT_BYTES_MISSING",
        "Les octets de l’artefact ne sont plus disponibles.",
        410,
        { cause: error },
      );
    }
    throw readFailure(error);
  }

  try {
    const before = await handle.stat();
    if (!sameNode(before, safe) || before.size !== expected.sizeBytes) {
      throw integrityFailure();
    }

    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      !sameNode(after, before) ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      bytes.byteLength !== expected.sizeBytes
    ) {
      throw integrityFailure();
    }

    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== expected.checksumSha256.toLowerCase()) {
      throw integrityFailure();
    }
    return bytes;
  } catch (error) {
    if (error instanceof ArtifactIntegrityError) throw error;
    throw readFailure(error);
  } finally {
    await handle.close();
  }
}

function sameNode(
  left: { dev: number | bigint; ino: number | bigint; nlink: number },
  right: { dev: number | bigint; ino: number | bigint; nlink: number },
) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.nlink === 1 &&
    right.nlink === 1
  );
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function integrityFailure() {
  return new ArtifactIntegrityError(
    "ARTIFACT_INTEGRITY_FAILED",
    "L’artefact stocké ne correspond plus à sa taille ou à son empreinte SHA-256.",
    409,
  );
}

function readFailure(error: unknown) {
  return new ArtifactIntegrityError(
    "ARTIFACT_READ_FAILED",
    "Le stockage d’artefacts est temporairement illisible.",
    503,
    { cause: error },
  );
}
