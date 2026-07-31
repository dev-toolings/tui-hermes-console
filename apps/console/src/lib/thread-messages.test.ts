import { describe, expect, test } from "bun:test";
import {
  buildLivePartsFromEvents,
  buildMessages,
  buildPartsFromEvents,
  buildThreadMessagesFromSnapshot,
} from "./thread-messages";
import type { ThreadSnapshot } from "@console/core/modules/runs/types";

describe("thread-messages", () => {
  test("entrelace text, reasoning et tool-call", () => {
    const parts = buildPartsFromEvents([
      { type: "agent.reasoning", payload: { text: "plan" } },
      { type: "agent.message", payload: { text: "ok " } },
      { type: "agent.message", payload: { text: "suite" } },
      {
        type: "tool.call",
        payload: { toolCallId: "c1", tool: "read_file", preview: "a.ts" },
      },
      {
        type: "tool.result",
        payload: {
          toolCallId: "c1",
          durationMs: 12,
          error: false,
          hasResultPayload: true,
          result: "src",
        },
      },
    ]);

    expect(parts).toEqual([
      { type: "reasoning", text: "plan" },
      { type: "text", text: "ok suite" },
      {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "read_file",
        args: { tool: "read_file", preview: "a.ts", arguments: null },
        result: {
          durationMs: 12,
          error: false,
          hasResultPayload: true,
          output: "src",
        },
      },
    ]);
  });

  test("buildMessages produit user + assistant", () => {
    const messages = buildMessages("go", [
      { type: "agent.message", payload: { text: "done" } },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
  });

  test("live parts ignore tools", () => {
    const parts = buildLivePartsFromEvents([
      { type: "tool.call", payload: { toolCallId: "c1", tool: "read_file" } },
      { type: "agent.message", payload: { text: "hello" } },
      { type: "agent.reasoning", payload: { text: "plan" } },
    ]);
    expect(parts).toEqual([
      { type: "text", text: "hello" },
      { type: "reasoning", text: "plan" },
    ]);
  });

  test("snapshot failed → status incomplete", () => {
    const snapshot = {
      id: "thr_1",
      title: "t",
      source: "chat" as const,
      agentName: "a",
      instructions: "i",
      model: "m",
      effectiveModel: "m",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [
        {
          id: "msg_u",
          role: "user",
          content: [{ type: "text", text: "hi" }],
          runId: "run_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "msg_a",
          role: "assistant",
          content: [{ type: "text", text: "boom" }],
          runId: "run_1",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      runs: [
        {
          id: "run_1",
          status: "failed",
          input: "hi",
          output: null,
          usage: null,
          error: "timeout",
          hermesResponseId: null,
          runtimeSession: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:01.000Z",
          lastEventAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      events: [],
      artifacts: [],
      cursor: 0,
    } satisfies ThreadSnapshot;

    const messages = buildThreadMessagesFromSnapshot(snapshot);
    expect(messages[1]?.status).toEqual({
      type: "incomplete",
      reason: "error",
      error: "timeout",
    });
  });

  test("conserve le même message assistant entre terminal live et persistance", () => {
    const base = {
      id: "thr_1",
      title: "t",
      source: "mission" as const,
      agentName: "a",
      instructions: "i",
      model: "m",
      effectiveModel: "m",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      messages: [
        {
          id: "msg_u",
          role: "user",
          content: [{ type: "text", text: "hi" }],
          runId: "run_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      runs: [
        {
          id: "run_1",
          status: "completed",
          input: "hi",
          output: "done",
          usage: null,
          error: null,
          hermesResponseId: null,
          runtimeSession: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:01.000Z",
          lastEventAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      events: [
        {
          runId: "run_1",
          sequence: 1,
          type: "agent.message",
          payload: { text: "done" },
          cursor: 1,
          occurredAt: new Date("2026-01-01T00:00:01.000Z"),
        },
      ],
      artifacts: [],
      cursor: 1,
    } satisfies ThreadSnapshot;

    const terminal = buildThreadMessagesFromSnapshot(base);
    const persisted = buildThreadMessagesFromSnapshot({
      ...base,
      messages: [
        ...base.messages,
        {
          id: "msg_a",
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          runId: "run_1",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    });

    expect(terminal.at(-1)).toMatchObject({
      id: "assistant_run_1",
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      status: { type: "complete", reason: "stop" },
    });
    expect(persisted.at(-1)?.id).toBe(terminal.at(-1)?.id);
  });

  test("réutilise l'objet des messages figés, en reconstruit un dont le run a changé", () => {
    const message = {
      id: "msg_a",
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "ok" }],
      runId: "run_1",
      createdAt: "2026-01-01T00:00:01.000Z",
    };
    const run = {
      id: "run_1",
      status: "running" as const,
      input: "hi",
      output: null,
      usage: null,
      error: null,
      hermesResponseId: null,
      runtimeSession: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      lastEventAt: null,
    };
    const snapshot = {
      id: "thr_1",
      title: "t",
      source: "chat" as const,
      agentName: "a",
      instructions: "i",
      model: "m",
      effectiveModel: "m",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [message],
      runs: [run],
      events: [],
      artifacts: [],
      cursor: 0,
    } satisfies ThreadSnapshot;

    const first = buildThreadMessagesFromSnapshot(snapshot);

    // Ce que fait `applyProductEventToSnapshot` : nouveau snapshot, nouveaux
    // `events`/`cursor`, mais le même objet message. Il doit ressortir à
    // l'identique — c'est ce qui empêche assistant-ui de re-rendre tout le fil.
    const afterEvent = buildThreadMessagesFromSnapshot({
      ...snapshot,
      cursor: 1,
      events: [
        {
          runId: "run_1",
          sequence: 1,
          type: "agent.message",
          payload: { text: "ok" },
          cursor: 1,
          occurredAt: new Date("2026-01-01T00:00:01.000Z"),
        },
      ],
    });
    expect(afterEvent[0]).toBe(first[0]);

    // En revanche, un changement de statut du run doit bien se voir.
    const afterCompletion = buildThreadMessagesFromSnapshot({
      ...snapshot,
      runs: [{ ...run, status: "completed", endedAt: "2026-01-01T00:00:02.000Z" }],
    });
    expect(afterCompletion[0]).not.toBe(first[0]);
    expect(afterCompletion[0]?.status).toEqual({ type: "complete", reason: "stop" });
  });
});
