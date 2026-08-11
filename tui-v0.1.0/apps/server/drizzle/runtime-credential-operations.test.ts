import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(import.meta.dir, "0032_runtime_credential_operations.sql"),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

describe("runtime credential operations migration", () => {
  test("stores only encrypted candidates and non-secret operation metadata", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "management_mode"');
    expect(migration).toContain('"candidate_encrypted_token" text');
    expect(migration).toContain('"confirmation_hash" text NOT NULL');
    expect(migration).not.toMatch(/API_SERVER_KEY|HERMES_RUNTIME_TOKEN|ssh_password/i);
  });

  test("allows one active operation and retains recovery states", () => {
    expect(migration).toContain('"runtime_credential_operations_active_idx"');
    expect(migration).toContain("'recovery_required'");
    expect(
      journal.entries.some(({ idx, tag }) =>
        idx === 32 && tag === "0032_runtime_credential_operations",
      ),
    ).toBe(true);
  });
});
