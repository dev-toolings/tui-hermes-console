import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  createReadStream,
  createWriteStream,
  type ReadStream,
  type Stats,
} from "node:fs";
import { open, opendir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { artifacts, runs, siteMemberships, type ArtifactDirection } from "@/db/schema";
import type { SiteRequestContext, SiteScope } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { auditOwnershipCreation } from "@/modules/ownership/audit";
import {
  ArtifactPathError,
  assertSafeRegularFile,
  assertWithinDir,
  ensureRunArtifactDirs,
  ensureRunWorkdirs,
  getArtifactQuotas,
  runArtifactInputDir,
  runArtifactOutputDir,
  runInputDir,
  runOutputDir,
  sanitizeFilename,
} from "./paths";

export type { ArtifactDto } from "@console/core/types/api";
import type { ArtifactDto } from "@console/core/types/api";

type ArtifactAudit = {
  context: SiteRequestContext;
  reasonCode?: string;
};

export class ArtifactError extends Error {
  constructor(
    readonly code:
      | "ARTIFACT_NOT_FOUND"
      | "FILE_TOO_LARGE"
      | "TOO_MANY_FILES"
      | "INVALID_FILENAME"
      | "RUN_REQUIRED"
      | "ARTIFACT_OUTPUT_UNAVAILABLE"
      | "ARTIFACT_OUTPUT_INVALID"
      | "ARTIFACT_OUTPUT_QUOTA_EXCEEDED",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ArtifactError";
  }
}

function isRequesterScope(scope: SiteScope): scope is SiteRequestContext {
  return "role" in scope && scope.role === "requester" && "userId" in scope;
}

export async function depositInputFile(
  context: SiteRequestContext,
  runId: string,
  file: File,
): Promise<ArtifactDto> {
  const runScope = await resolveRunScope(context, runId, true);
  const quotas = getArtifactQuotas();
  if (file.size > quotas.maxFile) {
    throw new ArtifactError(
      "FILE_TOO_LARGE",
      `Fichier trop volumineux (max ${quotas.maxFile} octets).`,
    );
  }

  const existing = await listArtifactsForRun(context, runId, "input");
  if (existing.length >= quotas.maxCount) {
    throw new ArtifactError(
      "TOO_MANY_FILES",
      `Trop de fichiers d’entrée (max ${quotas.maxCount}).`,
    );
  }
  const total =
    existing.reduce((sum, item) => sum + item.sizeBytes, 0) + file.size;
  if (total > quotas.maxTotal) {
    throw new ArtifactError(
      "FILE_TOO_LARGE",
      `Quota total de fichiers dépassé (max ${quotas.maxTotal} octets).`,
    );
  }

  await ensureRunWorkdirs(runId);
  await ensureRunArtifactDirs(runId);
  let filename: string;
  try {
    filename = sanitizeFilename(file.name || "upload.bin");
  } catch (error) {
    throw new ArtifactError(
      "INVALID_FILENAME",
      error instanceof Error ? error.message : "Nom de fichier invalide.",
    );
  }

  const inputDir = runArtifactInputDir(runId);
  const storagePath = assertWithinDir(path.join(inputDir, filename), inputDir);
  const stagedPath = assertWithinDir(
    path.join(runInputDir(runId), filename),
    runInputDir(runId),
  );
  const { checksum, sizeBytes } = await writeFileWithHash(file, storagePath);
  try {
    await copySafeFile(storagePath, stagedPath, runInputDir(runId));
  } catch (error) {
    await rm(storagePath, { force: true });
    throw error;
  }

  try {
    return await insertArtifact({
      ...runScope,
      authorUserId: context.userId,
      runId,
      direction: "input",
      filename,
      storagePath,
      mimeType: file.type || null,
      sizeBytes,
      checksumSha256: checksum,
    }, { context });
  } catch (error) {
    await Promise.all([
      rm(storagePath, { force: true }),
      rm(stagedPath, { force: true }),
    ]);
    throw error;
  }
}

/** Scanne `out/` et enregistre les nouveaux artefacts de sortie (idempotent par checksum+nom). */
export async function scanOutputArtifacts(
  scope: SiteScope,
  runId: string,
): Promise<ArtifactDto[]> {
  const runScope = await resolveRunScope(scope, runId, false);
  const audit = await resolveArtifactAuditContext(
    scope,
    runId,
    runScope.authorUserId,
    runScope.ownerUserId,
  );
  const outDir = runOutputDir(runId);
  const existing = await listArtifactsForRun(scope, runId, "output");
  const quotas = getArtifactQuotas();
  const remainingCount = Math.max(0, quotas.maxCount - existing.length);
  let entries: string[];
  try {
    entries = await readDirectoryBounded(outDir, remainingCount);
  } catch (error) {
    throw new ArtifactError(
      "ARTIFACT_OUTPUT_UNAVAILABLE",
      `Répertoire de sorties indisponible pour ${runId}.`,
      { cause: error },
    );
  }

  // Valider les noms bornés avant le quota conserve un diagnostic hostile
  // explicite, sans ouvrir ni copier le moindre output.
  for (const name of entries) validateOutputFilename(name);
  if (entries.length > remainingCount) {
    throw new ArtifactError(
      "ARTIFACT_OUTPUT_QUOTA_EXCEEDED",
      `Plus de ${remainingCount} nouvelle(s) sortie(s) pour cette mission.`,
    );
  }

  const known = new Set(
    existing.map((item) => `${item.filename}:${item.checksumSha256}`),
  );
  const created: ArtifactDto[] = [];
  let total = existing.reduce((sum, item) => sum + item.sizeBytes, 0);
  for (const name of entries) {
    const safeName = validateOutputFilename(name);
    let source: { path: string; size: number };
    try {
      source = await assertSafeRegularFile(path.join(outDir, name), outDir);
    } catch (error) {
      throw new ArtifactError(
        "ARTIFACT_OUTPUT_INVALID",
        `Sortie non régulière refusée : ${JSON.stringify(name)}.`,
        { cause: error },
      );
    }
    assertOutputArtifactQuota(
      name,
      source.size,
      { count: created.length + existing.length, total },
      quotas,
    );

    const privateOutDir = runArtifactOutputDir(runId);
    await ensureRunArtifactDirs(runId);
    // Le nom visible reste celui fourni par Hermes, mais la copie privée est
    // immuable : une réécriture ultérieure de `report.csv` ne corrompt pas un
    // ancien artefact déjà référencé en base.
    const storagePath = assertWithinDir(
      path.join(privateOutDir, `${randomUUID()}-${name}`),
      privateOutDir,
    );
    let checksum: string;
    try {
      checksum = await copySafeFile(source.path, storagePath, privateOutDir);
    } catch (error) {
      throw new ArtifactError(
        "ARTIFACT_OUTPUT_INVALID",
        `Copie privée impossible pour ${JSON.stringify(name)}.`,
        { cause: error },
      );
    }
    const key = `${name}:${checksum}`;
    if (known.has(key)) {
      await rm(storagePath, { force: true });
      continue;
    }

    let row: ArtifactDto;
    try {
      row = await insertArtifact({
        ...runScope,
        runId,
        direction: "output",
        filename: name,
        storagePath,
        mimeType: null,
        sizeBytes: source.size,
        checksumSha256: checksum,
      }, audit);
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }
    known.add(key);
    total += source.size;
    created.push(row);
  }

  return created;
}

async function resolveArtifactAuditContext(
  scope: SiteScope,
  runId: string,
  authorUserId: string,
  ownerUserId: string,
): Promise<ArtifactAudit> {
  const [membership] = await getDatabase()
    .select({ role: siteMemberships.role })
    .from(siteMemberships)
    .where(and(
      eq(siteMemberships.siteId, scope.siteId),
      eq(siteMemberships.userId, authorUserId),
    ))
    .limit(1);
  if (membership) {
    return {
      context: {
        siteId: scope.siteId,
        userId: authorUserId,
        role: membership.role,
        correlationId: `artifact:${runId}`,
      },
    };
  }
  // L'auteur est une identité historique et immuable : sa révocation ne doit
  // pas empêcher la livraison asynchrone d'une sortie. Le propriétaire actif
  // devient alors l'acteur explicitement traçable de cette livraison tardive;
  // ce n'est pas une élévation de rôle ni un remplacement de l'auteur.
  const [ownerMembership] = await getDatabase()
    .select({ role: siteMemberships.role })
    .from(siteMemberships)
    .where(and(
      eq(siteMemberships.siteId, scope.siteId),
      eq(siteMemberships.userId, ownerUserId),
    ))
    .limit(1);
  if (!ownerMembership) {
    throw new Error("Le propriétaire du run n'a plus de membership active pour auditer l'artefact.");
  }
  return {
    context: {
      siteId: scope.siteId,
      userId: ownerUserId,
      role: ownerMembership.role,
      correlationId: `artifact:${runId}`,
    },
    reasonCode: "RESOURCE_OUTPUT_DELIVERED_AFTER_AUTHOR_REVOCATION",
  };
}

export async function readDirectoryBounded(
  directory: string,
  maxEntries: number,
) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new Error("limite de répertoire local invalide");
  }
  const handle = await opendir(directory);
  const names: string[] = [];
  try {
    while (names.length < maxEntries + 1) {
      const entry = await handle.read();
      if (!entry) break;
      names.push(entry.name);
    }
    return names;
  } finally {
    await handle.close();
  }
}

