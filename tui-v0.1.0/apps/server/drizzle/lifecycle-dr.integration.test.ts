import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const enabled = process.env.RUN_G1_006_DR === "1";
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const describeWithDocker = enabled && dockerAvailable ? describe : describe.skip;

describeWithDocker("G1-006D2 local disaster-recovery bundle", () => {
  test("restores an ephemeral pg_dump and files-data archive into scratch", () => {
    const result = spawnSync("bun", ["apps/server/scripts/prove-lifecycle-dr-local.ts"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 24 * 1024 * 1024,
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as {
      status: string;
      mode: string;
      sourceRowsBefore: string;
      sourceRowsAfter: string;
      scratchRows: string;
      checks: string[];
      limitations: string[];
    };
    expect(report.status).toBe("PASS");
    expect(report.mode).toBe("ephemeral-postgres-and-files-fixture");
    expect(report.sourceRowsBefore).toBe("1|1");
    expect(report.sourceRowsAfter).toBe(report.sourceRowsBefore);
    expect(report.scratchRows).toBe(report.sourceRowsBefore);
    expect(report.checks).toContain("dump tamper refused");
    expect(report.checks).toContain("occupied scratch refused");
    expect(report.limitations).toContain("no P-OPS/P-SEC");
  }, 180_000);
});
