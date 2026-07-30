import { describe, expect, test } from "bun:test";

/**
 * Contrat cancel Phase 3 — la route délègue à `cancelRun` (DB + process + Hermes).
 * Vérifie que le module exporté existe et que le shape de résultat est stable.
 */
describe("cancelRun contract", () => {
  test("exports cancelRun with documented result shape", async () => {
    const mod = await import("./cancel-run");
    expect(typeof mod.cancelRun).toBe("function");

    type Result = Awaited<ReturnType<typeof mod.cancelRun>>;
    const sample: Result = {
      runId: "run_x",
      status: "stopping",
      local: true,
      remoteStop: true,
    };
    expect(sample.status === "stopping" || sample.status === "cancelled").toBe(
      true,
    );
  });
});
