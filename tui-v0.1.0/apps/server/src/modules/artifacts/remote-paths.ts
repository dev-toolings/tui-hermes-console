import { getRemoteWorkspace } from "@/modules/runtime/config";
import { sanitizeRunId } from "./paths";

/** Chemins d'une mission côté machine distante. Toujours en séparateurs POSIX :
 *  la Console peut tourner sur macOS pendant qu'Hermes est sur Linux. */
export function remoteRunPaths(root: string, runId: string) {
  const base = `${root.replace(/\/+$/, "")}/runs/${sanitizeRunId(runId)}`;
  return { workdir: base, input: `${base}/in`, output: `${base}/out` };
}

/** Racine que Hermes doit voir : la distante en mode tunnel, la locale sinon.
 *  C'est elle qui part dans le prompt et dans `runs.workdir`.
 *
 *  Depuis le 08-08-2026, la Console ne transfère plus les fichiers elle-même.
 *  Le répertoire de travail est partagé, par bind mount côté runtime distant
 *  (`US-G1-SSH-010`) ou par volume commun en mode direct. */
export async function resolveRunRoot(): Promise<{
  root: string;
  remote: boolean;
}> {
  const workspace = await getRemoteWorkspace();
  if (!workspace) return { root: "", remote: false };
  return { root: workspace.hermesRoot, remote: true };
}
