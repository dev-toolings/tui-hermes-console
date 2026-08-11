import { describe, expect, it } from "bun:test";
import { filePreviewKind } from "./file-preview-dialog";

describe("filePreviewKind", () => {
  it("détecte les formats prévisualisables par type MIME", () => {
    expect(filePreviewKind("fichier", "application/pdf")).toBe("pdf");
    expect(filePreviewKind("fichier", "image/png")).toBe("image");
    expect(
      filePreviewKind(
        "fichier",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("word");
    expect(
      filePreviewKind(
        "fichier",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("excel");
  });

  it("utilise l’extension lorsque le type MIME est générique", () => {
    expect(filePreviewKind("rapport.PDF", "application/octet-stream")).toBe("pdf");
    expect(filePreviewKind("photo.webp")).toBe("image");
    expect(filePreviewKind("contrat.docx")).toBe("word");
    expect(filePreviewKind("budget.xlsx")).toBe("excel");
    expect(filePreviewKind("archive.zip")).toBe("unsupported");
  });
});
