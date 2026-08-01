import { randomUUID } from "node:crypto";
import { link, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { getRemoteWorkspace } from "@/modules/runtime/config";
import type { SftpOps } from "@/modules/runtime/ssh";
import {
  assertWithinDir,
  assertSafeRegularFile,
  ensureRunWorkdirs,
  getArtifactQuotas,
  runInputDir,
  runOutputDir,
  sanitizeFilename,
  sanitizeRunId,
} from "./paths";

type RemoteWorkspace = {
  channel: { sftp(): Promise<SftpOps> };
  root: string;
};

export class RemoteSyncError extends Error {
  constructor(
    readonly runId: string,
    readonly operation:
      | "open_sftp"
      | "prepare_remote"
      | "list_local_inputs"
      | "validate_local_input"
      | "upload_input"
      | "list_remote_outputs"
      | "stat_remote_output"
      | "validate_remote_output"
      | "output_quota"
      | "download_output"
      | "commit_output",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(
      `Synchronisation distante ${runId} (${operation}) : ${message}`,
      options,
    );
    this.name = "RemoteSyncError";
  }
}

/** Chemins d'une mission côté machine distante. Toujours en séparateurs POSIX :
 *  la Console peut tourner sur macOS pendant qu'Hermes est sur Linux. */
export function remoteRunPaths(root: string, runId: string) {
  const base = `${root.replace(/\/+$/, "")}/runs/${sanitizeRunId(runId)}`;
  return { workdir: base, input: `${base}/in`, output: `${base}/out` };
}

/** Racine que Hermes doit voir : la distante en mode tunnel, la locale sinon.
 *  C'est elle qui part dans le prompt et dans `runs.workdir`. */
export async function resolveRunRoot(): Promise<{
  root: string;
  remote: boolean;
}> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return { root: "", remote: false };
  return { root: workspace.root, remote: true };
}

/** Monte les pièces jointes sur la machine distante avant de lancer le run.
 *  No-op en mode direct : le dossier est déjà partagé. */
export async function pushRunInputs(runId: string): Promise<void> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return;
  await pushRunInputsToWorkspace(runId, workspace);
}

export async function pushRunInputsToWorkspace(
  runId: string,
  workspace: RemoteWorkspace,
  localRoot?: string,
): Promise<void> {
  const remote = remoteRunPaths(workspace.root, runId);
  const sftp = await correlated(runId, "open_sftp", () =>
    workspace.channel.sftp(),
  );
  await correlated(runId, "prepare_remote", async () => {
    await sftp.mkdirp(remote.input);
    await sftp.mkdirp(remote.output);
  });

  const localDir = runInputDir(runId, localRoot);
  const names = await correlated(runId, "list_local_inputs", () =>
    readdir(localDir),
  );
  for (const name of names) {
    // Le volume partagé peut être modifié par le runtime : ne jamais laisser
    // un lien local devenir une source de lecture lors de la synchro SSH.
    if (!isSafeFilename(name)) {
      throw new RemoteSyncError(
        runId,
        "validate_local_input",
        `nom local refusé : ${JSON.stringify(name)}`,
      );
    }
    try {
      await assertSafeRegularFile(path.join(localDir, name), localDir);
    } catch (error) {
      throw new RemoteSyncError(
        runId,
        "validate_local_input",
        `fichier local non régulier : ${JSON.stringify(name)}`,
        { cause: error },
      );
    }
    await correlated(runId, "upload_input", () =>
      sftp.upload(path.join(localDir, name), `${remote.input}/${name}`),
    );
  }
}

/** Rapatrie les fichiers produits par Hermes dans le `out/` local, d'où
 *  `scanOutputArtifacts()` les enregistre sans rien savoir du distant. */
export async function pullRunOutputs(runId: string): Promise<void> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return;
  await pullRunOutputsFromWorkspace(runId, workspace);
}

