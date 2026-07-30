import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { artifacts, type ArtifactDirection } from "@/db/schema";
import {
  ArtifactPathError,
  assertWithinDir,
  ensureRunWorkdirs,
  getArtifactQuotas,
  runInputDir,
  runOutputDir,
  sanitizeFilename,
} from "./paths";

export type ArtifactDto = {
  id: string;
  runId: string;
  direction: ArtifactDirection;
  filename: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
};

export class ArtifactError extends Error {
  constructor(
    readonly code:
      | "ARTIFACT_NOT_FOUND"
      | "FILE_TOO_LARGE"
      | "TOO_MANY_FILES"
      | "INVALID_FILENAME"
      | "RUN_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "ArtifactError";
  }
}

export async function depositInputFile(runId: string, file: File): Promise<ArtifactDto> {
  const quotas = getArtifactQuotas();
  if (file.size > quotas.maxFile) {
    throw new ArtifactError(
      "FILE_TOO_LARGE",
      `Fichier trop volumineux (max ${quotas.maxFile} octets).`,
    );
  }

  const existing = await listArtifactsForRun(runId, "input");
  if (existing.length >= quotas.maxCount) {
    throw new ArtifactError(
      "TOO_MANY_FILES",
      `Trop de fichiers d’entrée (max ${quotas.maxCount}).`,
    );
  }
  const total = existing.reduce((sum, item) => sum + item.sizeBytes, 0) + file.size;
  if (total > quotas.maxTotal) {
    throw new ArtifactError(
      "FILE_TOO_LARGE",
      `Quota total de fichiers dépassé (max ${quotas.maxTotal} octets).`,
    );
  }

  await ensureRunWorkdirs(runId);
  let filename: string;
  try {
    filename = sanitizeFilename(file.name || "upload.bin");
  } catch (error) {
    throw new ArtifactError(
      "INVALID_FILENAME",
      error instanceof Error ? error.message : "Nom de fichier invalide.",
    );
  }

  const inputDir = runInputDir(runId);
  const storagePath = assertWithinDir(path.join(inputDir, filename), inputDir);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await writeFile(storagePath, bytes);

  return insertArtifact({
    runId,
    direction: "input",
    filename,
    storagePath,
    mimeType: file.type || null,
    sizeBytes: bytes.byteLength,
    checksumSha256: checksum,
  });
}

/** Scanne `out/` et enregistre les nouveaux artefacts de sortie (idempotent par checksum+nom). */
export async function scanOutputArtifacts(runId: string): Promise<ArtifactDto[]> {
  const outDir = runOutputDir(runId);
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch {
    return [];
  }

  const existing = await listArtifactsForRun(runId, "output");
  const known = new Set(existing.map((item) => `${item.filename}:${item.checksumSha256}`));
  const created: ArtifactDto[] = [];

  for (const name of entries) {
    const full = assertWithinDir(path.join(outDir, name), outDir);
    const info = await stat(full);
    if (!info.isFile()) continue;

    const checksum = await hashFile(full);
    const key = `${name}:${checksum}`;
    if (known.has(key)) continue;

    const row = await insertArtifact({
      runId,
      direction: "output",
      filename: name,
      storagePath: full,
      mimeType: null,
      sizeBytes: info.size,
      checksumSha256: checksum,
    });
    known.add(key);
    created.push(row);
  }

  return created;
}

export async function listArtifactsForRun(
  runId: string,
  direction?: ArtifactDirection,
): Promise<ArtifactDto[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      direction
        ? and(eq(artifacts.runId, runId), eq(artifacts.direction, direction))
        : eq(artifacts.runId, runId),
    )
    .orderBy(desc(artifacts.createdAt));

  return rows.map(toDto);
}

export async function listAllArtifacts(limit = 50): Promise<ArtifactDto[]> {
  const rows = await getDatabase()
    .select()
    .from(artifacts)
    .orderBy(desc(artifacts.createdAt))
    .limit(limit);
  return rows.map(toDto);
}

export async function getArtifact(fileId: string) {
  const [row] = await getDatabase()
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, fileId))
    .limit(1);
  return row ? { ...toDto(row), storagePath: row.storagePath } : null;
}

export function openArtifactStream(storagePath: string) {
  return createReadStream(storagePath);
}

export async function copyIntoOutput(runId: string, sourcePath: string, filename: string) {
  await ensureRunWorkdirs(runId);
  const outDir = runOutputDir(runId);
  const dest = assertWithinDir(path.join(outDir, sanitizeFilename(filename)), outDir);
  await copyFile(sourcePath, dest);
  return dest;
}

async function insertArtifact(input: {
  runId: string;
  direction: ArtifactDirection;
  filename: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string;
}): Promise<ArtifactDto> {
  const id = `file_${randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  await getDatabase().insert(artifacts).values({
    id,
    runId: input.runId,
    direction: input.direction,
    filename: input.filename,
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    createdAt: now,
  });
  return {
    id,
    runId: input.runId,
    direction: input.direction,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    createdAt: now.toISOString(),
  };
}

function toDto(row: typeof artifacts.$inferSelect): ArtifactDto {
  return {
    id: row.id,
    runId: row.runId,
    direction: row.direction,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    createdAt: row.createdAt.toISOString(),
  };
}

async function hashFile(filePath: string) {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

export function isArtifactPathError(error: unknown): error is ArtifactPathError {
  return error instanceof ArtifactPathError;
}
