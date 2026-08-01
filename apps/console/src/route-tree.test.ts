import { describe, expect, test } from "bun:test";
import { requiresSetupRedirect } from "./route-tree";

describe("Console access routing", () => {
  test("redirects authenticated users whose individual consent is outdated", () => {
    expect(
      requiresSetupRedirect({
        authenticated: true,
        setupRequired: false,
        consentRequired: true,
        siteContext: {
          activeSite: { id: "paris", name: "Paris", slug: "paris", role: "operator" },
          memberships: [{ id: "paris", name: "Paris", slug: "paris", role: "operator" }],
          selectionRequired: false,
          membershipRequired: false,
        },
      }),
    ).toBe(true);
  });

  test("opens the Console only after setup and current consent", () => {
    expect(
      requiresSetupRedirect({
        authenticated: true,
        setupRequired: false,
        consentRequired: false,
        siteContext: {
          activeSite: { id: "paris", name: "Paris", slug: "paris", role: "operator" },
          memberships: [{ id: "paris", name: "Paris", slug: "paris", role: "operator" }],
          selectionRequired: false,
          membershipRequired: false,
        },
      }),
    ).toBe(false);
  });

  test("keeps a multi-site user outside the Console until a site is selected", () => {
    expect(
      requiresSetupRedirect({
        authenticated: true,
        setupRequired: false,
        consentRequired: false,
        siteContext: {
          activeSite: null,
          memberships: [
            { id: "paris", name: "Paris", slug: "paris", role: "operator" },
            { id: "lyon", name: "Lyon", slug: "lyon", role: "auditor" },
          ],
          selectionRequired: true,
          membershipRequired: false,
        },
      }),
    ).toBe(true);
  });
});
