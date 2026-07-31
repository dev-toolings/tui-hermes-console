import { describe, expect, test } from "bun:test";
import { RUN_STATUS, type RunStatus } from "@console/core/lib/run-status";
import { LANES, dropAction, laneOf, type LaneId } from "./kanban-columns";

const ALL_STATUSES = Object.keys(RUN_STATUS) as RunStatus[];

describe("laneOf", () => {
  test("range chaque statut dans une voie, et une seule", () => {
    for (const status of ALL_STATUSES) {
      const owners = LANES.filter((lane) => lane.statuses.includes(status));
      expect(owners).toHaveLength(1);
      expect(laneOf(status)).toBe(owners[0]!.id);
    }
  });
});

describe("dropAction", () => {
  /**
   * La table de vérité complète : sept statuts × cinq colonnes. Elle est écrite
   * à la main plutôt que dérivée de `dropAction`, sinon elle ne testerait rien.
   */
  const EXPECTED: Record<RunStatus, Partial<Record<LaneId, "cancel" | "retry">>> = {
    pending: { failed: "cancel" },
    starting: { failed: "cancel" },
    running: { failed: "cancel" },
    awaiting_approval: { failed: "cancel" },
    completed: { todo: "retry", running: "retry" },
    failed: { todo: "retry", running: "retry" },
    cancelled: { todo: "retry", running: "retry" },
  };

  for (const status of ALL_STATUSES) {
    test(`${status} n'autorise que les dépôts attendus`, () => {
      for (const lane of LANES) {
        expect(dropAction(status, lane.id)).toBe(EXPECTED[status][lane.id] ?? null);
      }
    });
  }

  test("aucune mission ne peut être relancée là où elle est déjà", () => {
    expect(dropAction("running", "running")).toBeNull();
    expect(dropAction("completed", "done")).toBeNull();
    expect(dropAction("cancelled", "failed")).toBeNull();
  });
});