function validateOutputFilename(name: string) {
  let safeName: string;
  try {
    safeName = sanitizeFilename(name);
  } catch (error) {
    throw new ArtifactError(
      "ARTIFACT_OUTPUT_INVALID",
      `Nom de sortie invalide : ${JSON.stringify(name)}.`,
      { cause: error },
    );
  }
  if (safeName !== name) {
    throw new ArtifactError(
      "ARTIFACT_OUTPUT_INVALID",
      `Nom de sortie non normalisé : ${JSON.stringify(name)}.`,
    );
  }
  return safeName;
}

export function assertOutputArtifactQuota(
  filename: string,
  size: number,
  current: { count: number; total: number },
  limits: { maxFile: number; maxTotal: number; maxCount: number },
) {
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    size > limits.maxFile ||
    current.count >= limits.maxCount ||
    current.total + size > limits.maxTotal
  ) {
    throw new ArtifactError(
      "ARTIFACT_OUTPUT_QUOTA_EXCEEDED",
      `Sortie ${JSON.stringify(filename)} refusée par les quotas d’artefacts.`,
    );
  }
}

export async function listArtifactsForRun(
  scope: SiteScope,
  runId: string,
  direction?: ArtifactDirection,
): Promise<ArtifactDto[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      direction
        ? and(
            eq(artifacts.siteId, scope.siteId),
            eq(artifacts.runId, runId),
            eq(artifacts.direction, direction),
            isRequesterScope(scope)
              ? eq(artifacts.ownerUserId, scope.userId)
              : undefined,
          )
        : and(
            eq(artifacts.siteId, scope.siteId),
            eq(artifacts.runId, runId),
            isRequesterScope(scope)
              ? eq(artifacts.ownerUserId, scope.userId)
              : undefined,
          ),
    )
    .orderBy(desc(artifacts.createdAt));

  return rows.map(toDto);
}

