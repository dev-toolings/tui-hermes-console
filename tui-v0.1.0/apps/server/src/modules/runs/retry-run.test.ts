import { describe, expect, test } from "bun:test";

describe("retryRun contract", () => {
  test("exports retryRun", async () => {
    const mod = await import("./retry-run");
    expect(typeof mod.retryRun).toBe("function");

    type Result = Awaited<ReturnType<typeof mod.retryRun>>;
    const sample: Result = {
      threadId: "thr_x",
      runId: "run_y",
      sourceRunId: "run_x",
    };
    expect(sample.sourceRunId).toBe("run_x");
  });
});
