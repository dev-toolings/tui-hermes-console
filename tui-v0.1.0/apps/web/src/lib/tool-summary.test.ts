import { describe, expect, test } from "bun:test";
import { prettyToolArgs, prettyToolOutput, summarizeToolResult } from "./tool-summary";

describe("summarizeToolResult", () => {
  test("ignore les drapeaux booléens et garde le champ porteur", () => {
    expect(
      summarizeToolResult("browser_navigate", '{"success": true, "title": "Météo Paris"}'),
    ).toBe("title: Météo Paris");
  });

  test("ne répète pas la cible déjà affichée sur la ligne", () => {
    const output = '{"success": true, "url": "https://wttr.in/Paris", "status": 200}';
    expect(summarizeToolResult("browser_navigate", output, "https://wttr.in/Paris")).toBe(
      "status: 200",
    );
  });

  test("une sortie qui ne dit que « ça a marché » ne produit aucun résumé", () => {
    expect(summarizeToolResult("browser_navigate", '{"success": true}')).toBe("");
  });

  test("compte les lignes d'un fichier lu", () => {
    expect(summarizeToolResult("read_file", "a\nb\nc\n")).toBe("3 lignes");
  });

  test("compte les résultats d'une recherche", () => {
    expect(summarizeToolResult("grep", "src/a.ts:1\nsrc/b.ts:4")).toBe("2 résultats");
  });

  test("retire l'enveloppe untrusted avant de résumer", () => {
    const output = [
      "<untrusted_tool_result>",
      "The following content was retrieved from an external source.",
      "Ligne utile",
      "</untrusted_tool_result>",
    ].join("\n");
    expect(summarizeToolResult("execute_code", output)).toBe("Ligne utile");
  });

  test("première ligne plus décompte pour une sortie multi-lignes", () => {
    expect(summarizeToolResult("execute_code", "hello\nworld")).toBe("hello · 2 lignes");
  });

  test("sortie vide", () => {
    expect(summarizeToolResult("execute_code", "   ")).toBe("Sortie vide");
    expect(summarizeToolResult("execute_code", null)).toBe("");
  });

  test("tronque à 120 caractères", () => {
    const summary = summarizeToolResult("execute_code", "x".repeat(400));
    expect(summary).toHaveLength(120);
    expect(summary.endsWith("…")).toBe(true);
  });

  test("le titre passe devant un champ accessoire quel que soit l'ordre des clés", () => {
    const output = JSON.stringify({
      stealth_warning: "Running WITHOUT residential proxy",
      title: "wttr.in — Weather Report",
    });
    expect(summarizeToolResult("browser_navigate", output)).toBe(
      "title: wttr.in — Weather Report · stealth_warning: Running WITHOUT residential proxy",
    );
  });

  test("un bloc multi-ligne est une charge utile, pas un résumé", () => {
    const output = JSON.stringify({
      snapshot: "- Static text\n- Static text\n- Button",
      element_count: 3,
    });
    expect(summarizeToolResult("browser_navigate", output)).toBe("element_count: 3");
  });

  test("un saut de ligne échappé est traité comme un bloc, pas comme du texte", () => {
    const output = JSON.stringify({
      snapshot: '- StaticText "Paris: +33°C\\n "',
      element_count: 3,
    });
    expect(summarizeToolResult("browser_navigate", output)).toBe("element_count: 3");
  });

  test("résume une liste par son cardinal", () => {
    expect(summarizeToolResult("glob", [1, 2, 3])).toBe("3 éléments");
    expect(summarizeToolResult("glob", '{"matches": ["a", "b"]}')).toBe("matches: 2 éléments");
  });
});

describe("prettyToolOutput", () => {
  test("reformate le JSON sérialisé au lieu de le laisser sur une ligne", () => {
    expect(prettyToolOutput('{"success":true,"url":"https://wttr.in"}')).toEqual({
      text: '{\n  "success": true,\n  "url": "https://wttr.in"\n}',
      external: false,
    });
  });

  test("remonte l'enveloppe untrusted en drapeau et la retire du corps", () => {
    const output = [
      "<untrusted_tool_result source=\"browser_navigate\">",
      "The following content was retrieved from an external source.",
      '{"element_count": 0}',
      "</untrusted_tool_result>",
    ].join("\n");
    expect(prettyToolOutput(output)).toEqual({
      text: '{\n  "element_count": 0\n}',
      external: true,
    });
  });

  test("laisse le texte non-JSON intact et borne la longueur", () => {
    expect(prettyToolOutput("juste du texte")).toEqual({
      text: "juste du texte",
      external: false,
    });
    expect(prettyToolOutput("y".repeat(20_000)).text).toHaveLength(12_002);
  });

  test("sortie absente", () => {
    expect(prettyToolOutput(null)).toEqual({ text: "Sortie vide", external: false });
  });
});

describe("prettyToolArgs", () => {
  test("formate les arguments et ignore l'absence d'arguments", () => {
    expect(prettyToolArgs({ path: "a.ts" })).toBe('{\n  "path": "a.ts"\n}');
    expect(prettyToolArgs(null)).toBe("");
    expect(prettyToolArgs({})).toBe("");
  });
});
