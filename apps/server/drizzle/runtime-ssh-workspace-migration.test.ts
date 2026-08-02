import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(import.meta.dir, "0030_runtime_ssh_workspace.sql"),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

describe("runtime SSH workspace migration", () => {
  test("adds the two-path contract and leaves legacy Hermes paths unproven", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "remote_hermes_workdir"');
    expect(migration).toContain("'verification_required'");
    expect(migration).not.toMatch(/remote_hermes_workdir"\s*=\s*[^;]*remote_workdir/i);
  });

  test("is registered after the identity repair migration", () => {
    expect(journal.entries.at(-1)).toEqual({
      idx: 30,
      version: "7",
      when: 1785744000000,
      tag: "0030_runtime_ssh_workspace",
      breakpoints: true,
    });
  });
});
