import { describe, expect, test } from "bun:test";
import { renderHermesEmail } from "./hermes-email-template";

describe("Hermes email template", () => {
  test("renders a compatible HTML and text version", () => {
    const result = renderHermesEmail({
      preheader: "Code disponible",
      eyebrow: "Sécurité",
      title: "Confirmez votre demande",
      paragraphs: ["Une demande est en attente."],
      code: { label: "Code", value: "123456" },
      note: "Valable cinq minutes.",
    });

    expect(result.html).toContain("Hermes Console");
    expect(result.html).toContain("123456");
    expect(result.html).toContain('role="presentation"');
    expect(result.text).toContain("Code: 123456");
  });

  test("escapes dynamic content in HTML", () => {
    const result = renderHermesEmail({
      preheader: "<script>",
      eyebrow: "A & B",
      title: "<Demande>",
      paragraphs: ["Texte avec <balise> & guillemets"],
    });

    expect(result.html).toContain("&lt;Demande&gt;");
    expect(result.html).toContain("Texte avec &lt;balise&gt; &amp; guillemets");
    expect(result.html).not.toContain("<script>");
  });
});
