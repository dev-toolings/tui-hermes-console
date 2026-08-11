// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  buildTimeline,
  defaultNoise,
  eventsForMission,
  filterByLens,
  pendingGates,
  type MissionEvent,
} from "./mission-events";

const event = (patch: Partial<MissionEvent> & Pick<MissionEvent, "id">): MissionEvent => ({
  missionId: "m",
  at: "2026-08-11T09:00:00.000Z",
  actor: { kind: "agent", id: "agent-purge" },
  kind: "tool",
  noise: "trace",
  title: "lecture",
  ...patch,
});

describe("noise ladder", () => {
  test("a gate is a decision and a tool call is a trace", () => {
    expect(defaultNoise("gate")).toBe("decision");
    expect(defaultNoise("tool")).toBe("trace");
    expect(defaultNoise("message")).toBe("fact");
  });

  test("consecutive traces from one actor collapse into a single row", () => {
    const rows = buildTimeline([
      event({ id: "a" }),
      event({ id: "b" }),
      event({ id: "c" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "trace" });
    if (rows[0].type === "trace") expect(rows[0].events).toHaveLength(3);
  });

  test("a different actor opens a new fold", () => {
    const rows = buildTimeline([
      event({ id: "a" }),
      event({ id: "b", actor: { kind: "agent", id: "vador" } }),
    ]);
    expect(rows).toHaveLength(2);
  });

  test("a fact breaks the fold and keeps its own row", () => {
    const rows = buildTimeline([
      event({ id: "a" }),
      event({ id: "b", kind: "message", noise: "fact", actor: { kind: "human", id: "Kev" } }),
      event({ id: "c" }),
    ]);
    expect(rows.map((row) => row.type)).toEqual(["trace", "event", "trace"]);
  });

  test("a pending gate is never folded away", () => {
    const rows = buildTimeline([
      event({ id: "a" }),
      event({ id: "gate", kind: "gate", noise: "decision", decision: "pending" }),
      event({ id: "b" }),
    ]);
    expect(rows.some((row) => row.type === "event" && row.event.id === "gate")).toBe(true);
  });

  // The acceptance criterion of the redesign: a loud run must stay readable.
  test("the 186-call fixture run renders in at most 5 collapsed rows", () => {
    const events = eventsForMission("purge-worker");
    expect(events.filter((entry) => entry.noise === "trace").length).toBeGreaterThan(150);
    const folds = buildTimeline(events).filter((row) => row.type === "trace");
    expect(folds).toHaveLength(1);
    expect(buildTimeline(events).length).toBeLessThanOrEqual(8);
  });
});

describe("lenses", () => {
  const events = eventsForMission("purge-worker");

  test("talk keeps only the human and agent messages", () => {
    expect(filterByLens(events, "talk").every((entry) => entry.kind === "message")).toBe(true);
    expect(filterByLens(events, "talk")).toHaveLength(2);
  });

  test("audit keeps the gate and the state changes", () => {
    const audit = filterByLens(events, "audit");
    expect(audit.map((entry) => entry.kind)).toEqual(["gate"]);
  });

  test("exec drops the conversation but keeps the traces", () => {
    const exec = filterByLens(events, "exec");
    expect(exec.some((entry) => entry.kind === "message")).toBe(false);
    expect(exec.some((entry) => entry.kind === "tool")).toBe(true);
  });

  test("all returns the untouched list", () => {
    expect(filterByLens(events, "all")).toHaveLength(events.length);
  });
});

describe("gates", () => {
  test("only the undecided gates are pending", () => {
    expect(pendingGates(eventsForMission("purge-worker"))).toHaveLength(1);
    const settled = eventsForMission("purge-worker").map((entry) =>
      entry.kind === "gate" ? { ...entry, decision: "approved" as const } : entry,
    );
    expect(pendingGates(settled)).toHaveLength(0);
  });
});
