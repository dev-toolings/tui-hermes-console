// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { expect, test } from "bun:test";
import { MAX_FILE_NAME_CHARS, truncateFileName } from "./file-name";

test("leaves a short name alone", () => {
  expect(truncateFileName("rapport.pdf")).toBe("rapport.pdf");
});

test("never exceeds the cap", () => {
  const long =
    "compte-rendu-audit-parcours-mobile-hermes-console-version-finale.pdf";
  expect(truncateFileName(long).length).toBe(MAX_FILE_NAME_CHARS);
});

test("keeps the extension so the chip stays identifiable", () => {
  const long =
    "compte-rendu-audit-parcours-mobile-hermes-console-version-finale.pdf";
  expect(truncateFileName(long).endsWith(".pdf")).toBe(true);
  expect(truncateFileName(long)).toBe("compte-rendu-au….pdf");
});

test("truncates a long extensionless name to the cap", () => {
  const result = truncateFileName("captures-avant-apres-du-parcours-mobile");
  expect(result).toBe("captures-avant-apre…");
  expect(result.length).toBe(MAX_FILE_NAME_CHARS);
});

test("keeps a trailing dot group that is not an extension as part of the name", () => {
  const result = truncateFileName("archive-des-captures.2026-08-11-finale");
  expect(result.length).toBe(MAX_FILE_NAME_CHARS);
  expect(result.endsWith("…")).toBe(true);
});
