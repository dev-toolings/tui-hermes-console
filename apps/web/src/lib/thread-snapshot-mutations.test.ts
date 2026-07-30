import { describe, expect, test } from "bun:test";
import {
  applyProductEventToSnapshot,
  isTerminalProductEvent,
  latestOpenApproval,
} from "./thread-snapshot-mutations";
import type { ThreadSnapshot } from "@/modules/runs/types";

const baseSnapshot = {
  id: "thr_1",
  title: "t",
  source: "mission" as const,
  agentName: "a",
  instructions: "i",
  model: "m",
  effectiveModel: "m",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: [],
  runs: [
    {
      id: "run_1",
      status: "starting",
      input: "hi",
      output: null,
      usage: null,
      error: null,
      hermesResponseId: null,
      runtimeSession: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: null,
      endedAt: null,
      lastEventAt: null,
    },
  ],
  events: [],
  artifacts: [],
  cursor: 0,
} satisfies ThreadSnapshot;

describe("thread-snapshot-mutations", () => {
  test("applique un event et passe le run en running", () => {
    const event = {
      cursor: 1,
      runId: "run_1",
      sequence: 1,
      type: "agent.message" as const,
      payload: { text: "ok" },
      occurredAt: new Date("2026-01-01T00:00:01.000Z"),
    };

    const next = applyProductEventToSnapshot(baseSnapshot, event);
    expect(next.cursor).toBe(1);
    expect(next.events).toHaveLength(1);
    expect(next.runs[0]?.status).toBe("running");
    expect(next.runs[0]?.lastEventAt).toBeTruthy();
  });

  test("approval.requested → awaiting_approval (non terminal)", () => {
    const event = {
      cursor: 2,
      runId: "run_1",
      sequence: 2,
      type: "approval.requested" as const,
      payload: { command: "rm -f /tmp/x", choices: ["allow", "deny"], description: null },
      occurredAt: new Date("2026-01-01T00:00:02.000Z"),
    };
    const next = applyProductEventToSnapshot(
      { ...baseSnapshot, runs: [{ ...baseSnapshot.runs[0]!, status: "running" }] },
      event,
    );
    expect(next.runs[0]?.status).toBe("awaiting_approval");
    expect(isTerminalProductEvent(event)).toBe(false);
    expect(latestOpenApproval(next.events, "run_1")?.command).toBe("rm -f /tmp/x");
  });

  test("détecte terminal", () => {
    expect(
      isTerminalProductEvent({
        cursor: 2,
        runId: "run_1",
        sequence: 2,
        type: "run.completed",
        payload: {},
        occurredAt: new Date(),
      }),
    ).toBe(true);
  });
});
