import { describe, expect, test } from "bun:test";
import { contextUsage, contextWindowFor, resolveContextModel } from "./context-window";

/**
 * Les valeurs viennent des documentations éditeurs (relevé juillet 2026), pas
 * d'une estimation : Anthropic 1 M sur la génération courante et 200 K sur
 * Haiku 4.5 et les générations antérieures, OpenAI 1,05 M sur la famille GPT-5,
 * Nous Research 131 072 sur Hermes 4.
 */
describe("contextWindowFor — Anthropic", () => {
  test("la génération courante est à 1 M", () => {
    expect(contextWindowFor("claude-opus-5")).toBe(1_000_000);
    expect(contextWindowFor("claude-sonnet-5")).toBe(1_000_000);
    expect(contextWindowFor("claude-fable-5")).toBe(1_000_000);
    expect(contextWindowFor("claude-opus-4-8")).toBe(1_000_000);
    expect(contextWindowFor("claude-opus-4-6")).toBe(1_000_000);
    expect(contextWindowFor("claude-sonnet-4-6")).toBe(1_000_000);
  });

  test("Haiku 4.5 et les générations antérieures restent à 200 K", () => {
    expect(contextWindowFor("claude-haiku-4-5")).toBe(200_000);
    expect(contextWindowFor("claude-opus-4-5")).toBe(200_000);
    expect(contextWindowFor("claude-opus-4-1")).toBe(200_000);
    expect(contextWindowFor("claude-sonnet-4-5")).toBe(200_000);
    expect(contextWindowFor("claude-3-5-haiku-20241022")).toBe(200_000);
  });

  test("une variante à contexte étendu prime sur sa famille", () => {
    expect(contextWindowFor("claude-opus-5[1m]")).toBe(1_000_000);
    expect(contextWindowFor("claude-haiku-4-5[1m]")).toBe(1_000_000);
  });
});

describe("contextWindowFor — OpenAI et Nous Research", () => {
  test("toute la famille GPT-5 partage 1,05 M", () => {
    expect(contextWindowFor("gpt-5.6-sol")).toBe(1_050_000);
    expect(contextWindowFor("gpt-5.6-terra")).toBe(1_050_000);
    expect(contextWindowFor("gpt-5.6-luna")).toBe(1_050_000);
    expect(contextWindowFor("gpt-5.4")).toBe(1_050_000);
    expect(contextWindowFor("gpt-5.4-nano")).toBe(1_050_000);
  });

  test("Hermes 4 est le modèle, pas l’agent", () => {
    expect(contextWindowFor("hermes-4-405b")).toBe(131_072);
    expect(contextWindowFor("hermes-4-70b")).toBe(131_072);
  });
});

describe("contextWindowFor — ce qui n’est pas un modèle", () => {
  test("`hermes-agent` est le runtime, pas un LLM : aucune fenêtre", () => {
    // C'est le piège du catalogue Hermes : l'agent tourne sous un fournisseur
    // (`openai-api`, `anthropic`, …) dont le modèle fixe la vraie fenêtre.
    expect(contextWindowFor("hermes-agent")).toBeNull();
  });

  test("les agrégateurs virtuels du catalogue n’en ont pas non plus", () => {
    expect(contextWindowFor("default")).toBeNull();
    expect(contextWindowFor("moa/default")).toBeNull();
  });

  test("un modèle inconnu ne reçoit pas de valeur par défaut", () => {
    // Inventer 128k ici afficherait un pourcentage faux avec l'aplomb d'un vrai.
    expect(contextWindowFor("llama-3.1-70b")).toBeNull();
    expect(contextWindowFor("")).toBeNull();
    expect(contextWindowFor(null)).toBeNull();
    expect(contextWindowFor(undefined)).toBeNull();
  });
});

describe("resolveContextModel", () => {
  test("retient le premier candidat dont la fenêtre est connue", () => {
    expect(resolveContextModel(["hermes-agent", "gpt-5.4-nano"])).toBe("gpt-5.4-nano");
    expect(resolveContextModel(["claude-opus-5", "gpt-5.4-nano"])).toBe("claude-opus-5");
  });

  test("ignore les vides et les alias, et rend null si rien ne s’identifie", () => {
    expect(resolveContextModel([null, "", "  ", "hermes-agent"])).toBeNull();
    expect(resolveContextModel([])).toBeNull();
    expect(resolveContextModel([undefined, "  claude-sonnet-5  "])).toBe("claude-sonnet-5");
  });
});

describe("contextUsage", () => {
  test("rapporte le cumul à la fenêtre du modèle", () => {
    const usage = contextUsage(272_630, "gpt-5.4-nano");
    expect(usage).toMatchObject({
      used: 272_630,
      window: 1_050_000,
      usedPercent: 25,
      remainingPercent: 75,
      exceeded: false,
      critical: false,
    });
  });

  test("arrondit vers le bas : on n’annonce jamais plus consommé que mesuré", () => {
    expect(contextUsage(19_999, "hermes-4-70b")?.usedPercent).toBe(15);
  });

  test("passe en critique avant d’être plein", () => {
    expect(contextUsage(849_999, "claude-sonnet-5")?.critical).toBe(false);
    expect(contextUsage(850_000, "claude-sonnet-5")?.critical).toBe(true);
  });

  test("un cumul au-delà de la fenêtre borne l’anneau au lieu de le faire déborder", () => {
    const usage = contextUsage(250_000, "claude-haiku-4-5");
    expect(usage?.ratio).toBe(1);
    expect(usage?.usedPercent).toBe(100);
    expect(usage?.remainingPercent).toBe(0);
    expect(usage?.exceeded).toBe(true);
  });

  test("rien à afficher sans fenêtre connue ni mesure exploitable", () => {
    expect(contextUsage(1_000, "hermes-agent")).toBeNull();
    expect(contextUsage(null, "claude-sonnet-5")).toBeNull();
    expect(contextUsage(-5, "claude-sonnet-5")).toBeNull();
    expect(contextUsage(Number.NaN, "claude-sonnet-5")).toBeNull();
  });

  test("zéro token est une réponse, pas une absence", () => {
    expect(contextUsage(0, "claude-sonnet-5")).toMatchObject({
      usedPercent: 0,
      remainingPercent: 100,
    });
  });
});
