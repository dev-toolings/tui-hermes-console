import { describe, expect, test } from "bun:test";
import { requiresSetupRedirect } from "./route-tree";

const site = (id: string, role: "operator" | "auditor" = "operator") => ({
  id,
  name: id === "paris" ? "Paris" : "Lyon",
  slug: id,
  role,
  organizationId: role === "operator" ? "org_msp" : `org_client_${id}`,
  clientOrganizationId: `org_client_${id}`,
});

describe("Console access routing", () => {
  test("redirects authenticated users whose individual consent is outdated", () => {
    expect(
      requiresSetupRedirect({
        authenticated: true,
        setupRequired: false,
        consentRequired: true,
        siteContext: {
          activeSite: site("paris"),
          memberships: [site("paris")],
          selectionRequired: false,
          membershipRequired: false,
          capabilities: ["run.read"],
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
          activeSite: site("paris"),
          memberships: [site("paris")],
          selectionRequired: false,
          membershipRequired: false,
          capabilities: ["run.read"],
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
            site("paris"),
            site("lyon", "auditor"),
          ],
          selectionRequired: true,
          membershipRequired: false,
          capabilities: [],
        },
      }),
    ).toBe(true);
  });
});
