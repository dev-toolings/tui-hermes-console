import { describe, expect, test } from "bun:test";
import { HermesEventNormalizer, type HermesEvent } from "./hermes-events";

/**
 * Le cycle d'autorisation, tel que le runtime l'émet réellement (mesuré sur
 * Hermes 0.19.0) : `approval.request` porte les `choices`, et la décision revient
 * en `approval.responded { choice, resolved }`.
 */
function event(partial: Partial<HermesEvent> & { event: string }): HermesEvent {
  return { run_id: "run_x", timestamp: 1785504012.34, ...partial };
}

describe("normalisation d’approval.responded", () => {
  test("une décision connue devient un événement produit typé", () => {
    const normalizer = new HermesEventNormalizer();
    const [produced] = normalizer.push(
      event({ event: "approval.responded", choice: "once", resolved: 1 }),
    );

    expect(produced?.type).toBe("approval.responded");
    expect(produced?.payload).toEqual({ choice: "once", resolved: 1 });
  });

  test("les quatre choix du runtime sont reconnus", () => {
    for (const choice of ["once", "session", "always", "deny"]) {
      const [produced] = new HermesEventNormalizer().push(
        event({ event: "approval.responded", choice }),
      );
      expect(produced?.type).toBe("approval.responded");
      expect(produced?.payload.choice).toBe(choice);
      // `resolved` est optionnel côté runtime : son absence ne doit pas être
      // maquillée en 0, qui se lirait comme « non résolu ».
      expect(produced?.payload.resolved).toBeNull();
    }
  });

  test("un choix hors vocabulaire reste brut plutôt que d’être raconté", () => {
    const [produced] = new HermesEventNormalizer().push(
      event({ event: "approval.responded", choice: "yolo" }),
    );
    expect(produced?.type).toBe("raw");
  });

  test("une décision sans choix reste brute", () => {
    const [produced] = new HermesEventNormalizer().push(
      event({ event: "approval.responded", resolved: 1 }),
    );
    expect(produced?.type).toBe("raw");
  });

  test("le cycle complet garde une séquence monotone", () => {
    const normalizer = new HermesEventNormalizer();
    const produced = [
      ...normalizer.push(
        event({ event: "approval.request", command: "curl | python3", choices: ["once", "deny"] }),
      ),
      ...normalizer.push(event({ event: "approval.responded", choice: "once", resolved: 1 })),
    ];

    expect(produced.map((item) => item.type)).toEqual([
      "approval.requested",
      "approval.responded",
    ]);
    expect(produced.map((item) => item.sequence)).toEqual([0, 1]);
  });
});
