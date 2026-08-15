import { describe, expect, test } from "bun:test";
import { POST, authStatusPayload } from "./route";
import { CURRENT_AI_DISCLOSURE } from "@/modules/setup/ai-disclosure";
import type { AuthSession } from "@/modules/auth/service";

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    tokenHash: "hash",
    userId: "google:user",
    csrfToken: "csrf",
    expiresAt: new Date(Date.now() + 60_000),
    email: "operator@example.com",
    name: "Operator",
    siteId: "paris",
    role: "operator",
    memberships: [
      {
        id: "paris",
        name: "Paris",
        slug: "paris",
        role: "operator",
        organizationId: "org_msp",
        clientOrganizationId: "org_client_paris",
      },
    ],
    aiDisclosureVersion: CURRENT_AI_DISCLOSURE.version,
    aiDisclosureAcceptedAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

describe("GET /api/auth status", () => {
  test("exposes installation setup and current individual consent separately", () => {
    expect(authStatusPayload(session(), false)).toMatchObject({
      authenticated: true,
      developmentLoginAvailable: false,
      googleLoginRequiresLoopback: false,
      setupRequired: false,
      consentRequired: false,
      user: {
        aiDisclosure: {
          currentVersion: CURRENT_AI_DISCLOSURE.version,
          acceptedVersion: CURRENT_AI_DISCLOSURE.version,
          acceptedAt: "2026-08-01T10:00:00.000Z",
          consentRequired: false,
        },
      },
      siteContext: {
        activeSite: {
          id: "paris",
          name: "Paris",
          slug: "paris",
          role: "operator",
        },
        memberships: [
          {
            id: "paris",
            name: "Paris",
            slug: "paris",
            role: "operator",
          },
        ],
        membershipRequired: false,
        selectionRequired: false,
      },
    });
  });

  test("requires setup navigation for a user missing current consent", () => {
    expect(
      authStatusPayload(
        session({
          aiDisclosureVersion: "2026-08-01.v1",
          aiDisclosureAcceptedAt: new Date(),
        }),
        false,
      ),
    ).toMatchObject({
      authenticated: true,
      setupRequired: false,
      consentRequired: true,
    });
  });

  test("exposes mandate candidates without granting capabilities before selection", () => {
    const candidates = [{
      id: "mandate_project_a",
      operatorOrganizationId: "org_msp",
      projectId: "project_a",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      expiresAt: null,
    }];
    expect(authStatusPayload(session(), false, null, candidates, true)).toMatchObject({
      siteContext: {
        authorization: null,
        mandateSelectionRequired: true,
        capabilities: [],
        mandates: [{
          id: "mandate_project_a",
          projectId: "project_a",
          startsAt: "2026-08-01T00:00:00.000Z",
          expiresAt: null,
        }],
      },
    });
  });
});

describe("POST /api/auth?action=dev-login", () => {
  test("rejects a cross-site login before creating a development session", async () => {
    const response = await POST(
      new Request("http://127.0.0.1:3170/api/auth?action=dev-login", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CROSS_SITE_MUTATION_REJECTED" },
    });
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
