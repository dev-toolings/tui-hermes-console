import { describe, expect, test } from "bun:test";
import { HermesEventNormalizer } from "./hermes-events";

/**
 * `run_events` porte UNIQUE(run_id, sequence). Un normaliseur qui repart de 0
 * sur une mission ayant déjà des événements fait échouer l'insertion, donc la
 * transition d'état qui suit — le run reste `running` à vie (PRD §29).
 */
describe("HermesEventNormalizer — continuité de la séquence", () => {
  test("démarre à 0 par défaut", () => {
    const normalizer = new HermesEventNormalizer();
    expect(normalizer.error("boom").sequence).toBe(0);
    expect(normalizer.error("encore").sequence).toBe(1);
  });

  test("reprend la série existante quand on lui donne un point de départ", () => {
    // MAX(sequence) = 6 en base → le prochain libre est 7.
    const normalizer = new HermesEventNormalizer(7);
    expect(normalizer.error("reprise").sequence).toBe(7);
    expect(normalizer.notice("annulée", "cancelled").sequence).toBe(8);
  });

  test("ne réutilise jamais une séquence déjà émise", () => {
    const normalizer = new HermesEventNormalizer(3);
    const seen = [
      normalizer.error("a").sequence,
      normalizer.notice("b", "cancelled").sequence,
      normalizer.error("c").sequence,
    ];
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual([3, 4, 5]);
  });
});
