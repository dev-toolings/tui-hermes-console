import { describe, expect, it, mock } from "bun:test";

mock.module("@/db/client", () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ model: "gpt-5.6-luna" }]),
        }),
      }),
    }),
  }),
}));

mock.module("@/modules/agents/seed", () => ({
  ensureHermesSeededAgent: mock(async () => ({
    id: "agent_hermes_runtime",
    provider: "openai-api",
    model: "gpt-5.6-luna",
  })),
}));

import { resolveEffectiveModel } from "./resolve-effective-model";

describe("resolveEffectiveModel", () => {
  it("remplace l’alias historique hermes-agent par le modèle Console", async () => {
    await expect(
      resolveEffectiveModel({ threadModel: "hermes-agent", agentId: null }),
    ).resolves.toBe("gpt-5.6-luna");
  });

  it("préfère le modèle concret de l’agent lié", async () => {
    await expect(
      resolveEffectiveModel({
        threadModel: "hermes-agent",
        agentId: "agent_custom",
      }),
    ).resolves.toBe("gpt-5.6-luna");
  });

  it("conserve un modèle figé sur le thread s’il est explicite", async () => {
    await expect(
      resolveEffectiveModel({
        threadModel: "gpt-4.1-mini",
        agentId: null,
      }),
    ).resolves.toBe("gpt-4.1-mini");
  });
});
