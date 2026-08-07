import { describe, expect, test } from "bun:test";
import {
  buildGuidedDeliveryPrompt,
  guidedPlan,
  guidedRisk,
  guidedRequiredDecisionKinds,
  guidedTechnicalApprovalRequired,
  guidedUnderstanding,
  isGuidedDraftReady,
  type GuidedTaskDraft,
} from "./spec";

const draft = (overrides: Partial<GuidedTaskDraft> = {}): GuidedTaskDraft => ({
  intent: "feature",
  objective: "Envoyer un email après une annulation réussie",
  audience: "Client de la boutique",
  expectedResult: "Un seul email contient le numéro de commande",
  exclusions: "Ne pas modifier les remboursements",
  example: "Commande ACME-42 annulée depuis le compte client",
  touchesAuthentication: false,
  deletesData: false,
  allowsDependencies: false,
  changesDatabase: false,
  touchesPayments: false,
  touchesInfrastructure: false,
  ...overrides,
});

describe("guided software delivery spec", () => {
  test("refuses an incomplete request before execution", () => {
    const incomplete = draft({ expectedResult: "" });
    expect(isGuidedDraftReady(incomplete)).toBe(false);
    expect(() => buildGuidedDeliveryPrompt(incomplete)).toThrow("incomplète");
  });

  test("builds an explicit understanding and bounded plan", () => {
    expect(guidedUnderstanding(draft())).toEqual([
      "Ajouter une fonctionnalité : Envoyer un email après une annulation réussie.",
      "Résultat attendu : Un seul email contient le numéro de commande.",
      "Hors périmètre : Ne pas modifier les remboursements.",
    ]);
    expect(guidedPlan(draft())).toHaveLength(4);
  });

  test("raises the visible risk for technical approval boundaries", () => {
    expect(guidedRisk(draft())).toBe("faible");
    expect(guidedRisk(draft({ allowsDependencies: true }))).toBe("modéré");
    expect(guidedRisk(draft({ touchesAuthentication: true }))).toBe("élevé");
    expect(guidedRisk(draft({ deletesData: true }))).toBe("élevé");
    expect(guidedTechnicalApprovalRequired(draft())).toBe(false);
    expect(guidedTechnicalApprovalRequired(draft({ touchesAuthentication: true }))).toBe(true);
    expect(guidedTechnicalApprovalRequired(draft({ deletesData: true }))).toBe(true);
  });

  test("requires distinct technical and tool decisions for every sensitive boundary", () => {
    for (const boundary of [
      "touchesAuthentication",
      "deletesData",
      "allowsDependencies",
      "changesDatabase",
      "touchesPayments",
      "touchesInfrastructure",
    ] as const) {
      const sensitive = draft({ [boundary]: true });
      expect(guidedTechnicalApprovalRequired(sensitive)).toBe(true);
      expect(guidedRequiredDecisionKinds(sensitive)).toEqual([
        "plan",
        "technical",
        "tool",
        "functional",
      ]);
    }

    expect(guidedRequiredDecisionKinds(draft())).toEqual([
      "plan",
      "tool",
      "functional",
    ]);
  });

  test("serializes the validated scope and sensitive constraints", () => {
    const prompt = buildGuidedDeliveryPrompt(draft());
    expect(prompt).toContain("# Demande validée");
    expect(prompt).toContain("## Hors périmètre\nNe pas modifier les remboursements");
    expect(prompt).toContain("Suppression de données : non autorisée");
    expect(prompt).toContain("Nouvelle dépendance : non autorisée");
    expect(prompt).toContain("Migration de données : non signalée");
    expect(prompt).toContain("Paiement : non signalé");
    expect(prompt).toContain("Infrastructure : non signalée");
    expect(prompt).toContain("N’élargis pas le périmètre");
  });
});
