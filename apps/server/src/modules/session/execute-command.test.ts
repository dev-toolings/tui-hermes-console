import { describe, expect, test, mock } from "bun:test";

const chatThread = {
  id: "thr_chat",
  source: "chat",
  agentId: null,
  agentName: "Chat libre",
  instructions: "i",
  model: "gpt-5.4",
  provider: "openai-api",
};

mock.module("@/db/client", () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([chatThread]),
        }),
      }),
    }),
  }),
}));

import {
  executeSessionCommand,
  siteActionForSessionCommand,
} from "./execute-command";

describe("session command authorization classification", () => {
  test.each([
    ["/help", "thread.command"],
    ["/agent show", "thread.read"],
    ["/agent create Audit bot | instructions", "agent.create"],
    ["/agent edit name=Audit bot", "agent.update"],
    ["/agent switch audit-bot", "thread.agent.switch"],
    ["/connector status", "connector.read"],
    ["/model gpt-5.6", "agent.update"],
  ] as const)("maps %s to %s", (raw, action) => {
    expect(siteActionForSessionCommand(raw)).toBe(action);
  });
});

describe("executeSessionCommand agent isolation", () => {
  test("rejects /agent show on chat threads", async () => {
    const result = await executeSessionCommand({
      context: {
        siteId: "paris",
        userId: "usr",
        role: "operator",
        actorOrganizationId: "org_msp",
        clientOrganizationId: "org_client_paris",
        mandateId: "mandate_paris",
        mandateProjectId: null,
        correlationId: "req",
      },
      threadId: "thr_chat",
      raw: "/agent show",
    });
    expect(result).toMatchObject({
      handled: true,
      systemMessage: expect.stringContaining("/runs"),
    });
  });
});
