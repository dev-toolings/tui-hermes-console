import type { Mission, MissionEvent } from "./mission-events";
import type { TrainingDecision, TrainingProgress } from "./labs-store";

/**
 * Scripted training mission for the « Terrain d'entraînement » experiment.
 *
 * The scenario teaches the one gesture the console is built around: reading a
 * gate by its blast radius, not by its title. It contains a safe gate the
 * trainee must approve, then a trap gate — harmless title, production scope —
 * they must refuse. Each segment of the timeline is revealed only after the
 * previous gate received the expected decision, so the trap cannot be skipped.
 */

const BASE = Date.parse("2026-08-12T08:30:00.000Z");
const at = (minutes: number, seconds = 0) =>
  new Date(BASE + minutes * 60_000 + seconds * 1_000).toISOString();

export const TRAINING_MISSION: Mission = {
  id: "training-cache",
  name: "Mission d'entraînement : cache catalogue",
  intent:
    "Corriger l'invalidation du cache de l'API catalogue et vérifier le correctif en staging. La production n'est pas dans le périmètre.",
  status: "waiting",
  agent: "agent-cadet",
  channelId: null,
  startedAt: at(0),
};

export const STAGING_GATE_ID = "tr-gate-staging";
export const PURGE_GATE_ID = "tr-gate-purge";

/** Graduation contract: every gate decided, and decided this way. */
export const EXPECTED_DECISIONS: Record<string, TrainingDecision> = {
  [STAGING_GATE_ID]: "approved",
  [PURGE_GATE_ID]: "refused",
};

const TOOL_STEPS = [
  ["lecture", "src/cache/invalidation.ts"],
  ["recherche", "grep -rn ttl src/cache"],
  ["lecture", "src/catalog/api.ts"],
  ["exécution", "bun test cache"],
  ["lecture", "src/cache/store.ts"],
] as const;

const agentTraces: MissionEvent[] = Array.from({ length: 10 }, (_, index) => {
  const [label, value] = TOOL_STEPS[index % TOOL_STEPS.length];
  return {
    id: `tr-run-t${index.toString().padStart(2, "0")}`,
    missionId: TRAINING_MISSION.id,
    at: at(2, index * 12),
    actor: { kind: "agent", id: "agent-cadet" },
    kind: "tool",
    noise: "trace",
    title: label,
    value,
    refs: { runId: "run-cadet" },
  } satisfies MissionEvent;
});

/** Visible from the start, up to and including the safe gate. */
const OPENING_EVENTS: MissionEvent[] = [
  {
    id: "tr-01",
    missionId: TRAINING_MISSION.id,
    at: at(0),
    actor: { kind: "human", id: "Nadia Belkacem" },
    kind: "message",
    noise: "fact",
    title:
      "Objectif : réparer l'invalidation du cache catalogue, vérification en staging uniquement. Lis chaque gate par sa portée avant de décider.",
  },
  ...agentTraces,
  {
    id: "tr-02",
    missionId: TRAINING_MISSION.id,
    at: at(4),
    actor: { kind: "agent", id: "agent-cadet" },
    kind: "patch",
    noise: "fact",
    title: "Correctif prêt",
    detail: "3 fichiers, le TTL est recalculé à l'écriture au lieu de la lecture.",
    value: "+42 / −17",
    refs: { runId: "run-cadet", artifactId: "patch-cadet" },
  },
  {
    id: STAGING_GATE_ID,
    missionId: TRAINING_MISSION.id,
    at: at(5),
    actor: { kind: "agent", id: "agent-cadet" },
    kind: "gate",
    noise: "decision",
    title: "Déployer le correctif de cache en staging",
    detail:
      "Publie la branche fix/cache-ttl sur l'environnement staging pour vérifier l'invalidation. Aucun impact en production.",
    decision: "pending",
    blastRadius: {
      files: 3,
      added: 42,
      removed: 17,
      environment: "staging",
      irreversible: false,
    },
    refs: { runId: "run-cadet" },
  },
];

