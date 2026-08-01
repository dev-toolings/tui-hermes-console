import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(import.meta.dir, "0025_data_lifecycle_preview.sql"), "utf8");

describe("data lifecycle preview migration", () => {
  test("creates only policy and persisted dry-run evidence", () => {
    expect(migration).toContain('site_data_lifecycle_policies');
    expect(migration).toContain('data_lifecycle_previews');
    expect(migration).toContain('data_lifecycle_preview_items');
    expect(migration).toContain('site_data_lifecycle_policy_author_fk');
    expect(migration).toContain('data_lifecycle_preview_items_preview_site_fk');
    expect(migration.toLowerCase()).not.toMatch(/\bdelete\s+(from|where)\b|\brm\b|hermes/);
  });
});
