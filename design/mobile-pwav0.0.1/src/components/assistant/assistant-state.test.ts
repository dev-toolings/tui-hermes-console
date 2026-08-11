// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  advanceAssistantStream,
  createAssistantState,
  createSession,
  sendAssistantMessage,
  stopAssistantStream,
  updateDraft,
} from "./assistant-state";

describe("assistant state", () => {
  test("persists a non-empty draft through unrelated session changes", () => {
    const initial = createAssistantState();
    const activeId = initial.sessions[0].id;
    const drafted = updateDraft(initial, activeId, "Ne pas perdre ce brouillon");
    const next = createSession(drafted);

    expect(next.sessions.find((session) => session.id === activeId)?.draft).toBe(
      "Ne pas perdre ce brouillon",
    );
  });

  test("keeps an interrupted stream resumable and allows an explicit stop", () => {
    const initial = createAssistantState();
    const sessionId = initial.sessions[0].id;
    const sent = sendAssistantMessage(updateDraft(initial, sessionId, "Prépare le plan"), sessionId);
    const progressed = advanceAssistantStream(sent, sessionId, 12);
    const streaming = progressed.sessions[0].messages.at(-1);

    expect(streaming?.streaming).toBe(true);
    expect(streaming?.content.length).toBe(12);
    expect(progressed.sessions[0].streamCursor).toBe(12);

    const stopped = stopAssistantStream(progressed, sessionId);
    expect(stopped.sessions[0].messages.at(-1)?.streaming).toBe(false);
    expect(stopped.sessions[0].streamCursor).toBeUndefined();
  });
});
