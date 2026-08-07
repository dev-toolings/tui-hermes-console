export type GuidedTaskIntent =
  | "bug"
  | "feature"
  | "behavior"
  | "automation"
  | "understand"
  | "quality";

export type GuidedTaskDraft = {
  intent: GuidedTaskIntent | null;
  objective: string;
  audience: string;
  expectedResult: string;
  exclusions: string;
  example: string;
  touchesAuthentication: boolean;
  deletesData: boolean;
  allowsDependencies: boolean;
  changesDatabase: boolean;
  touchesPayments: boolean;
  touchesInfrastructure: boolean;
};

export type GuidedDecisionKind = "plan" | "technical" | "tool" | "functional";

/**
 * L'API Hermes actuelle ne reçoit aucun cwd par run. Le workdir de la Console
 * ne borne que les artefacts ; il ne constitue donc pas une sandbox de code.
 * Cette capacité reste fail-closed jusqu'à l'introduction d'une isolation
 * réellement vérifiable par tentative.
 */
export const GUIDED_EXECUTION_ISOLATED = false;

export const GUIDED_TASK_INTENTS: ReadonlyArray<{
  id: GuidedTaskIntent;
  label: string;
  description: string;
  objectiveLabel: string;
  objectivePlaceholder: string;
}> = [
  {
    id: "bug",
    label: "Corriger un problème",
    description: "Un comportement observé ne correspond pas au résultat attendu.",
    objectiveLabel: "Que s’est-il passé ?",
    objectivePlaceholder: "Quand un client annule sa commande, aucun email n’est envoyé…",
  },
  {
    id: "feature",
    label: "Ajouter une fonctionnalité",
    description: "Un nouveau résultat doit devenir possible pour un utilisateur.",
    objectiveLabel: "Que voulez-vous rendre possible ?",
    objectivePlaceholder: "Je veux qu’un client reçoive automatiquement un email après une annulation…",
  },
  {
    id: "behavior",
    label: "Modifier un comportement",
    description: "Une règle existante doit fonctionner différemment.",
    objectiveLabel: "Quel comportement doit changer ?",
    objectivePlaceholder: "Les commandes annulées par un administrateur doivent suivre la même règle…",
  },
  {
    id: "automation",
    label: "Automatiser une tâche",
    description: "Une action répétitive doit être déclenchée sans intervention manuelle.",
    objectiveLabel: "Quelle tâche doit devenir automatique ?",
    objectivePlaceholder: "Chaque soir, préparer la liste des commandes en attente…",
  },
  {
    id: "understand",
    label: "Comprendre le projet",
    description: "Obtenir une réponse vérifiable sur le fonctionnement actuel.",
    objectiveLabel: "Que voulez-vous comprendre ?",
    objectivePlaceholder: "Je veux comprendre comment les remboursements sont calculés…",
  },
  {
    id: "quality",
    label: "Vérifier la qualité",
    description: "Contrôler un parcours, un risque ou une promesse du produit.",
    objectiveLabel: "Que faut-il vérifier ?",
    objectivePlaceholder: "Vérifier que l’annulation ne déclenche jamais deux remboursements…",
  },
];

export function guidedIntent(intent: GuidedTaskIntent | null) {
  return GUIDED_TASK_INTENTS.find((item) => item.id === intent) ?? null;
}

export function isGuidedDraftReady(draft: GuidedTaskDraft) {
  return Boolean(
    draft.intent &&
      draft.objective.trim().length >= 12 &&
      draft.expectedResult.trim().length >= 8 &&
      draft.exclusions.trim().length >= 3,
  );
}

export function guidedUnderstanding(draft: GuidedTaskDraft) {
  const intent = guidedIntent(draft.intent);
  if (!intent) return [];
  return [
    `${intent.label} : ${sentence(draft.objective)}`,
    `Résultat attendu : ${sentence(draft.expectedResult)}`,
    `Hors périmètre : ${sentence(draft.exclusions)}`,
  ];
}