export async function pullRunOutputsFromWorkspace(
  runId: string,
  workspace: RemoteWorkspace,
  localRoot?: string,
  limits = getArtifactQuotas(),
): Promise<void> {
  const remote = remoteRunPaths(workspace.root, runId);
  const sftp = await correlated(runId, "open_sftp", () =>
    workspace.channel.sftp(),
  );
  const names = await correlated(runId, "list_remote_outputs", () =>
    sftp.list(remote.output, limits.maxCount),
  );
  if (names.length === 0) return;

  // Préflight complet avant le premier octet transféré : le transport expose
  // lstat, donc type et taille peuvent être refusés sans remplir le volume.
  const seen = new Set<string>();
  for (const name of names) {
    if (!isSafeFilename(name) || seen.has(name)) {
      throw new RemoteSyncError(
        runId,
        "validate_remote_output",
        `nom distant invalide ou dupliqué : ${JSON.stringify(name)}`,
      );
    }
    seen.add(name);
  }
  if (names.length > limits.maxCount) {
    throw new RemoteSyncError(
      runId,
      "output_quota",
      `répertoire distant hors quota (plus de ${limits.maxCount} fichiers)`,
    );
  }

  const candidates: Array<{ name: string; size: number }> = [];
  let totalSize = 0;
  for (const name of names) {
    const remotePath = `${remote.output}/${name}`;
    const info = await correlated(runId, "stat_remote_output", () =>
      sftp.stat(remotePath),
    );
    if (
      info.type !== "file" ||
      !Number.isSafeInteger(info.size) ||
      info.size < 0
    ) {
      throw new RemoteSyncError(
        runId,
        "validate_remote_output",
        `sortie distante non régulière : ${JSON.stringify(name)}`,
      );
    }
    if (info.size > limits.maxFile) {
      throw new RemoteSyncError(
        runId,
        "output_quota",
        `sortie ${JSON.stringify(name)} trop volumineuse (${info.size} octets)`,
      );
    }
    totalSize += info.size;
    if (!Number.isSafeInteger(totalSize) || totalSize > limits.maxTotal) {
      throw new RemoteSyncError(
        runId,
        "output_quota",
        `lot distant hors quota (${candidates.length + 1} fichiers, ${totalSize} octets)`,
      );
    }
    candidates.push({ name, size: info.size });
  }

  await ensureRunWorkdirs(runId, localRoot);
  const localDir = runOutputDir(runId, localRoot);
  for (const { name, size } of candidates) {
    let target: string;
    try {
      target = assertWithinDir(path.join(localDir, name), localDir);
    } catch (error) {
      throw new RemoteSyncError(
        runId,
        "validate_remote_output",
        `chemin distant refusé : ${JSON.stringify(name)}`,
        { cause: error },
      );
    }
    try {
      // Ne pas écraser un noeud préexistant dans le volume contrôlé par
      // Hermes : un lien y redirigerait l'écriture SFTP hors de la mission.
      await (await import("node:fs/promises")).lstat(target);
      throw new RemoteSyncError(
        runId,
        "validate_remote_output",
        `cible locale déjà présente : ${JSON.stringify(name)}`,
      );
    } catch (error) {
      if (error instanceof RemoteSyncError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new RemoteSyncError(
          runId,
          "validate_remote_output",
          `cible locale illisible : ${JSON.stringify(name)}`,
          { cause: error },
        );
      }
    }
    // Le transport écrit dans un nom temporaire. Une coupure SFTP ne laisse
    // donc jamais un fichier partiel portant le nom final de l'artefact.
    const temporary = assertWithinDir(
      `${target}.${randomUUID()}.part`,
      localDir,
    );
    let targetLinked = false;
    try {
      await correlated(runId, "download_output", () =>
        sftp.download(`${remote.output}/${name}`, temporary, size),
      );
      try {
        const downloaded = await assertSafeRegularFile(temporary, localDir);
        if (downloaded.size !== size) {
          throw new Error(
            `taille reçue ${downloaded.size}, taille annoncée ${size}`,
          );
        }
      } catch (error) {
        throw new RemoteSyncError(
          runId,
          "validate_remote_output",
          `téléchargement non régulier : ${JSON.stringify(name)}`,
          { cause: error },
        );
      }
      // `rename()` écraserait un noeud créé entre le lstat et le commit. Le
      // hardlink avec destination exclusive rend le commit atomique, puis la
      // suppression du nom temporaire ramène le fichier final à nlink=1.
      await correlated(runId, "commit_output", async () => {
        await link(temporary, target);
        targetLinked = true;
        await rm(temporary);
      });
    } catch (error) {
      await Promise.all([
        rm(temporary, { force: true }),
        targetLinked ? rm(target, { force: true }) : Promise.resolve(),
      ]);
      throw error;
    }
  }
}

function isSafeFilename(name: string) {
  try {
    return sanitizeFilename(name) === name;
  } catch {
    return false;
  }
}

async function correlated<T>(
  runId: string,
  operation: RemoteSyncError["operation"],
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof RemoteSyncError) throw error;
    throw new RemoteSyncError(runId, operation, "échec explicite du transport", {
      cause: error,
    });
  }
}
