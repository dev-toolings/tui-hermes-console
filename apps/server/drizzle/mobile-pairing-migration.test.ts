import { describe, expect, test } from "bun:test";

const migration = await Bun.file(
  new URL("./0038_mobile_pairing.sql", import.meta.url),
).text();

describe("0038 mobile pairing migration", () => {
  test("creates a one-use pairing store bound to identity and site", () => {
    expect(migration).toContain('CREATE TABLE "console_mobile_pairings"');
    expect(migration).toContain('"code_hash" text PRIMARY KEY');
    expect(migration).toContain('REFERENCES "console_users"("id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "site_memberships"("user_id", "site_id") ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES "msp_mandates"("site_id", "id") ON DELETE SET NULL');
    expect(migration).toContain('"expires_at" timestamp with time zone NOT NULL');
  });
});
