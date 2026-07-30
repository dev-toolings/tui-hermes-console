import { mkdir } from "node:fs/promises";
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

export async function ensureRunWorkdirs(runId: string) {
  const root = getSharedWorkdirRoot();
  const workdir = runWorkdirPath(runId, root);
  await mkdir(runInputDir(runId, root), { recursive: true });
  await mkdir(runOutputDir(runId, root), { recursive: true });
  return workdir;
}

export function sanitizeFilename(filename: string) {
  const base = path.basename(filename).replace(/[^\w.\- ()[\]]+/g, "_").trim();
  if (!base || base === "." || base === "..") {
    throw new ArtifactPathError("Nom de fichier invalide.");
  }
  return base.slice(0, 180);
}

export function assertWithinDir(filePath: string, dir: string) {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  if (resolved !== resolvedDir && !resolved.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new ArtifactPathError("Chemin hors du répertoire de mission.");
  }
  return resolved;
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

function sanitizeSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (!cleaned) throw new ArtifactPathError("Identifiant de mission invalide.");
  return cleaned;
}
