import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(import.meta.dir, "0031_runtime_storage_migrations.sql"),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

describe("runtime storage migration journal", () => {
  test("persists progress without storing runtime secrets", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "runtime_storage_migrations"');
    expect(migration).toContain('"source_snapshot" jsonb NOT NULL');
    expect(migration).toContain('"confirmation_hash" text NOT NULL');
    expect(migration).not.toMatch(/api_server_key|encrypted_token|ssh_password/i);
  });

  test("allows only one unfinished migration per runtime", () => {
    expect(migration).toContain('"runtime_storage_migrations_active_idx"');
    expect(migration).toContain("'recovery_required'");
    expect(
      journal.entries.some(({ idx, tag }) =>
        idx === 31 && tag === "0031_runtime_storage_migrations",
      ),
    ).toBe(true);
  });
});
