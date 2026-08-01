import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HermesG1A007AFixture } from "./hermes-g1-007a";

describe("Hermes G1-007A HTTP fixture", () => {
  test("emits approval once, records the decision, and materializes only an allowed effect", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-g1-007a-fixture-test-"));
    const fixture = new HermesG1A007AFixture(root);
    try {
      const created = await fetch(`${fixture.baseUrl}/v1/runs`, {
        method: "POST",
        body: JSON.stringify({ input: "fixture" }),
      });
      expect(created.status).toBe(200);
      const { run_id: runId } = (await created.json()) as { run_id: string };
      fixture.bindConsoleRun(runId, "run_fixture_once");

      const firstEvents = await fetch(`${fixture.baseUrl}/v1/runs/${runId}/events`);
      expect(await firstEvents.text()).toContain('"approval.request"');
      const replayEvents = await fetch(`${fixture.baseUrl}/v1/runs/${runId}/events`);
      expect(await replayEvents.text()).not.toContain('"approval.request"');

      const approved = await fetch(`${fixture.baseUrl}/v1/runs/${runId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice: "once" }),
      });
      expect(approved.status).toBe(204);
      expect(fixture.approvalCalls).toHaveLength(1);
      expect(fixture.dangerousEffectCount).toBe(1);
      expect(await readFile(join(root, "runs/run_fixture_once/out/result.txt"), "utf8")).toBe(
        "artifact-bytes-g1-007a",
      );

      const deniedRun = await fetch(`${fixture.baseUrl}/v1/runs`, {
        method: "POST",
        body: JSON.stringify({ input: "fixture-deny" }),
      });
      const { run_id: deniedRunId } = (await deniedRun.json()) as { run_id: string };
      const denied = await fetch(`${fixture.baseUrl}/v1/runs/${deniedRunId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice: "deny" }),
      });
      expect(denied.status).toBe(204);
      expect(fixture.dangerousEffectCount).toBe(1);
    } finally {
      fixture.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});
