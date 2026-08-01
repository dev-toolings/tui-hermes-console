import { describe, expect, mock, test } from "bun:test";
import {
  CURRENT_AI_DISCLOSURE,
  hasCurrentAiDisclosureConsent,
  isAiRunStartRequest,
  runStartPreconditionResponse,
  withCurrentAiDisclosureConsent,
} from "./ai-disclosure";
import type { AuthSession } from "@/modules/auth/service";

function session(
  overrides: Partial<AuthSession> = {},
): AuthSession {
  return {
    tokenHash: "token",
    userId: "google:user",
    csrfToken: "csrf",
    expiresAt: new Date(Date.now() + 60_000),
    email: "operator@example.com",
    name: "Operator",
    siteId: "legacy-default",
    role: "admin",
    memberships: [
      {
        id: "legacy-default",
        name: "Legacy site",
        slug: "legacy-default",
        role: "admin",
        organizationId: "org_client_legacy-default",
        clientOrganizationId: "org_client_legacy-default",
      },
    ],
    aiDisclosureVersion: CURRENT_AI_DISCLOSURE.version,
    aiDisclosureAcceptedAt: new Date(),
    ...overrides,
  };
}

describe("AI disclosure consent", () => {
  test("states AI, external models, commands/actions and human control before acceptance", () => {
    const disclosure = [
      CURRENT_AI_DISCLOSURE.title,
      CURRENT_AI_DISCLOSURE.summary,
      ...CURRENT_AI_DISCLOSURE.items,
    ].join(" ");
    expect(disclosure).toMatch(/intelligence artificielle|\bIA\b/i);
    expect(disclosure).toMatch(/fournisseurs externes.*modèles d’IA/i);
    expect(disclosure).toMatch(/commandes et des actions/i);
    expect(disclosure).toMatch(/contrôle humain/i);
  });

  test("is current only when version and timestamp are both present", () => {
    expect(hasCurrentAiDisclosureConsent(session())).toBe(true);
    expect(
      hasCurrentAiDisclosureConsent(
        session({ aiDisclosureVersion: "older-version" }),
      ),
    ).toBe(false);
    expect(
      hasCurrentAiDisclosureConsent(
        session({ aiDisclosureAcceptedAt: null }),
      ),
    ).toBe(false);
  });

  test("returns 428 with the current disclosure without executing the operation", async () => {
    const operation = mock(async () => Response.json({ started: true }));
    const response = await withCurrentAiDisclosureConsent(
      new Request("http://console.test/api/threads", { method: "POST" }),
      operation,
      async () => session({ aiDisclosureVersion: null, aiDisclosureAcceptedAt: null }),
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(428);
    expect(operation).not.toHaveBeenCalled();
    const body = (await (response as Response).json()) as {
      error: { code: string; disclosure: { version: string }; setupPath: string };
    };
    expect(body.error).toMatchObject({
      code: "AI_DISCLOSURE_CONSENT_REQUIRED",
      disclosure: { version: CURRENT_AI_DISCLOSURE.version },
      setupPath: "/setup",
    });
  });

  test("executes the operation after current consent", async () => {
    const operation = mock(async () => "started");
    await expect(
      withCurrentAiDisclosureConsent(
        new Request("http://console.test/api/runs/run_1/retry", { method: "POST" }),
        operation,
        async () => session(),
      ),
    ).resolves.toBe("started");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test("reports the mounted 423 setup boundary before the 428 consent boundary", async () => {
    const missingConsent = session({
      aiDisclosureVersion: null,
      aiDisclosureAcceptedAt: null,
    });
    const setupResponse = runStartPreconditionResponse(true, missingConsent);
    expect(setupResponse?.status).toBe(423);
    expect(await setupResponse?.json()).toMatchObject({
      error: { code: "SETUP_REQUIRED" },
    });

    const consentResponse = runStartPreconditionResponse(false, missingConsent);
    expect(consentResponse?.status).toBe(428);
    expect(await consentResponse?.json()).toMatchObject({
      error: { code: "AI_DISCLOSURE_CONSENT_REQUIRED" },
    });
  });

  test("recognizes exactly the three run-start POST routes", () => {
    expect(isAiRunStartRequest("POST", "/api/threads")).toBe(true);
    expect(
      isAiRunStartRequest("POST", "/api/threads/thr_1/messages"),
    ).toBe(true);
    expect(isAiRunStartRequest("POST", "/api/runs/run_1/retry")).toBe(true);
    expect(isAiRunStartRequest("GET", "/api/threads")).toBe(false);
    expect(isAiRunStartRequest("POST", "/api/runs/run_1/cancel")).toBe(false);
  });
});
