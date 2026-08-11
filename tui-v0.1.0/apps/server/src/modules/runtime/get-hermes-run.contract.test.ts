import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Smoke: la fixture spike `run-status.json` reste compatible avec le contrat
 * consommé par `getHermesRun` (réconciliation).
 */
describe("getHermesRun contract", () => {
  test("spike fixture exposes status/output/usage", () => {
    const fixture = JSON.parse(
      readFileSync(
        // `bun run --filter server test` keeps the workspace root as cwd.
        // The fixture belongs to this package, independently of the caller.
        join(import.meta.dir, "../../../../../spike/fixtures/run-status.json"),
        "utf8",
      ),
    ) as {
      body: {
        status: string;
        output: string;
        usage: {
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
        };
      };
    };

    expect(fixture.body.status).toBe("completed");
    expect(fixture.body.output.length).toBeGreaterThan(0);
    expect(fixture.body.usage.total_tokens).toBe(120);
  });
});
