import { describe, expect, test } from "bun:test";

const migration = await Bun.file(
  new URL("./0039_artifact_deletion.sql", import.meta.url),
).text();

describe("0039 artifact deletion migration", () => {
  test("ajoute uniquement le tombstone de suppression aux artefacts", () => {
    expect(migration.trim()).toBe(
      'ALTER TABLE "artifacts" ADD COLUMN "deleted_at" timestamp with time zone;',
    );
  });
});
