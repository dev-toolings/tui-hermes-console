import { describe, expect, test } from "bun:test";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import type { withCurrentAiDisclosureConsent } from "@/modules/setup/ai-disclosure";
import { POST } from "./route";

const context: AuthenticatedRouteContext = {
  params: Promise.resolve({}),
  siteContext: {
    siteId: "site-test",
    userId: "user-test",
    role: "admin",
    actorOrganizationId: "org-test",
    clientOrganizationId: "org-test",
    mandateId: null,
    mandateProjectId: null,
    correlationId: "correlation-test",
  },
};

const withConsent: typeof withCurrentAiDisclosureConsent = async (_request, operation) =>
  operation();

describe("POST /api/threads guided delivery policy", () => {
  test.each([
    { touchesAuthentication: true, deletesData: false, allowsDependencies: false, changesDatabase: false, touchesPayments: false, touchesInfrastructure: false },
    { touchesAuthentication: false, deletesData: true, allowsDependencies: false, changesDatabase: false, touchesPayments: false, touchesInfrastructure: false },
  ])("blocks a sensitive task before runtime execution", async (guided) => {
    const response = await POST(
      new Request("http://console.test/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Demande guidée validée", guided }),
      }),
      context,
      { withConsent },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TECHNICAL_APPROVAL_REQUIRED",
        message:
          "Cette tâche touche à l’authentification, aux permissions ou aux données. Une validation technique doit être ajoutée avant son lancement.",
      },
    });
  });

  test("keeps a low-risk task on hold until a real per-run sandbox exists", async () => {
    const response = await POST(
      new Request("http://console.test/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Demande guidée validée",
          guided: {
            touchesAuthentication: false,
            deletesData: false,
            allowsDependencies: false,
            changesDatabase: false,
            touchesPayments: false,
            touchesInfrastructure: false,
          },
        }),
      }),
      context,
      { withConsent },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GUIDED_EXECUTION_NOT_ISOLATED",
        message:
          "Le plan est validé, mais la réalisation reste en attente : aucune sandbox de dépôt vérifiée n’est encore disponible pour cette tâche.",
      },
    });
  });
});
