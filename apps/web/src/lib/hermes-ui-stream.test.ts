import { describe, expect, test } from "bun:test";
import { productEventToUiStreamChunks } from "./hermes-ui-stream";
import type { StoredProductEvent } from "@/modules/runs/types";

describe("hermes-ui-stream", () => {
  test("mappe message, tool et terminal", () => {
    const message: StoredProductEvent = {
      cursor: 1,
      runId: "run_1",
      sequence: 1,
      type: "agent.message",
      payload: { text: "hello" },
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const toolCall: StoredProductEvent = {
      cursor: 2,
      runId: "run_1",
      sequence: 2,
      type: "tool.call",
      payload: { toolCallId: "tc_1", tool: "read_file", preview: "a.ts" },
      occurredAt: new Date("2026-01-01T00:00:01.000Z"),
    };
    const completed: StoredProductEvent = {
      cursor: 3,
      runId: "run_1",
      sequence: 3,
      type: "run.completed",
      payload: {},
      occurredAt: new Date("2026-01-01T00:00:02.000Z"),
    };

    expect(productEventToUiStreamChunks(message)).toEqual([
      { type: "text-delta", textDelta: "hello" },
    ]);
    expect(productEventToUiStreamChunks(toolCall)).toEqual([
      {
        type: "tool-call-start",
        id: "tc_1",
        toolCallId: "tc_1",
        toolName: "read_file",
      },
    ]);
    expect(productEventToUiStreamChunks(completed)).toEqual([
      { type: "finish", finishReason: "stop" },
    ]);
  });
});
