import { describe, expect, test } from "bun:test";
import { ARTIFACT_DELIVERY_ERROR_PREFIX } from "@console/core/lib/run-status";
import {
  dashboardMissionStatusStyle,
  matchesTab,
  type MissionRow,
} from "./missions-data-table";

describe("dashboard mission delivery status", () => {
  test("renders delivery failure as danger without rewriting runtime status", () => {
    const mission = {
      status: "completed" as const,
      error: `${ARTIFACT_DELIVERY_ERROR_PREFIX}quota dépassé`,
    };
    expect(mission.status).toBe("completed");
    expect(dashboardMissionStatusStyle(mission)).toMatchObject({
      label: "Exécution terminée · livraison échouée",
      badge: "bg-neg-100 text-neg-700",
      glyph: "!",
    });
  });

  test("adds a delivery lens without rewriting completed runtime semantics", () => {
    const mission = {
      status: "completed",
      error: `${ARTIFACT_DELIVERY_ERROR_PREFIX}quota dépassé`,
    } as MissionRow;

    expect(matchesTab(mission, "delivery_failed")).toBe(true);
    expect(matchesTab(mission, "done")).toBe(true);
    expect(matchesTab(mission, "failed")).toBe(false);
  });
});
