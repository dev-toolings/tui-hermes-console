import { describe, expect, test } from "bun:test";
import { toProductEvents } from "./product-events";
import type { RunEvent } from "@console/core/lib/hermes-events";

describe("product-events", () => {
  test("conserve approval.requested comme type produit", () => {
    const events: RunEvent[] = [
      {
        sequence: 0,
        type: "approval.requested",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: { command: "rm -rf /", choices: [], description: null },
      },
      {
        sequence: 1,
        type: "tool.call",
        occurredAt: new Date("2026-01-01T00:00:01.000Z"),
        payload: { toolCallId: "tc_0", tool: "read_file", preview: "a.txt" },
      },
    ];

    expect(toProductEvents(events)).toEqual([
      {
        sequence: 0,
        type: "approval.requested",
        occurredAt: events[0]!.occurredAt,
        payload: events[0]!.payload,
      },
      {
        sequence: 1,
        type: "tool.call",
        occurredAt: events[1]!.occurredAt,
        payload: events[1]!.payload,
      },
    ]);
  });
});
