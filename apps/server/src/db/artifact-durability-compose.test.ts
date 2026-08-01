import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const enabled = process.env.RUN_G1_001_COMPOSE === "1";
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const describeWithCompose = enabled && dockerAvailable ? describe : describe.skip;

describeWithCompose("G1-001 artifact durability through Compose replacement", () => {
  test("keeps the named files volume and verified bytes after console replacement", () => {
    const result = spawnSync(
      "bun",
      ["apps/server/scripts/prove-artifact-durability.ts"],
      { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 24 * 1024 * 1024 },
    );
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as {
      status: string;
      consoleBefore: string;
      consoleAfter: string;
      volume: string;
      http: { before: number; after: number; corrupt: number; missing: number };
      cleanup: string;
    };
    expect(report.status).toBe("PASS");
    expect(report.consoleBefore).not.toBe(report.consoleAfter);
    expect(report.volume).toMatch(/_files-data$/);
    expect(report.http).toEqual({ before: 200, after: 200, corrupt: 409, missing: 410 });
    expect(report.cleanup).toBe("confirmed");
  }, 180_000);
});
