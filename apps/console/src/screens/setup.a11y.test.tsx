import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AiDisclosurePanel,
  aiDisclosureConsentPayload,
  needsAiDisclosureConsent,
} from "./setup";

describe("setup AI disclosure accessibility", () => {
  test("keeps a completed operator in setup until the current notice is accepted", () => {
    expect(
      needsAiDisclosureConsent({
        step: "completed",
        disclosure: {
          version: "2026-08-01.v2",
          title: "Notice",
          summary: "Résumé",
          items: [],
        },
        consent: { current: false, version: null, acceptedAt: null },
      }),
    ).toBe(true);
  });

  test("submits the exact disclosure version displayed to the operator", () => {
    expect(aiDisclosureConsentPayload("2026-08-01.v2")).toEqual({
      consentVersion: "2026-08-01.v2",
    });
  });

  test("exposes the notice as an accessible region tied to its consent control", () => {
    const html = renderToStaticMarkup(
      <AiDisclosurePanel
        disclosure={{
          version: "2026-08-01.v2",
          title: "Notice IA",
          summary: "Résumé de la notice.",
          items: ["Premier point", "Second point"],
        }}
        accepted={false}
        checked={false}
        onCheckedChange={() => undefined}
        focusHeading
      />,
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby="ai-disclosure-title"');
    expect(html).toContain('<h2 id="ai-disclosure-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('>Notice IA</h2>');
    expect(html).toContain('id="ai-disclosure-summary"');
    expect(html).toContain('id="ai-disclosure-items"');
    expect(html).toContain('id="ai-disclosure-consent"');
    expect(html).toContain('aria-describedby="ai-disclosure-summary ai-disclosure-items"');
  });
});
