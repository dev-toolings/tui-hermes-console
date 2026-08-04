import { describe, expect, test } from "bun:test";
import { DEFAULT_REASONING_EFFORT } from "@console/core/lib/runtime/reasoning-effort";
import {
  pickAvailableRuntimeModelSelection,
} from "./available-model-selection";
import type { HermesModelCatalog } from "./hermes-adapter";

const catalog = {
  currentProvider: "auto",
  runtimeDefaultModel: "anthropic/claude-opus-4.6",
  providers: [
    {
      slug: "moa",
      name: "Mixture of Agents",
      isCurrent: false,
      authenticated: true,
      acceptsApiKey: false,
      authType: "virtual",
      warning: null,
      source: "virtual",
      models: [{ id: "default", fast: false, reasoning: false }],
    },
    {
      slug: "openai-api",
      name: "OpenAI API",
      isCurrent: false,
      authenticated: false,
      acceptsApiKey: true,
      authType: "api_key",
      warning: null,
      source: null,
      models: [{ id: "gpt-5.4-nano", fast: true, reasoning: false }],
    },
    {
      slug: "openai-codex",
      name: "OpenAI Codex",
      isCurrent: false,
      authenticated: true,
      acceptsApiKey: false,
      authType: "oauth",
      warning: null,
      source: null,
      models: [{ id: "gpt-5.4", fast: false, reasoning: true }],
    },
  ],
} satisfies HermesModelCatalog;

describe("pickAvailableRuntimeModelSelection", () => {
  test("repairs an unauthenticated API selection with the connected Codex provider", () => {
    expect(
      pickAvailableRuntimeModelSelection(catalog, {
        provider: "openai-api",
        model: "gpt-5.4-nano",
        reasoningEffort: null,
      }),
    ).toEqual({
      provider: "openai-codex",
      model: "gpt-5.4",
      reasoningEffort: DEFAULT_REASONING_EFFORT,
    });
  });

  test("keeps a valid persisted provider and model", () => {
    expect(
      pickAvailableRuntimeModelSelection(catalog, {
        provider: "openai-codex",
        model: "gpt-5.4",
        reasoningEffort: "high",
      }),
    ).toEqual({
      provider: "openai-codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
    });
  });
});
