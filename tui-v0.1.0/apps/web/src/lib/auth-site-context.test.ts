import { describe, expect, test } from "bun:test";
import { selectMandatePayload, selectSitePayload, siteAccessBlock, type AuthSiteContext } from "./auth-site-context";

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
      mandateSelectionRequired: false,
      mandates: [],
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
        mandateSelectionRequired: false,
        mandates: [],
        capabilities: [],
      }),
    ).toBe("membership");
    expect(
      siteAccessBlock({
        activeSite: null,
        memberships: [paris, { ...paris, id: "lyon", slug: "lyon", name: "Lyon" }],
        selectionRequired: true,
        membershipRequired: false,
        mandateSelectionRequired: false,
        mandates: [],
        capabilities: [],
      }),
    ).toBe("selection");
  });

  test("submits only the selected membership identifier", () => {
    expect(selectSitePayload("paris")).toEqual({ siteId: "paris" });
    expect(selectMandatePayload("mandate_a")).toEqual({ mandateId: "mandate_a" });
  });

  test("blocks product access until an operator mandate is selected", () => {
    expect(siteAccessBlock({
      activeSite: paris,
      memberships: [paris],
      selectionRequired: false,
      membershipRequired: false,
      mandateSelectionRequired: true,
      mandates: [{
        id: "mandate_a",
        operatorOrganizationId: "org_msp",
        projectId: "prj_a",
        startsAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
      }],
      capabilities: [],
    })).toBe("mandate");
  });
});
