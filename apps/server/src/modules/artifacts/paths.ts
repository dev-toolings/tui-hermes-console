import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { getFileLimits } from "@/modules/settings/storage-stats";

/** Racine du volume partagé avec Hermes (PRD §16). Défaut local pour le dev. */
export function getSharedWorkdirRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.HERMES_SHARED_WORKDIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.resolve("/tmp/hermes-console-work");
}

export function runWorkdirPath(runId: string, root = getSharedWorkdirRoot()) {
  const safeId = sanitizeSegment(runId);
  return path.join(root, "runs", safeId);
}

export function runInputDir(runId: string, root = getSharedWorkdirRoot()) {
  return path.join(runWorkdirPath(runId, root), "in");
}

export function runOutputDir(runId: string, root = getSharedWorkdirRoot()) {
  return path.join(runWorkdirPath(runId, root), "out");
}

/** Stockage contrôlé par la Console, distinct du volume exposé au runtime. */
export function getConsoleArtifactRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.HERMES_CONSOLE_ARTIFACTS_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.resolve("/tmp/hermes-console-artifacts");
}

export function runArtifactDir(runId: string, root = getConsoleArtifactRoot()) {
  return path.join(root, "runs", sanitizeSegment(runId));
}

export function runArtifactInputDir(
  runId: string,
  root = getConsoleArtifactRoot(),
) {
  return path.join(runArtifactDir(runId, root), "in");
}

export function runArtifactOutputDir(
  runId: string,
  root = getConsoleArtifactRoot(),
) {
  return path.join(runArtifactDir(runId, root), "out");
}

export async function ensureRunWorkdirs(
  runId: string,
  root = getSharedWorkdirRoot(),
) {
  const workdir = runWorkdirPath(runId, root);
  await ensureDirectories(root, ["runs", sanitizeSegment(runId), "in"]);
  await ensureDirectories(root, ["runs", sanitizeSegment(runId), "out"]);
  return workdir;
}

export async function ensureRunArtifactDirs(runId: string) {
  const root = getConsoleArtifactRoot();
  const safeId = sanitizeSegment(runId);
  await ensureDirectories(root, ["runs", safeId, "in"]);
  await ensureDirectories(root, ["runs", safeId, "out"]);
  return runArtifactDir(runId, root);
}

export function sanitizeFilename(filename: string) {
  const base = path
    .basename(filename)
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .trim();
  if (!base || base === "." || base === "..") {
    throw new ArtifactPathError("Nom de fichier invalide.");
  }
  return base.slice(0, 180);
}

export function assertWithinDir(filePath: string, dir: string) {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  if (
    resolved !== resolvedDir &&
    !resolved.startsWith(`${resolvedDir}${path.sep}`)
  ) {
    throw new ArtifactPathError("Chemin hors du répertoire de mission.");
  }
  return resolved;
}

/** Refuse les fichiers spéciaux, symlinks et hardlinks avant toute copie/lecture. */
export async function assertSafeRegularFile(filePath: string, dir: string) {
  const resolved = assertWithinDir(filePath, dir);
  await assertDirectoryTree(path.dirname(resolved), path.resolve(dir));
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new ArtifactPathError("Artefact non régulier ou lié refusé.");
  }
  return {
    path: resolved,
    size: info.size,
    dev: info.dev,
    ino: info.ino,
    nlink: info.nlink,
  };
}

async function ensureDirectories(root: string, segments: string[]) {
  const resolvedRoot = path.resolve(root);
  await mkdir(resolvedRoot, { recursive: true });
  let current = resolvedRoot;
  await assertDirectory(current);
  for (const segment of segments) {
    current = path.join(current, segment);
    await mkdir(current, { recursive: true });
    await assertDirectory(current);
  }
}

async function assertDirectory(dir: string) {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new ArtifactPathError("Répertoire d'artefacts non sûr.");
  }
}

async function assertDirectoryTree(target: string, root: string) {
  let current = root;
  await assertDirectory(current);
  const relative = path.relative(root, target);
  if (!relative) return;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    await assertDirectory(current);
  }
}

export function getArtifactQuotas() {
  return getFileLimits();
}

export class ArtifactPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactPathError";
  }
}

/** Même normalisation que les chemins locaux — indispensable pour que le miroir
 *  distant retombe sur le même nom de dossier. */
export function sanitizeRunId(runId: string) {
  return sanitizeSegment(runId);
}

function sanitizeSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!cleaned) throw new ArtifactPathError("Identifiant de mission invalide.");
  return cleaned;
}
