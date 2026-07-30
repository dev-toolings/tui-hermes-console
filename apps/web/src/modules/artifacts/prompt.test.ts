import { describe, expect, test } from "bun:test";
import { augmentPromptWithArtifacts } from "@/modules/artifacts/prompt";

const RUN_ID = "run_abc123";

describe("augmentPromptWithArtifacts", () => {
  test("annonce out/ même sans pièce jointe", () => {
    // Cas nominal : sans cette consigne, l'agent n'écrit nulle part et
    // scanOutputArtifacts() ne trouve rien à enregistrer.
    const result = augmentPromptWithArtifacts({
      prompt: "Rédige un compte rendu",
      inputArtifacts: [],
      runId: RUN_ID,
    });

    expect(result).toContain("Rédige un compte rendu");
    expect(result).toContain("Écris tout fichier produit dans :");
    expect(result).not.toContain("Fichiers d’entrée disponibles");
  });

  test("liste les entrées et la sortie quand il y a des pièces jointes", () => {
    const result = augmentPromptWithArtifacts({
      prompt: "Résume ce document",
      inputArtifacts: [{ filename: "brief.pdf", absolutePath: "/work/runs/run_abc123/in/brief.pdf" }],
      runId: RUN_ID,
    });

    expect(result).toContain("Fichiers d’entrée disponibles");
    expect(result).toContain("- /work/runs/run_abc123/in/brief.pdf");
    expect(result).toContain("Écris tout fichier produit dans :");
  });

  test("utilise les chemins de la machine distante en mode tunnel", () => {
    const result = augmentPromptWithArtifacts({
      prompt: "Résume ce document",
      inputArtifacts: [{ filename: "brief.pdf", absolutePath: "/local/ignoré/brief.pdf" }],
      runId: RUN_ID,
      remoteRoot: "/srv/hermes-work",
    });

    expect(result).toContain("- /srv/hermes-work/runs/run_abc123/in/brief.pdf");
    expect(result).toContain("/srv/hermes-work/runs/run_abc123/out/");
    expect(result).not.toContain("/local/ignoré");
  });

  test("annonce la sortie distante même sans pièce jointe", () => {
    const result = augmentPromptWithArtifacts({
      prompt: "Génère un rapport",
      inputArtifacts: [],
      runId: RUN_ID,
      remoteRoot: "/srv/hermes-work",
    });

    expect(result).toContain("/srv/hermes-work/runs/run_abc123/out/");
  });
});
