import { describe, expect, test } from "bun:test";
import { extractDashboardSessionToken } from "./hermes-skills-admin";

describe("Hermes Dashboard admin session", () => {
  test("extracts the ephemeral token injected into the Dashboard HTML", () => {
    expect(
      extractDashboardSessionToken(
        '<script>window.__HERMES_SESSION_TOKEN__="session-token";</script>',
      ),
    ).toBe("session-token");
  });

  test("does not invent a token when the Dashboard uses gated auth", () => {
    expect(extractDashboardSessionToken("<html>login</html>")).toBeNull();
  });
});
