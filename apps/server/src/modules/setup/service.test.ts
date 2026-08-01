import { describe, expect, test } from "bun:test";
import { validateSetupTransition } from "./service";

describe("setup transition policy", () => {
  test("accepts only the next step and keeps repeats idempotent", () => {
    expect(
      validateSetupTransition({
        current: "runtime",
        target: "runtime",
        runtimeConfigured: false,
        hasCurrentAiConsent: false,
      }),
    ).toEqual({ changed: false, requiresProbe: false });
    expect(
      validateSetupTransition({
        current: "runtime",
        target: "agent",
        runtimeConfigured: true,
        hasCurrentAiConsent: false,
      }),
    ).toEqual({ changed: true, requiresProbe: false });
  });

  test("rejects backward transitions and skipped steps", () => {
    expect(() =>
      validateSetupTransition({
        current: "agent",
        target: "runtime",
        runtimeConfigured: true,
        hasCurrentAiConsent: true,
      }),
    ).toThrow("étape précédente");
    expect(() =>
      validateSetupTransition({
        current: "runtime",
        target: "completed",
        runtimeConfigured: true,
        hasCurrentAiConsent: true,
      }),
    ).toThrow("étape courante");
  });

  test("requires a configured runtime, current consent and a real completion probe", () => {
    expect(() =>
      validateSetupTransition({
        current: "runtime",
        target: "agent",
        runtimeConfigured: false,
        hasCurrentAiConsent: false,
      }),
    ).toThrow("Connectez Hermes");
    expect(() =>
      validateSetupTransition({
        current: "agent",
        target: "completed",
        runtimeConfigured: true,
        hasCurrentAiConsent: false,
      }),
    ).toThrow("notice");
    expect(
      validateSetupTransition({
        current: "agent",
        target: "completed",
        runtimeConfigured: true,
        hasCurrentAiConsent: true,
      }),
    ).toEqual({ changed: true, requiresProbe: true });
  });
});
