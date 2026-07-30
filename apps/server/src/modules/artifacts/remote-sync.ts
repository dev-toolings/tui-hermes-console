import { readdir } from "node:fs/promises";
import path from "node:path";
import { getRemoteWorkspace } from "@/modules/runtime/config";
import {
  assertWithinDir,
  ensureRunWorkdirs,
  runInputDir,
  runOutputDir,
  sanitizeFilename,
  sanitizeRunId,
} from "./paths";

/** Chemins d'une mission côté machine distante. Toujours en séparateurs POSIX :
 *  la Console peut tourner sur macOS pendant qu'Hermes est sur Linux. */
export function remoteRunPaths(root: string, runId: string) {
  const base = `${root.replace(/\/+$/, "")}/runs/${sanitizeRunId(runId)}`;
  return { workdir: base, input: `${base}/in`, output: `${base}/out` };
}

/** Racine que Hermes doit voir : la distante en mode tunnel, la locale sinon.
 *  C'est elle qui part dans le prompt et dans `runs.workdir`. */
export async function resolveRunRoot(): Promise<{ root: string; remote: boolean }> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return { root: "", remote: false };
  return { root: workspace.root, remote: true };
}

/** Monte les pièces jointes sur la machine distante avant de lancer le run.
 *  No-op en mode direct : le dossier est déjà partagé. */
export async function pushRunInputs(runId: string): Promise<void> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return;

  const remote = remoteRunPaths(workspace.root, runId);
  const sftp = await workspace.channel.sftp();
  await sftp.mkdirp(remote.input);
  await sftp.mkdirp(remote.output);

  const localDir = runInputDir(runId);
  const names = await readdir(localDir).catch(() => [] as string[]);
  for (const name of names) {
    await sftp.upload(path.join(localDir, name), `${remote.input}/${name}`);
  }
}

/** Rapatrie les fichiers produits par Hermes dans le `out/` local, d'où
 *  `scanOutputArtifacts()` les enregistre sans rien savoir du distant. */
export async function pullRunOutputs(runId: string): Promise<void> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return;

  const remote = remoteRunPaths(workspace.root, runId);
  const sftp = await workspace.channel.sftp();
  const names = await sftp.list(remote.output).catch(() => [] as string[]);
  if (names.length === 0) return;

  await ensureRunWorkdirs(runId);
  const localDir = runOutputDir(runId);
  for (const name of names) {
    // `names` vient de la machine distante : source non fiable. Même traitement
    // que n'importe quel nom entrant (§18 « contrôle des chemins »), sinon un
    // hôte compromis écrit où il veut sur la Console via `../`.
    let target: string;
    try {
      target = assertWithinDir(path.join(localDir, sanitizeFilename(name)), localDir);
    } catch {
      continue; // `.`, `..` et noms hostiles : ignorés, pas fatals.
    }
    // Un fichier illisible (sous-dossier, permission) ne doit pas faire perdre
    // les autres sorties de la mission.
    await sftp.download(`${remote.output}/${name}`, target).catch(() => {});
  }
}
