import path from "node:path";
import { runOutputDir } from "./paths";
import { remoteRunPaths } from "./remote-sync";

/** Injecte les chemins d’entrée + consigne d’écriture out/ dans le prompt Hermes.
 *  `remoteRoot` renseigné = runtime distant : les chemins doivent être ceux qu'Hermes
 *  voit sur sa propre machine, pas ceux de la Console. */
export function augmentPromptWithArtifacts(input: {
  prompt: string;
  inputArtifacts: Array<{ filename: string; absolutePath: string }>;
  runId: string;
  remoteRoot?: string | null;
}): string {
  const remote = input.remoteRoot ? remoteRunPaths(input.remoteRoot, input.runId) : null;
  const outDir = remote ? remote.output : runOutputDir(input.runId);
  const separator = remote ? "/" : path.sep;

  const lines = [input.prompt.trim()];

  if (input.inputArtifacts.length > 0) {
    const inputPaths = remote
      ? input.inputArtifacts.map((item) => `${remote.input}/${item.filename}`)
      : input.inputArtifacts.map((item) => item.absolutePath);
    lines.push("", "Fichiers d’entrée disponibles (chemins absolus) :", ...inputPaths.map((item) => `- ${item}`));
  }

  // La consigne d'écriture est indépendante des pièces jointes : sans elle, une
  // mission sans fichier d'entrée — le cas le plus fréquent — n'apprend jamais
  // où écrire, et `scanOutputArtifacts()` ne trouve rien à enregistrer.
  lines.push("", `Écris tout fichier produit dans : ${outDir}${separator}`);
  return lines.join("\n");
}
