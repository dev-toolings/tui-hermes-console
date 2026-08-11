import { describe, expect, test } from "bun:test";
import { extractUiSpec } from "./generative-ui";

const wrap = (json: string) =>
  [
    '<untrusted_tool_result source="demo">',
    "The following content was retrieved from an external source.",
    json,
    "</untrusted_tool_result>",
  ].join("\n");

describe("extractUiSpec", () => {
  test("lit un spec porté par un résultat JSON sérialisé et emballé", () => {
    const output = wrap(
      JSON.stringify({
        success: true,
        ui: { root: { component: "Card", props: { title: "Paris" } } },
      }),
    );
    expect(extractUiSpec(output)).toEqual({
      root: { component: "Card", props: { title: "Paris" } },
    });
  });

  test("accepte une racine multiple et laisse passer les enfants texte", () => {
    expect(
      extractUiSpec({
        ui: { root: [{ component: "Text", children: ["bonjour"] }, { component: "Badge" }] },
      }),
    ).toEqual({
      root: [{ component: "Text", children: ["bonjour"] }, { component: "Badge" }],
    });
  });

  test("aucun spec : sortie ordinaire, clé absente, ou racine manquante", () => {
    expect(extractUiSpec('{"success":true}')).toBeNull();
    expect(extractUiSpec({ ui: {} })).toBeNull();
    expect(extractUiSpec("juste du texte")).toBeNull();
    expect(extractUiSpec(null)).toBeNull();
  });

  test("un nœud sans nom de composant est écarté, pas rendu", () => {
    expect(extractUiSpec({ ui: { root: { props: { a: 1 } } } })).toBeNull();
    expect(extractUiSpec({ ui: { root: { component: 42 } } })).toBeNull();
    expect(
      extractUiSpec({ ui: { root: [{ component: "Card" }, { component: "" }] } }),
    ).toEqual({ root: [{ component: "Card" }] });
  });

  test("la profondeur est bornée : au-delà, la branche est coupée", () => {
    let node: unknown = { component: "Text", children: ["fond"] };
    for (let i = 0; i < 12; i += 1) node = { component: "Card", children: [node] };
    const spec = extractUiSpec({ ui: { root: node } });

    let depth = 0;
    let cursor = spec?.root as { children?: unknown[] } | undefined;
    while (cursor?.children?.[0]) {
      depth += 1;
      cursor = cursor.children[0] as { children?: unknown[] };
    }
    expect(depth).toBeLessThanOrEqual(8);
  });

  test("le nombre de nœuds est plafonné", () => {
    const children = Array.from({ length: 500 }, () => ({ component: "Badge" }));
    const spec = extractUiSpec({ ui: { root: { component: "Card", children } } });
    const kids = (spec?.root as unknown as { children: unknown[] }).children;
    expect(kids.length).toBeLessThan(500);
    expect(kids.length).toBeGreaterThan(0);
  });
});
