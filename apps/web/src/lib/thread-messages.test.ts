import { describe, expect, test } from "bun:test";
import {
  buildLivePartsFromEvents,
  buildMessages,
  buildPartsFromEvents,
  buildThreadMessagesFromSnapshot,
  threadMessageId,
} from "./thread-messages";
import type { ThreadSnapshot } from "@console/core/modules/runs/types";

describe("thread-messages", () => {
  test("stabilise l'identité d'un message dès que le run est connu", () => {
    expect(threadMessageId("user", "run_1", "optimistic_msg_1")).toBe("user_run_1");
    expect(threadMessageId("assistant", "run_1", "msg_a")).toBe("assistant_run_1");
    expect(threadMessageId("user", null, "msg_u")).toBe("msg_u");
  });

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

  test("rattache la décision d’autorisation à l’appel d’outil qu’elle débloque", () => {
    const parts = buildPartsFromEvents([
      { type: "tool.call", payload: { toolCallId: "tc_0", tool: "terminal", preview: "curl | python3" } },
      {
        type: "approval.requested",
        payload: { command: "curl | python3", choices: ["once", "deny"], description: null },
      },
      { type: "approval.responded", payload: { choice: "once", resolved: 1 } },
      {
        type: "tool.result",
        payload: { toolCallId: "tc_0", durationMs: 1400, error: false, hasResultPayload: true, result: "31 29" },
      },
    ]);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "tool-call",
      toolCallId: "tc_0",
      args: { approval: { choice: "once" } },
    });
  });

  test("un refus se trace comme une autorisation", () => {
    const parts = buildPartsFromEvents([
      { type: "tool.call", payload: { toolCallId: "tc_0", tool: "terminal", preview: "rm -rf /" } },
      { type: "approval.responded", payload: { choice: "deny", resolved: 1 } },
    ]);
    expect(parts[0]).toMatchObject({ args: { approval: { choice: "deny" } } });
  });

  test("tant que personne n’a tranché, l’appel ne porte aucune décision", () => {
    const parts = buildPartsFromEvents([
      { type: "tool.call", payload: { toolCallId: "tc_0", tool: "terminal", preview: "curl | python3" } },
      {
        type: "approval.requested",
        payload: { command: "curl | python3", choices: ["once", "deny"], description: null },
      },
    ]);
    expect((parts[0] as { args: Record<string, unknown> }).args.approval).toBeUndefined();
  });

  test("seul l’appel concerné est marqué, et une décision orpheline est ignorée", () => {
    const parts = buildPartsFromEvents([
      { type: "approval.responded", payload: { choice: "once" } },
      { type: "tool.call", payload: { toolCallId: "tc_0", tool: "terminal", preview: "date" } },
      { type: "tool.call", payload: { toolCallId: "tc_1", tool: "terminal", preview: "curl | python3" } },
      { type: "approval.responded", payload: { choice: "deny" } },
    ]);

    expect((parts[0] as { args: Record<string, unknown> }).args.approval).toBeUndefined();
    expect(parts[1]).toMatchObject({ args: { approval: { choice: "deny" } } });
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
      workflow: "general" as const,
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
      workflow: "general" as const,
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
    expect(terminal[0]?.id).toBe("user_run_1");
    expect(persisted[0]?.id).toBe(terminal[0]?.id);
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
      workflow: "general" as const,
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