export async function listAllArtifacts(scope: SiteRequestContext, limit = 50): Promise<ArtifactDto[]> {
  const rows = await getDatabase()
    .select()
    .from(artifacts)
    .where(and(
      eq(artifacts.siteId, scope.siteId),
      scope.role === "requester" ? eq(artifacts.ownerUserId, scope.userId) : undefined,
    ))
    .orderBy(desc(artifacts.createdAt))
    .limit(limit);
  return rows.map(toDto);
}

export async function getArtifact(context: SiteRequestContext, fileId: string) {
  const [row] = await getDatabase()
    .select()
    .from(artifacts)
    .where(and(
      eq(artifacts.siteId, context.siteId),
      eq(artifacts.id, fileId),
      context.role === "requester" ? eq(artifacts.ownerUserId, context.userId) : undefined,
    ))
    .limit(1);
  if (!row) {
    await auditScopedMiss(context, { action: "artifact.read", resourceType: "artifact", resourceId: fileId });
    return null;
  }
  return { ...toDto(row), storagePath: row.storagePath };
}

export function openArtifactStream(storagePath: string) {
  return createReadStream(storagePath);
}

export async function copyIntoOutput(
  runId: string,
  sourcePath: string,
  filename: string,
) {
  await ensureRunWorkdirs(runId);
  const outDir = runOutputDir(runId);
  const dest = assertWithinDir(
    path.join(outDir, sanitizeFilename(filename)),
    outDir,
  );
  await copySafeFile(sourcePath, dest, outDir);
  return dest;
}

