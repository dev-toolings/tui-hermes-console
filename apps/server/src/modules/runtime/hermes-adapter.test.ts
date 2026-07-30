import { describe, expect, test } from "bun:test";
import {
  createHermesAgentRun,
  normalizeHermesModelOptions,
} from "./hermes-adapter";

describe("normalizeHermesModelOptions", () => {
  test("returns every Hermes provider, including disconnected subscription providers", () => {
    const catalog = normalizeHermesModelOptions({
      provider: "openai-api",
      model: "gpt-5.4-nano",
      providers: [
        {
          slug: "anthropic",
          name: "Anthropic",
          authenticated: true,
          models: ["claude-sonnet-5"],
        },
        {
          slug: "openai-codex",
          name: "OpenAI Codex",
          authenticated: false,
          auth_type: "oauth_external",
          warning: "Run hermes auth add openai-codex",
          models: [],
        },
        {
          slug: "openai-api",
          name: "OpenAI API",
          is_current: true,
          models: ["gpt-5.4", "gpt-5.4-nano", "gpt-5.4"],
          capabilities: {
            "gpt-5.4": { fast: true, reasoning: true },
            "gpt-5.4-nano": { fast: true, reasoning: true },
          },
        },
      ],
    });

    expect(catalog).toEqual({
      currentProvider: "openai-api",
      runtimeDefaultModel: "gpt-5.4-nano",
      providers: [
        {
          slug: "anthropic",
          name: "Anthropic",
          isCurrent: false,
          authenticated: true,
          acceptsApiKey: true,
          authType: null,
          warning: null,
          source: null,
          models: [{ id: "claude-sonnet-5", fast: false, reasoning: false }],
        },
        {
          slug: "openai-codex",
          name: "OpenAI Codex",
          isCurrent: false,
          authenticated: false,
          acceptsApiKey: false,
          authType: "oauth_external",
          warning: "Run hermes auth add openai-codex",
          source: null,
          models: [],
        },
        {
          slug: "openai-api",
          name: "OpenAI API",
          isCurrent: true,
          authenticated: true,
          acceptsApiKey: true,
          authType: null,
          warning: null,
          source: null,
          models: [
            { id: "gpt-5.4", fast: true, reasoning: true },
            { id: "gpt-5.4-nano", fast: true, reasoning: true },
          ],
        },
      ],
    });
  });

  test("keeps API-key management available after Hermes hides auth_type", () => {
    const catalog = normalizeHermesModelOptions({
      provider: "deepseek",
      model: "deepseek-chat",
      providers: [
        {
          slug: "deepseek",
          name: "DeepSeek",
          is_current: true,
          authenticated: true,
          auth_type: null,
          models: ["deepseek-chat"],
        },
        {
          slug: "openai-codex",
          name: "OpenAI Codex",
          authenticated: true,
          auth_type: null,
          models: ["gpt-5.4"],
        },
      ],
    });

    expect(catalog.providers.find((provider) => provider.slug === "deepseek")?.acceptsApiKey)
      .toBe(true);
    expect(catalog.providers.find((provider) => provider.slug === "openai-codex")?.acceptsApiKey)
      .toBe(false);
  });
});

describe("createHermesAgentRun", () => {
  test("forwards provider and model as separate Hermes run fields", async () => {
    const previousFetch = globalThis.fetch;
    let requestBody: unknown;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ run_id: "hermes_run_1" }, { status: 202 });
    }) as typeof fetch;

    try {
      await createHermesAgentRun({
        input: "Bonjour",
        instructions: "Réponds.",
        provider: "anthropic",
        model: "claude-sonnet-5",
        baseUrl: "http://127.0.0.1:8642",
        token: "test-token",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }

    expect(requestBody).toEqual({
      input: "Bonjour",
      instructions: "Réponds.",
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
  });

  test("forwards model_options.reasoning_effort when set", async () => {
    const previousFetch = globalThis.fetch;
    let requestBody: unknown;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ run_id: "hermes_run_2" }, { status: 202 });
    }) as typeof fetch;

    try {
      await createHermesAgentRun({
        input: "Bonjour",
        instructions: "Réponds.",
        provider: "openai-api",
        model: "gpt-5.4",
        reasoningEffort: "high",
        baseUrl: "http://127.0.0.1:8642",
        token: "test-token",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }

    expect(requestBody).toEqual({
      input: "Bonjour",
      instructions: "Réponds.",
      provider: "openai-api",
      model: "gpt-5.4",
      model_options: { reasoning_effort: "high" },
    });
  });

  test("forwards session_id and conversation_history", async () => {
    // Sans `conversation_history`, chaque mission repart sans contexte : c'est
    // ce qui faisait répondre « l'heure à Paris » à une question de suivi sur
    // la météo. MESURÉ (spike §11.3) : le `session_id` seul ne suffit pas,
    // `/v1/runs` ne rejoue jamais l'historique de session.
    const previousFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ run_id: "hermes_run_3" }, { status: 202 });
    }) as typeof fetch;

    try {
      await createHermesAgentRun({
        input: "paris là à cette heure ci",
        instructions: "Réponds.",
        sessionId: "console:thr_42",
        conversationHistory: [
          { role: "user", content: "execute une research de météo" },
          { role: "assistant", content: "Quelle ville ?" },
        ],
        baseUrl: "http://127.0.0.1:8642",
        token: "test-token",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }

    expect(requestBody.session_id).toBe("console:thr_42");
    expect(requestBody.conversation_history).toEqual([
      { role: "user", content: "execute une research de météo" },
      { role: "assistant", content: "Quelle ville ?" },
    ]);
  });

  test("omits session_id and conversation_history when absent", async () => {
    // Un `conversation_history: []` sur le premier message du thread serait du
    // bruit inutile dans le body.
    const previousFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ run_id: "hermes_run_4" }, { status: 202 });
    }) as typeof fetch;

    try {
      await createHermesAgentRun({
        input: "Bonjour",
        instructions: "Réponds.",
        conversationHistory: [],
        baseUrl: "http://127.0.0.1:8642",
        token: "test-token",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }

    expect(requestBody).not.toHaveProperty("session_id");
    expect(requestBody).not.toHaveProperty("conversation_history");
  });
});
