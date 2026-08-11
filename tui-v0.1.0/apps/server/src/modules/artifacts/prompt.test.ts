import { describe, expect, test } from "bun:test";
import {
  augmentInstructionsWithArtifacts,
  augmentPromptWithArtifacts,
} from "@/modules/artifacts/prompt";

const RUN_ID = "run_abc123";
const INSTRUCTIONS = "Tu es Hermes, un agent d’exécution.";

describe("augmentPromptWithArtifacts", () => {
  test("laisse le prompt intact quand il n'y a aucune pièce jointe", () => {
    // Régression : la consigne d'écriture vivait ici et un petit modèle la
    // traitait comme une tâche (search_files + listing de out/), au point de
    // conclure « le répertoire est vide » sur une question de météo.
    const result = augmentPromptWithArtifacts({
      prompt: "Rédige un compte rendu",
      inputArtifacts: [],
      runId: RUN_ID,
    });

    expect(result).toBe("Rédige un compte rendu");
    expect(result).not.toContain("out/");
  });

  test("liste les entrées quand il y a des pièces jointes", () => {
    const result = augmentPromptWithArtifacts({
      prompt: "Résume ce document",
      inputArtifacts: [{ filename: "brief.pdf", absolutePath: "/work/runs/run_abc123/in/brief.pdf" }],
      runId: RUN_ID,
    });

    expect(result).toContain("Fichiers d’entrée disponibles");
    expect(result).toContain("- /work/runs/run_abc123/in/brief.pdf");
  });

  test("utilise les chemins de la machine distante en mode tunnel", () => {
    const result = augmentPromptWithArtifacts({
      prompt: "Résume ce document",
      inputArtifacts: [{ filename: "brief.pdf", absolutePath: "/local/ignoré/brief.pdf" }],
      runId: RUN_ID,
      remoteRoot: "/srv/hermes-work",
    });

    expect(result).toContain("- /srv/hermes-work/runs/run_abc123/in/brief.pdf");
    expect(result).not.toContain("/local/ignoré");
  });
});

describe("augmentInstructionsWithArtifacts", () => {
  test("annonce out/ dans les instructions, pas dans le prompt", () => {
    // Sans cette consigne, l'agent n'apprend jamais où écrire et
    // scanOutputArtifacts() ne trouve rien à enregistrer.
    const result = augmentInstructionsWithArtifacts({
      instructions: INSTRUCTIONS,
      runId: RUN_ID,
    });

    expect(result).toContain(INSTRUCTIONS);
    expect(result).toContain("run_abc123");
    expect(result).toContain("out");
  });

  test("cible la racine distante en mode tunnel", () => {
    const result = augmentInstructionsWithArtifacts({
      instructions: INSTRUCTIONS,
      runId: RUN_ID,
      remoteRoot: "/srv/hermes-work",
    });

    expect(result).toContain("/srv/hermes-work/runs/run_abc123/out/");
  });

  test("conditionne l'écriture à une demande qui produit un fichier", () => {
    // La formulation impérative d'origine (« Écris tout fichier produit
    // dans : … ») se lisait comme un ordre inconditionnel.
    const result = augmentInstructionsWithArtifacts({
      instructions: INSTRUCTIONS,
      runId: RUN_ID,
    });

    expect(result).toContain("Si la demande implique de produire un fichier");
  });
});
