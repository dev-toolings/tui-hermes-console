import { afterEach, describe, expect, it, mock } from "bun:test";

let availableSelection = {
  provider: "openai-api",
  model: "gpt-5.6-luna",
  reasoningEffort: null,
  persisted: {
    provider: "openai-api",
    model: "gpt-5.6-luna",
    reasoningEffort: null,
  },
  catalog: {
    currentProvider: "openai-api",
    runtimeDefaultModel: "gpt-5.6-luna",
    providers: [
      {
        slug: "openai-api",
        name: "OpenAI API",
        isCurrent: true,
        authenticated: true,
        acceptsApiKey: true,
        authType: "api_key",
        warning: null,
        source: null,
        models: [{ id: "gpt-5.6-luna", fast: true, reasoning: false }],
      },
    ],
  },
};

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

mock.module("@/modules/runtime/model-settings", () => ({
  getRuntimeModelSelection: mock(async () => ({
    provider: "openai-api",
    model: "gpt-5.6-luna",
    reasoningEffort: null,
  })),
}));

mock.module("./available-model-selection", () => ({
  resolveAvailableRuntimeModelSelection: mock(async () => availableSelection),
}));

import {
  resolveEffectiveInference,
  resolveEffectiveModel,
} from "./resolve-effective-model";

describe("resolveEffectiveModel", () => {
  afterEach(() => {
    availableSelection = {
      ...availableSelection,
      provider: "openai-api",
      model: "gpt-5.6-luna",
      catalog: {
        ...availableSelection.catalog,
        providers: [
          {
            ...availableSelection.catalog.providers[0]!,
            slug: "openai-api",
            authenticated: true,
            models: [{ id: "gpt-5.6-luna", fast: true, reasoning: false }],
          },
        ],
      },
    };
  });

  it("remplace l’alias historique hermes-agent par le modèle Console", async () => {
    await expect(
      resolveEffectiveModel({ siteId: "paris" }, { threadModel: "hermes-agent", agentId: null }),
    ).resolves.toBe("gpt-5.6-luna");
  });

  it("préfère le modèle concret de l’agent lié", async () => {
    await expect(
      resolveEffectiveModel({ siteId: "paris" }, {
        threadModel: "hermes-agent",
        agentId: "agent_custom",
      }),
    ).resolves.toBe("gpt-5.6-luna");
  });

  it("conserve un modèle figé sur le thread s’il est explicite", async () => {
    await expect(
      resolveEffectiveModel({ siteId: "paris" }, {
        threadModel: "gpt-4.1-mini",
        agentId: null,
      }),
    ).resolves.toBe("gpt-4.1-mini");
  });

  it("bascule un thread vers le provider authentifié quand son ancien provider est indisponible", async () => {
    availableSelection = {
      ...availableSelection,
      provider: "openai-codex",
      model: "gpt-5.4",
      catalog: {
        ...availableSelection.catalog,
        providers: [
          {
            ...availableSelection.catalog.providers[0]!,
            slug: "openai-api",
            authenticated: false,
          },
          {
            ...availableSelection.catalog.providers[0]!,
            slug: "openai-codex",
            name: "OpenAI Codex",
            authenticated: true,
            authType: "oauth",
            models: [{ id: "gpt-5.4", fast: false, reasoning: true }],
          },
        ],
      },
    };

    await expect(
      resolveEffectiveInference(
        { siteId: "paris" },
        {
          threadProvider: "openai-api",
          threadModel: "gpt-5.4-nano",
          agentId: null,
        },
      ),
    ).resolves.toMatchObject({ provider: "openai-codex", model: "gpt-5.4" });
  });
});
