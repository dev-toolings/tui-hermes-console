import { describe, expect, test } from "bun:test";
import {
  actualRunModel,
  buildRunExecutionDetails,
  displayRunHeaderModel,
  resolvedConsoleModel,
  threadContextModel,
  threadTotalTokens,
} from "./run-execution-details";
import type { RunDto, ThreadSnapshot } from "@console/core/modules/runs/types";

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

describe("threadTotalTokens", () => {
  const withRuns = (runs: unknown[]) => ({ ...snapshot, runs }) as unknown as ThreadSnapshot;

  test("additionne tous les runs du fil", () => {
    const total = threadTotalTokens(
      withRuns([
        { usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } },
      ]),
    );
    expect(total).toBe(135);
  });

  test("ignore les runs sans usage sans perdre les autres", () => {
    expect(
      threadTotalTokens(
        withRuns([{ usage: null }, { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }]),
      ),
    ).toBe(2);
  });

  test("aucune mesure n’est `null`, pas zéro", () => {
    expect(threadTotalTokens(withRuns([{ usage: null }]))).toBeNull();
    expect(threadTotalTokens(withRuns([]))).toBeNull();
    expect(threadTotalTokens(null)).toBeNull();
  });
});

describe("threadContextModel", () => {
  test("le modèle réellement servi par le runtime prime, sans préfixe fournisseur", () => {
    const value = threadContextModel({
      ...snapshot,
      runs: [
        { runtimeSession: { model: "claude-sonnet-5" } },
        { runtimeSession: null },
      ],
    } as unknown as ThreadSnapshot);
    expect(value).toBe("claude-sonnet-5");
  });

  test("repli sur le modèle effectif de la Console", () => {
    const value = threadContextModel({
      ...snapshot,
      runs: [{ runtimeSession: null }],
    } as unknown as ThreadSnapshot);
    expect(value).toBe("gpt-5.6-luna");
  });
});
