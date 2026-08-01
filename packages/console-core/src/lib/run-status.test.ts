import { describe, expect, test } from "bun:test";
import {
  ARTIFACT_DELIVERY_ERROR_PREFIX,
  artifactDeliveryFailureMessage,
  runStatusStyle,
} from "./run-status";

describe("run delivery presentation", () => {
  const deliveryError =
    `${ARTIFACT_DELIVERY_ERROR_PREFIX}Mission run_1 : ` +
    "Hermes a terminé, mais la livraison a échoué.";

  test("distinguishes completed runtime from failed artifact delivery", () => {
    expect(runStatusStyle("completed", deliveryError)).toMatchObject({
      label: "Exécution terminée · livraison échouée",
      terminal: true,
      live: false,
    });
    expect(artifactDeliveryFailureMessage(deliveryError)).toContain(
      "Hermes a terminé",
    );
  });

  test("keeps an ordinary completed run positive", () => {
    expect(runStatusStyle("completed", null).label).toBe("Terminée");
    expect(artifactDeliveryFailureMessage("Erreur Hermes")).toBeNull();
  });
});
