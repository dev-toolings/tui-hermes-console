import { describe, expect, test } from "bun:test";
import { selectSitePayload, siteAccessBlock, type AuthSiteContext } from "./auth-site-context";

const paris = {
  id: "paris",
  name: "Paris",
  slug: "paris",
  role: "operator" as const,
  organizationId: "org_msp",
  clientOrganizationId: "org_client_paris",
};

describe("auth site context", () => {
  test("opens product access only with a validated active site", () => {
    const context: AuthSiteContext = {
      activeSite: paris,
      memberships: [paris],
      selectionRequired: false,
      membershipRequired: false,
      capabilities: ["run.read"],
    };

    expect(siteAccessBlock(context)).toBeNull();
  });

  test("distinguishes missing membership from a required site selection", () => {
    expect(
      siteAccessBlock({
        activeSite: null,
        memberships: [],
        selectionRequired: false,
        membershipRequired: true,
        capabilities: [],
      }),
    ).toBe("membership");
    expect(
      siteAccessBlock({
        activeSite: null,
        memberships: [paris, { ...paris, id: "lyon", slug: "lyon", name: "Lyon" }],
        selectionRequired: true,
        membershipRequired: false,
        capabilities: [],
      }),
    ).toBe("selection");
  });

  test("submits only the selected membership identifier", () => {
    expect(selectSitePayload("paris")).toEqual({ siteId: "paris" });
  });
});
