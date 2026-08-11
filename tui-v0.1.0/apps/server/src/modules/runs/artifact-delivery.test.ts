import { describe, expect, mock, test } from "bun:test";
import { finalizeRunArtifactDelivery } from "./repository";

describe("finalizeRunArtifactDelivery", () => {
  test("keeps runtime completion distinct from a correlated delivery failure", async () => {
    const scan = mock(async () => {
      throw new Error("répertoire de sortie illisible");
    });
    const result = await finalizeRunArtifactDelivery({ siteId: "paris" }, "run_delivery", {
      scan,
    });

    expect(result).toMatchObject({ ok: false, operation: "scan_outputs" });
    if (result.ok) throw new Error("Échec de livraison attendu.");
    expect(result.message).toContain("Mission run_delivery");
    expect(result.message).toContain("Hermes a terminé");
    expect(scan).toHaveBeenCalledTimes(1);
  });

  test("reports a delivered result once the outputs are scanned", async () => {
    const order: string[] = [];
    const result = await finalizeRunArtifactDelivery({ siteId: "paris" }, "run_ok", {
      scan: async () => {
        order.push("scan");
      },
    });

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["scan"]);
  });
});
