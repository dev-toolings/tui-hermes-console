import { describe, expect, test } from "bun:test";
import { ARTIFACT_DELIVERY_ERROR_PREFIX } from "@console/core/lib/run-status";
import type { MissionRow } from "./mission-row";
import { matchesFilter } from "./missions-table";

describe("missions table delivery filter", () => {
  test("filters failed delivery independently from runtime failure", () => {
    const row = {
      status: "completed",
      error: `${ARTIFACT_DELIVERY_ERROR_PREFIX}SFTP indisponible`,
    } as MissionRow;

    expect(matchesFilter(row, "delivery_failed")).toBe(true);
    expect(matchesFilter(row, "completed")).toBe(true);
    expect(matchesFilter(row, "failed")).toBe(false);
  });
});
