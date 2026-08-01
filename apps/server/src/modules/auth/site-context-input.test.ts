import { describe, expect, test } from "bun:test";
import { POST as createAgent } from "@/api/agents/route";
import { PUT as saveConnector } from "@/api/connectors/[type]/route";
import { POST as createThread } from "@/api/threads/route";
import { POST as createMessage } from "@/api/threads/[threadId]/messages/route";
import { POST as executeCommand } from "@/api/threads/[threadId]/commands/route";
import { POST as approveRun } from "@/api/runs/[runId]/approval/route";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import type { withCurrentAiDisclosureConsent } from "@/modules/setup/ai-disclosure";

const siteContext = {
  siteId: "paris",
  userId: "usr",
  role: "operator" as const,
  actorOrganizationId: "org_msp",
  clientOrganizationId: "org_client_paris",
  mandateId: "mandate_paris",
  mandateProjectId: null,
  correlationId: "req",
};

function context<T extends Record<string, string>>(params: T): AuthenticatedRouteContext<T> {
  return { params: Promise.resolve(params), siteContext };
}

function request(path: string, body: object) {
  return new Request(`http://console.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const allowConsent = (async (_request: Request, operation: () => Promise<Response>) =>
  operation()) as typeof withCurrentAiDisclosureConsent;

async function expectInvalidInput(response: Response) {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "INVALID_INPUT" },
  });
}

describe("site context cannot be forged in mutation payloads", () => {
  test("agents and connectors reject client-owned site fields", async () => {
    await expectInvalidInput(await createAgent(request("/api/agents", {
      name: "Agent",
      instructions: "Instructions",
      siteId: "lyon",
    }), context({})));
    await expectInvalidInput(await saveConnector(request("/api/connectors/gmail_imap", {
      email: "operator@example.com",
      password: "secret",
      projectId: "prj_lyon",
    }), context({ type: "gmail_imap" })));
  });

  test("thread, message, command and approval mutations reject forged scope", async () => {
    await expectInvalidInput(await createThread(request("/api/threads", {
      message: "Hello",
      siteId: "lyon",
    }), context({}), { withConsent: allowConsent }));
    await expectInvalidInput(await createMessage(request("/api/threads/thr/messages", {
      message: "Hello",
      projectId: "prj_lyon",
    }), context({ threadId: "thr" }), { withConsent: allowConsent }));
    await expectInvalidInput(await executeCommand(request("/api/threads/thr/commands", {
      message: "/help",
      siteId: "lyon",
    }), context({ threadId: "thr" })));
    await expectInvalidInput(await approveRun(request("/api/runs/run/approval", {
      choice: "once",
      siteId: "lyon",
    }), context({ runId: "run" })));
  });
});
