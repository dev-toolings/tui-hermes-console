// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  ATTENTION_LABEL,
  ATTENTION_ORDER,
  channelAttention,
  formatElapsed,
  missionsForChannel,
  resolveAttentionState,
} from "./channel-attention";

describe("ATTENTION_ORDER", () => {
  test("ranks every state exactly once, in the resolver's own priority", () => {
    expect([...ATTENTION_ORDER].sort()).toEqual(
      Object.keys(ATTENTION_LABEL).sort(),
    );
    /* Cumulative inputs, so this measures precedence and not just mapping: each
       row raises every signal from its rank downwards, and only a resolver that
       still prefers the higher one answers in ATTENTION_ORDER. Single-signal
       rows would stay green after the resolver's own priority was inverted. */
    const inputs = [
      { hasPendingGate: true, hasWaitingMission: true, hasRunningMission: true, hasUnread: true },
      { hasPendingGate: false, hasWaitingMission: true, hasRunningMission: true, hasUnread: true },
      { hasPendingGate: false, hasWaitingMission: false, hasRunningMission: true, hasUnread: true },
      { hasPendingGate: false, hasWaitingMission: false, hasRunningMission: false, hasUnread: true },
      { hasPendingGate: false, hasWaitingMission: false, hasRunningMission: false, hasUnread: false },
    ];
    expect(inputs.map(resolveAttentionState)).toEqual(ATTENTION_ORDER);
  });
});

describe("resolveAttentionState", () => {
  test("a pending gate outranks everything else", () => {
    expect(
      resolveAttentionState({
        hasPendingGate: true,
        hasWaitingMission: true,
        hasRunningMission: true,
        hasUnread: true,
      }),
    ).toBe("decision");
  });

  test("waiting beats running, running beats unread, unread beats calm", () => {
    expect(
      resolveAttentionState({
        hasPendingGate: false,
        hasWaitingMission: true,
        hasRunningMission: true,
        hasUnread: true,
      }),
    ).toBe("question");
    expect(
      resolveAttentionState({
        hasPendingGate: false,
        hasWaitingMission: false,
        hasRunningMission: true,
        hasUnread: true,
      }),
    ).toBe("working");
    expect(
      resolveAttentionState({
        hasPendingGate: false,
        hasWaitingMission: false,
        hasRunningMission: false,
        hasUnread: true,
      }),
    ).toBe("activity");
    expect(
      resolveAttentionState({
        hasPendingGate: false,
        hasWaitingMission: false,
        hasRunningMission: false,
        hasUnread: false,
      }),
    ).toBe("calm");
  });
});

describe("channelAttention over the mission fixtures", () => {
  test("incidents carries the purge-worker pending gate", () => {
    const attention = channelAttention("incidents");
    expect(attention.state).toBe("decision");
    expect(attention.gates).toHaveLength(1);
    expect(attention.gates[0].mission.id).toBe("purge-worker");
    expect(attention.gates[0].gate.kind).toBe("gate");
  });

  test("general shows the running hermes mission, no gate", () => {
    const attention = channelAttention("general");
    expect(attention.state).toBe("working");
    expect(attention.workingAgent).toBe("hermes");
    expect(attention.workingSince).not.toBeNull();
    expect(attention.gates).toHaveLength(0);
  });

  test("a channel without missions falls back to unread then calm", () => {
    expect(missionsForChannel("équipe")).toHaveLength(0);
    expect(channelAttention("équipe", { hasUnread: true }).state).toBe("activity");
    expect(channelAttention("équipe").state).toBe("calm");
  });
});

describe("formatElapsed", () => {
  const now = Date.parse("2026-08-11T12:00:00.000Z");

  test("floors by unit and never says zero", () => {
    expect(formatElapsed("2026-08-11T11:59:50.000Z", now)).toBe("1 min");
    expect(formatElapsed("2026-08-11T11:12:00.000Z", now)).toBe("48 min");
    expect(formatElapsed("2026-08-11T09:00:00.000Z", now)).toBe("3 h");
    expect(formatElapsed("2026-08-08T12:00:00.000Z", now)).toBe("3 j");
  });

  test("returns empty on an unparsable date", () => {
    expect(formatElapsed("not-a-date", now)).toBe("");
  });
});
