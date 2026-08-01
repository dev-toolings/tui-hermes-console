import { describe, expect, mock, test } from "bun:test";
import { RemoteSyncError } from "@/modules/artifacts/remote-sync";
import { finalizeRunArtifactDelivery } from "./repository";

describe("finalizeRunArtifactDelivery", () => {
  test("keeps runtime completion distinct from a correlated delivery failure", async () => {
    const scan = mock(async () => []);
    const result = await finalizeRunArtifactDelivery({ siteId: "paris" }, "run_delivery", {
      pull: async () => {
        throw new RemoteSyncError(
          "run_delivery",
          "download_output",
          "échec explicite du transport",
        );
      },
      scan,
    });

    expect(result).toMatchObject({
      ok: false,
      operation: "download_output",
    });
    if (result.ok) throw new Error("Échec de livraison attendu.");
    expect(result.message).toContain("Mission run_delivery");
    expect(result.message).toContain("Hermes a terminé");
    expect(scan).not.toHaveBeenCalled();
  });

  test("pulls before scanning and reports a delivered result", async () => {
    const order: string[] = [];
    const result = await finalizeRunArtifactDelivery({ siteId: "paris" }, "run_ok", {
      pull: async () => {
        order.push("pull");
      },
      scan: async () => {
        order.push("scan");
      },
    });

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["pull", "scan"]);
  });
});
