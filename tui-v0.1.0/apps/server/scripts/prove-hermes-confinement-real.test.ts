import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";

const runRealProbe = process.env.RUN_G1_002B === "1";
const describeRealProbe = runRealProbe ? describe : describe.skip;

describeRealProbe("G1-002B real Hermes image probe", () => {
  test("reports compatibility instead of treating the upstream image as a fixture", () => {
    const image = process.env.HERMES_REAL_IMAGE?.trim();
    expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
    const result = spawnSync("bun", ["apps/server/scripts/prove-hermes-confinement-real.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    });
    const report = JSON.parse(result.stdout) as {
      status: string;
      observedVersion: string | null;
      failures: string[];
    };
    expect(["PASS", "BLOCKED"]).toContain(report.status);
    expect(report.observedVersion).toMatch(/^0\./);
    if (report.status === "BLOCKED") {
      expect(result.status).not.toBe(0);
      expect(report.failures.length).toBeGreaterThan(0);
    } else {
      expect(result.status).toBe(0);
    }
  });
});
