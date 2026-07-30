import path from "node:path";
import { runOutputDir } from "./paths";
import { remoteRunPaths } from "./remote-sync";

/** `remoteRoot` renseigné = runtime distant : les chemins doivent être ceux
 *  qu'Hermes voit sur sa propre machine, pas ceux de la Console. */
type ArtifactTarget = {
  runId: string;
  remoteRoot?: string | null;
};

function outputDir({ runId, remoteRoot }: ArtifactTarget) {
  const remote = remoteRoot ? remoteRunPaths(remoteRoot, runId) : null;
  const dir = remote ? remote.output : runOutputDir(runId);
  return `${dir}${remote ? "/" : path.sep}`;
}

/**
 * Injecte les chemins des pièces jointes dans le prompt utilisateur.
 *
 * Ne contient QUE des données propres à la mission. La consigne d'écriture,
 * elle, est une règle permanente : elle appartient aux `instructions`
 * (cf. `augmentInstructionsWithArtifacts`).
 */
export function augmentPromptWithArtifacts(input: {
  prompt: string;
  inputArtifacts: Array<{ filename: string; absolutePath: string }>;
  runId: string;
  remoteRoot?: string | null;
}): string {
  if (input.inputArtifacts.length === 0) return input.prompt.trim();

  const remote = input.remoteRoot ? remoteRunPaths(input.remoteRoot, input.runId) : null;
  const inputPaths = remote
    ? input.inputArtifacts.map((item) => `${remote.input}/${item.filename}`)
    : input.inputArtifacts.map((item) => item.absolutePath);

  return [
    input.prompt.trim(),
    "",
    "Fichiers d’entrée disponibles (chemins absolus) :",
    ...inputPaths.map((item) => `- ${item}`),
  ].join("\n");
}

/**
 * Ajoute la consigne d'écriture aux instructions système.
 *
 * Elle vivait dans le prompt utilisateur, où un petit modèle la traitait comme
 * une TÂCHE : sur une simple question de météo, `gpt-5.4-nano` a lancé un
 * `search_files *` puis un script Python pour lister `out/`, et a terminé sa
 * réponse par « le répertoire est vide » (spike §11.1). Une règle permanente
 * n'a rien à faire dans le message de l'utilisateur.
 *
 * Reste indispensable : sans elle, l'agent n'apprend jamais où écrire et
 * `scanOutputArtifacts()` ne trouve rien à enregistrer.
 */
export function augmentInstructionsWithArtifacts(input: {
  instructions: string;
  runId: string;
  remoteRoot?: string | null;
}): string {
  return [
    input.instructions.trim(),
    "",
    `Si la demande implique de produire un fichier, écris-le dans : ${outputDir(input)}`,
  ].join("\n");
}
