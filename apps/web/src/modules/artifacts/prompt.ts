import path from "node:path";
import { runOutputDir } from "./paths";

/** Injecte les chemins d’entrée + consigne d’écriture out/ dans le prompt Hermes. */
export function augmentPromptWithArtifacts(input: {
  prompt: string;
  inputArtifacts: Array<{ filename: string; absolutePath: string }>;
  runId: string;
}): string {
  if (input.inputArtifacts.length === 0) return input.prompt;

  const outDir = runOutputDir(input.runId);
  const lines = [
    input.prompt.trim(),
    "",
    "Fichiers d’entrée disponibles (chemins absolus) :",
    ...input.inputArtifacts.map((item) => `- ${item.absolutePath}`),
    "",
    `Écris tout fichier produit dans : ${outDir}${path.sep}`,
  ];
  return lines.join("\n");
}
