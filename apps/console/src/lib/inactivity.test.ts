import { describe, expect, test } from "bun:test";
import { formatInactivityLabel } from "./inactivity";

describe("formatInactivityLabel", () => {
  test("null avant le seuil", () => {
    const now = Date.parse("2026-01-01T00:00:20.000Z");
    expect(
      formatInactivityLabel("2026-01-01T00:00:10.000Z", now),
    ).toBeNull();
  });

  test("label après 15 s", () => {
    const now = Date.parse("2026-01-01T00:00:30.000Z");
    expect(formatInactivityLabel("2026-01-01T00:00:10.000Z", now)).toBe(
      "Inactif depuis 20.0 s",
    );
  });
});
