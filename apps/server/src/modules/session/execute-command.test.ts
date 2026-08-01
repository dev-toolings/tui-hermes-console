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

import { executeSessionCommand } from "./execute-command";

describe("executeSessionCommand agent isolation", () => {
  test("rejects /agent show on chat threads", async () => {
    const result = await executeSessionCommand({
      context: {
        siteId: "paris",
        userId: "usr",
        role: "operator",
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
