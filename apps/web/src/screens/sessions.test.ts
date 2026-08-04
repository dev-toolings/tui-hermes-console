import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ThreadListItemDto } from "@console/core/modules/runs/types";
import {
  matchesSessionSearch,
  resolvedSessionsView,
  sessionDestination,
  sessionsHref,
  sessionsSearchForView,
  SessionsViewToggle,
} from "./sessions";

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

  test("keeps list and kanban inside the merged Sessions surface", () => {
    expect(resolvedSessionsView({})).toBe("list");
    expect(resolvedSessionsView({ source: "chat", view: "kanban" })).toBe("list");
    expect(resolvedSessionsView({ source: "mission" })).toBe("kanban");
    expect(resolvedSessionsView({ source: "mission", view: "list" })).toBe("list");
    expect(sessionsSearchForView({ source: "chat" }, "kanban")).toMatchObject({
      source: "mission",
      view: "kanban",
    });
    expect(sessionsHref({ source: "mission", view: "list", filter: "failed" })).toBe(
      "/sessions?source=mission&view=list&filter=failed",
    );

    const html = renderToStaticMarkup(
      createElement(SessionsViewToggle, {
        view: "kanban",
        onViewChange: () => undefined,
      }),
    );
    expect(html).toContain('aria-label="Vue des sessions"');
    expect(html).toContain(">Liste</button>");
    expect(html).toContain(">Kanban</button>");
    expect(html).toContain('data-state="on"');
  });
});
