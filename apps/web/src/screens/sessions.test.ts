import { describe, expect, test } from "bun:test";
import type { ThreadListItemDto } from "@console/core/modules/runs/types";
import { matchesSessionSearch, sessionDestination } from "./sessions";

const thread = (overrides: Partial<ThreadListItemDto> = {}): ThreadListItemDto => ({
  id: "thr_1",
  title: "Préparer le rapport mensuel",
  source: "mission",
  agentName: "Analyste",
  provider: "openai",
  model: "gpt-5.6",
  updatedAt: "2026-08-02T12:00:00.000Z",
  latestRun: null,
  ...overrides,
});

describe("sessions index", () => {
  test("routes chats and missions to their real work surfaces", () => {
    expect(sessionDestination(thread({ source: "chat" }))).toBe("/chat/thr_1");
    expect(sessionDestination(thread({ source: "mission" }))).toBe("/runs/thr_1");
  });

  test("filters by source and searches title, agent, provider or model", () => {
    const row = thread();
    expect(matchesSessionSearch(row, { source: "mission", q: "rapport" })).toBe(true);
    expect(matchesSessionSearch(row, { q: "Analyste" })).toBe(true);
    expect(matchesSessionSearch(row, { q: "gpt-5.6" })).toBe(true);
    expect(matchesSessionSearch(row, { source: "chat" })).toBe(false);
    expect(matchesSessionSearch(row, { q: "inexistant" })).toBe(false);
  });
});
