import { describe, expect, test } from "bun:test";
import {
  actualRunModel,
  buildRunExecutionDetails,
  displayRunHeaderModel,
  resolvedConsoleModel,
} from "./run-execution-details";
import type { RunDto, ThreadSnapshot } from "@/modules/runs/types";

const snapshot = {
  effectiveProvider: "openai-api",
  effectiveModel: "gpt-5.6-luna",
  events: [],
} as unknown as ThreadSnapshot;

const completedRun = {
  id: "run_1",
  status: "completed",
  hermesResponseId: "run_hermes_1",
  runtimeSession: {
    id: "run_hermes_1",
    model: "gpt-5.4-nano",
    reasoningTokens: 0,
    toolCallCount: 0,
  },
} as RunDto;

describe("run-execution-details", () => {
  test("uses Hermes session model instead of console default", () => {
    expect(actualRunModel(snapshot, completedRun)).toBe("openai-api / gpt-5.4-nano");
    expect(resolvedConsoleModel(snapshot)).toBe("openai-api / gpt-5.6-luna");
    expect(displayRunHeaderModel(snapshot, completedRun)).toBe("openai-api / gpt-5.4-nano");
  });

  test("does not fall back to console model for completed runs without session", () => {
    const run = { ...completedRun, runtimeSession: null } as RunDto;
    const details = buildRunExecutionDetails(snapshot, run);
    expect(details.activeModel).toBeNull();
    expect(details.activeLabel).toBe("Modèle utilisé");
  });

  test("shows console model while run is active", () => {
    const run = { ...completedRun, status: "running", runtimeSession: null } as RunDto;
    const details = buildRunExecutionDetails(snapshot, run);
    expect(details.activeModel).toBe("openai-api / gpt-5.6-luna");
    expect(details.activeLabel).toBe("LLM actif");
  });
});
