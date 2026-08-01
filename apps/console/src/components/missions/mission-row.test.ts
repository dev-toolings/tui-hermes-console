import { describe, expect, test } from "bun:test";
import { ARTIFACT_DELIVERY_ERROR_PREFIX } from "@console/core/lib/run-status";
import type { ThreadListItemDto } from "@console/core/modules/runs/types";
import { missionStatusStyle, toMissionRows } from "./mission-row";

describe("mission list delivery status", () => {
  test("preserves a completed runtime while exposing failed delivery", () => {
    const thread = {
      id: "thr_1",
      title: "Rapport",
      agentName: "Hermes",
      updatedAt: "2026-08-01T10:00:00.000Z",
      latestRun: {
        id: "run_1",
        status: "completed",
        error: `${ARTIFACT_DELIVERY_ERROR_PREFIX}SFTP indisponible`,
        startedAt: "2026-08-01T09:59:00.000Z",
        endedAt: "2026-08-01T10:00:00.000Z",
        usage: null,
      },
    } as ThreadListItemDto;

    const [row] = toMissionRows([thread]);
    expect(row?.status).toBe("completed");
    expect(missionStatusStyle(row!)).toMatchObject({
      label: "Exécution terminée · livraison échouée",
      badge: "bg-neg-100 text-neg-700",
      glyph: "!",
    });
  });
});
