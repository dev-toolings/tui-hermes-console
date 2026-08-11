import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(import.meta.dir, "0033_runtime_secret_reveal_challenges.sql"),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

describe("runtime secret reveal migration", () => {
  test("stores only an expiring OTP digest and challenge metadata", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "runtime_secret_reveal_challenges"');
    expect(migration).toContain('"otp_digest" text NOT NULL');
    expect(migration).toContain('"consumed_at" timestamp with time zone');
    expect(migration).not.toMatch(/encrypted_token|secret_value|token_value|plaintext/i);
  });

  test("is registered after the credential operation migration", () => {
    expect(
      journal.entries.some(({ idx, tag }) =>
        idx === 33 && tag === "0033_runtime_secret_reveal_challenges",
      ),
    ).toBe(true);
  });
});
