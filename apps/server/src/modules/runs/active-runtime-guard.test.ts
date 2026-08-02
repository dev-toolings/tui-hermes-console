import { describe, expect, test } from "bun:test";
import {
  acquireRunStartLease,
  acquireRuntimeMutationLease,
  assertRuntimeMutationIdle,
} from "./active-runtime-guard";

describe("runtime mutation guard", () => {
  test("a runtime mutation refuses a reserved run start", () => {
    const releaseRun = acquireRunStartLease();
    try {
      expect(() => acquireRuntimeMutationLease()).toThrow();
    } finally {
      releaseRun();
    }
  });

  test("a runtime mutation refuses an already active local run", () => {
    const globals = globalThis as typeof globalThis & {
      hermesConsoleActiveRuns?: Map<string, unknown>;
    };
    const activeRuns = (globals.hermesConsoleActiveRuns ??= new Map());
    activeRuns.set("run_guard_test", {});
    try {
      expect(() => acquireRuntimeMutationLease()).toThrow();
    } finally {
      activeRuns.delete("run_guard_test");
    }
  });

  test("a run start refuses an active runtime mutation", () => {
    const mutation = acquireRuntimeMutationLease();
    try {
      for (const operation of [acquireRunStartLease, assertRuntimeMutationIdle]) {
        try {
          operation();
          throw new Error("expected guard to fail");
        } catch (error) {
          expect((error as { code?: string }).code).toBe(
            "RUNTIME_MUTATION_IN_PROGRESS",
          );
        }
      }
    } finally {
      mutation.release();
    }
    expect(() => assertRuntimeMutationIdle()).not.toThrow();
  });
});
