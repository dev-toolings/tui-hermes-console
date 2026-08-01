import { describe, expect, test } from "bun:test";
import {
  aiDisclosureConsentPayload,
  needsAiDisclosureConsent,
} from "./setup";

describe("setup AI disclosure", () => {
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
});