export function guidedPlan(draft: GuidedTaskDraft) {
  switch (draft.intent) {
    case "understand":
      return [
        "Identifier le comportement et les sources concernées",
        "Recouper les faits avec des preuves vérifiables",
        "Expliquer le fonctionnement et ses limites",
        "Présenter les points qui restent incertains",
      ];
    case "quality":
      return [
        "Définir les scénarios observables à vérifier",
        "Examiner le comportement actuel",
        "Exécuter des vérifications positives et négatives",
        "Présenter les résultats et les écarts constatés",
      ];
    default:
      return [
        "Observer le comportement actuel",
        "Localiser la modification la plus limitée",
        "Réaliser le changement validé",
        "Vérifier le résultat et l’absence de régression",
      ];
  }
}

export function guidedRisk(draft: GuidedTaskDraft): "faible" | "modéré" | "élevé" {
  if (
    draft.deletesData ||
    draft.touchesAuthentication ||
    draft.changesDatabase ||
    draft.touchesPayments ||
    draft.touchesInfrastructure
  ) return "élevé";
  if (draft.allowsDependencies) return "modéré";
  return "faible";
}

export function guidedTechnicalApprovalRequired(
  boundaries: Pick<
    GuidedTaskDraft,
    | "touchesAuthentication"
    | "deletesData"
    | "allowsDependencies"
    | "changesDatabase"
    | "touchesPayments"
    | "touchesInfrastructure"
  >,
) {
  return (
    boundaries.touchesAuthentication ||
    boundaries.deletesData ||
    boundaries.allowsDependencies ||
    boundaries.changesDatabase ||
    boundaries.touchesPayments ||
    boundaries.touchesInfrastructure
  );
}

export function guidedRequiredDecisionKinds(
  boundaries: Parameters<typeof guidedTechnicalApprovalRequired>[0],
): GuidedDecisionKind[] {
  return guidedTechnicalApprovalRequired(boundaries)
    ? ["plan", "technical", "tool", "functional"]
    : ["plan", "tool", "functional"];
}

export function buildGuidedDeliveryPrompt(draft: GuidedTaskDraft) {
  const intent = guidedIntent(draft.intent);
  if (!intent || !isGuidedDraftReady(draft)) {
    throw new Error("La demande guidée est incomplète.");
  }

  const plan = guidedPlan(draft);
  return [
    "# Demande validée",
    "",
    `## Intention\n${intent.label}`,
    `## Objectif\n${draft.objective.trim()}`,
    `## Utilisateur concerné\n${draft.audience.trim() || "Non précisé"}`,
    `## Résultat attendu\n${draft.expectedResult.trim()}`,
    `## Hors périmètre\n${draft.exclusions.trim()}`,
    `## Exemple\n${draft.example.trim() || "Aucun exemple fourni"}`,
    "## Contraintes sensibles",
    `- Authentification ou permissions : ${draft.touchesAuthentication ? "oui, validation technique requise" : "non signalé"}`,
    `- Suppression de données : ${draft.deletesData ? "oui, validation technique requise" : "non autorisée"}`,
    `- Nouvelle dépendance : ${draft.allowsDependencies ? "autorisée si justifiée" : "non autorisée"}`,
    `- Migration de données : ${draft.changesDatabase ? "oui, validation technique requise" : "non signalée"}`,
    `- Paiement : ${draft.touchesPayments ? "oui, validation technique requise" : "non signalé"}`,
    `- Infrastructure : ${draft.touchesInfrastructure ? "oui, validation technique requise" : "non signalée"}`,
    "",
    "## Plan validé",
    ...plan.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Contrat de livraison",
    "Travaille uniquement dans ce périmètre. Commence par vérifier les hypothèses dans le projet réel. " +
      "Réalise la modification ou l’analyse demandée, exécute les vérifications pertinentes, puis rends un résultat compréhensible avec les preuves obtenues. " +
      "N’élargis pas le périmètre sans demander une validation.",
  ].join("\n\n");
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "non précisé";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