/** Revealed once the safe gate is approved; ends on the trap. */
const VERIFICATION_EVENTS: MissionEvent[] = [
  {
    id: "tr-03",
    missionId: TRAINING_MISSION.id,
    at: at(8),
    actor: { kind: "system", id: "staging" },
    kind: "state",
    noise: "fact",
    title: "Vérification en staging : temps de réponse −38 %",
    detail: "L'invalidation suit l'écriture, plus aucune entrée servie après expiration.",
  },
  {
    id: "tr-04",
    missionId: TRAINING_MISSION.id,
    at: at(9),
    actor: { kind: "system", id: "git" },
    kind: "git",
    noise: "fact",
    title: "Branche poussée",
    value: "fix/cache-ttl",
  },
  {
    id: PURGE_GATE_ID,
    missionId: TRAINING_MISSION.id,
    at: at(10),
    actor: { kind: "agent", id: "agent-cadet" },
    kind: "gate",
    noise: "decision",
    // The title is deliberately harmless: the blast radius carries the truth.
    title: "Purger les entrées de cache expirées avant la mise en production",
    detail:
      "Exécute purge_cache.sql sur la base principale : la table cache_entries est vidée puis recréée. Gain estimé : 120 Mo.",
    decision: "pending",
    blastRadius: {
      files: 1,
      added: 0,
      removed: 58_240,
      environment: "production",
      irreversible: true,
    },
    refs: { runId: "run-cadet" },
  },
];

/** Revealed at graduation only. */
const CLOSING_EVENTS: MissionEvent[] = [
  {
    id: "tr-05",
    missionId: TRAINING_MISSION.id,
    at: at(12),
    actor: { kind: "system", id: "console" },
    kind: "state",
    noise: "fact",
    title: "Mission d'entraînement terminée",
    detail: "Gate sûre autorisée, gate piège refusée : la timeline est close.",
  },
];

function decidedAsExpected(progress: TrainingProgress, gateId: string): boolean {
  return progress.decisions[gateId] === EXPECTED_DECISIONS[gateId];
}

/**
 * Progressive disclosure: the next segment only exists once the previous gate
 * received the expected decision, so a wrong answer keeps the trainee on the
 * gate until they read it properly.
 */
export function visibleTrainingEvents(progress: TrainingProgress): MissionEvent[] {
  const events = [...OPENING_EVENTS];
  if (decidedAsExpected(progress, STAGING_GATE_ID)) events.push(...VERIFICATION_EVENTS);
  if (isGraduated(progress)) events.push(...CLOSING_EVENTS);
  return events;
}

export function isGraduated(progress: TrainingProgress): boolean {
  return Object.keys(EXPECTED_DECISIONS).every((gateId) =>
    decidedAsExpected(progress, gateId),
  );
}

export function correctDecisionCount(progress: TrainingProgress): number {
  return Object.keys(EXPECTED_DECISIONS).filter((gateId) =>
    decidedAsExpected(progress, gateId),
  ).length;
}

export type TrainingVerdict = {
  correct: boolean;
  title: string;
  message: string;
};

/** Pedagogical feedback for a decided training gate. */
export function verdictFor(gateId: string, decision: TrainingDecision): TrainingVerdict {
  const correct = EXPECTED_DECISIONS[gateId] === decision;
  if (gateId === STAGING_GATE_ID) {
    return correct
      ? {
          correct,
          title: "Bonne décision",
          message:
            "La portée annoncée — staging, réversible, 3 fichiers — correspond exactement à l'intention de la mission.",
        }
      : {
          correct,
          title: "Trop prudent",
          message:
            "Cette gate était sûre : environnement staging, réversible, 3 fichiers. Refuser par principe bloque le travail sans réduire aucun risque. Réessaie.",
        };
  }
  return correct
    ? {
        correct,
        title: "Piège déjoué",
        message:
          "Le titre était anodin, mais la portée disait production, irréversible, 58 240 lignes supprimées — et l'intention excluait la production.",
      }
    : {
        correct,
        title: "C'était le piège",
        message:
          "Le titre est anodin, mais la portée dit production, irréversible, 58 240 lignes supprimées. Une gate se lit par son blast radius, pas par son titre. Réessaie.",
      };
}