async function insertArtifact(input: {
  siteId: string;
  projectId: string | null;
  ownerUserId: string;
  authorUserId: string;
  runId: string;
  direction: ArtifactDirection;
  filename: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string;
}, audit?: ArtifactAudit): Promise<ArtifactDto> {
  const id = `file_${randomUUID().replaceAll("-", "")}`;
  const now = new Date();
  const values = {
    id,
    siteId: input.siteId,
    projectId: input.projectId,
    ownerUserId: input.ownerUserId,
    authorUserId: input.authorUserId,
    runId: input.runId,
    direction: input.direction,
    filename: input.filename,
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    createdAt: now,
  };
  if (audit) {
    await getDatabase().transaction(async (tx) => {
      await tx.insert(artifacts).values(values);
      await auditOwnershipCreation(tx, audit.context, {
        resourceType: "artifact",
        resourceId: id,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        authorUserId: input.authorUserId,
      }, { reasonCode: audit.reasonCode });
    });
  } else {
    await getDatabase().insert(artifacts).values(values);
  }
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

async function resolveRunScope(
  scope: SiteScope,
  runId: string,
  auditMiss: boolean,
) {
  const [run] = await getDatabase()
    .select({
      siteId: runs.siteId,
      projectId: runs.projectId,
      ownerUserId: runs.ownerUserId,
      authorUserId: runs.authorUserId,
    })
    .from(runs)
    .where(and(
      eq(runs.siteId, scope.siteId),
      eq(runs.id, runId),
      isRequesterScope(scope)
        ? eq(runs.ownerUserId, scope.userId)
        : undefined,
    ))
    .limit(1);
  if (run) return run;
  if (auditMiss && "userId" in scope) {
    await auditScopedMiss(scope as SiteRequestContext, {
      action: "artifact.create",
      resourceType: "run",
      resourceId: runId,
    });
  }
  throw new ArtifactError("RUN_REQUIRED", "Mission introuvable.");
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

async function writeFileWithHash(file: File, destination: string) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      file.stream() as unknown as NodeJS.ReadableStream,
      hashing,
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
    );
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
  return { checksum: hash.digest("hex"), sizeBytes };
}

export type CopySourceHandle = {
  stat(): Promise<Stats>;
  createReadStream(options: { autoClose: boolean }): ReadStream;
  close(): Promise<void>;
};

export type CopySafeFileOptions = {
  openSource?: (sourcePath: string, flags: number) => Promise<CopySourceHandle>;
};

export async function copySafeFile(
  sourcePath: string,
  destination: string,
  destinationDir: string,
  options: CopySafeFileOptions = {},
) {
  const sourceDir = path.dirname(sourcePath);
  const source = await assertSafeRegularFile(sourcePath, sourceDir);
  const dest = assertWithinDir(destination, destinationDir);
  const temp = assertWithinDir(`${dest}.${randomUUID()}.part`, destinationDir);
  const hash = createHash("sha256");
  let copiedBytes = 0;
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      if (copiedBytes + chunk.length > source.size) {
        callback(new ArtifactPathError("Artefact agrandi pendant sa copie."));
        return;
      }
      copiedBytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  let sourceHandle: CopySourceHandle | null = null;
  try {
    sourceHandle = await (options.openSource ?? open)(
      source.path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = await sourceHandle.stat();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.dev !== source.dev ||
      before.ino !== source.ino ||
      before.size !== source.size
    ) {
      throw new ArtifactPathError("Artefact remplacé avant sa copie.");
    }
    await pipeline(
      sourceHandle.createReadStream({ autoClose: false }),
      hashing,
      createWriteStream(temp, { flags: "wx", mode: 0o600 }),
    );
    // Les deux vérifications portent sur le descripteur déjà ouvert : aucune
    // substitution de chemin ou symlink concurrent ne peut changer la source.
    const after = await sourceHandle.stat();
    if (
      !after.isFile() ||
      after.nlink !== 1 ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== source.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new ArtifactPathError("Artefact modifié pendant sa copie.");
    }
    if (copiedBytes !== source.size) {
      throw new ArtifactPathError("Artefact tronqué pendant sa copie.");
    }
    // La fermeture fait partie de la validation. Publier par rename avant son
    // succès laisserait un artefact final orphelin si close échouait ensuite.
    const handleToClose = sourceHandle;
    sourceHandle = null;
    await handleToClose.close();
    await rename(temp, dest);
    return hash.digest("hex");
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  } finally {
    await sourceHandle?.close();
  }
}

export function isArtifactPathError(
  error: unknown,
): error is ArtifactPathError {
  return error instanceof ArtifactPathError;
}
