import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(import.meta.dir, "0028_approval_requests.sql"), "utf8");

describe("US-G1-004C-local approval request migration", () => {
  test("persists full scope, nonce, TTL, outcome and claim state", () => {
    for (const column of [
      '"site_id"',
      '"run_id"',
      '"hermes_run_id"',
      '"approval_request_id"',
      '"nonce"',
      '"expires_at"',
      '"claim_state"',
      '"outcome"',
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("approval_requests_site_run_fk");
    expect(migration).toContain("approval_requests_scope_idx");
    expect(migration).toContain("approval_requests_nonce_idx");
  });

  test("encodes single-use state transitions without remote execution", () => {
    expect(migration).toContain("'pending', 'claimed', 'resolved', 'expired'");
    expect(migration).toContain("'once', 'deny'");
    const sql = migration.toLowerCase();
    expect(sql).not.toMatch(/\b(fetch|curl|ssh|https?):\/\//);
    expect(sql).not.toMatch(/(?:^|\n)\s*(?:insert\s+into|update\s+[\"`]?\w|delete\s+from)\b/m);
  });
});
