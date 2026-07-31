import type { RunDto, ThreadSnapshot } from "@console/core/modules/runs/types";
import { RUN_STATUS, type RunStatus } from "@console/core/lib/run-status";
import type { RunExecutionDetails } from "@/components/run/result-panel";

function formatModel(provider: string | null | undefined, model: string) {
  return provider ? `${provider} / ${model}` : model;
}

/** Modèle résolu par la Console au moment de la lecture (settings / agent). */
export function resolvedConsoleModel(snapshot: ThreadSnapshot) {
  return formatModel(snapshot.effectiveProvider, snapshot.effectiveModel);
}

/** Modèle réellement utilisé par Hermes pour cette mission (session runtime). */
export function actualRunModel(snapshot: ThreadSnapshot, run: RunDto) {
  const sessionModel = run.runtimeSession?.model;
  if (!sessionModel) return null;
  return formatModel(snapshot.effectiveProvider, sessionModel);
}

export function buildRunExecutionDetails(
  snapshot: ThreadSnapshot,
  run: RunDto,
): RunExecutionDetails {
  const requestedModel = resolvedConsoleModel(snapshot);
  const terminal = RUN_STATUS[run.status as RunStatus]?.terminal ?? false;
  const usedModel = actualRunModel(snapshot, run);

  return {
    requestedModel,
    activeModel: usedModel ?? (terminal && run.hermesResponseId ? null : requestedModel),
    activeLabel: terminal ? "Modèle utilisé" : "LLM actif",
    reasoningTokens: run.runtimeSession?.reasoningTokens ?? null,
    toolCallCount: run.runtimeSession?.toolCallCount ?? null,
    reasoningExposed: snapshot.events.some(
      (event) => event.runId === run.id && event.type === "agent.reasoning",
    ),
  };
}

export function displayRunHeaderModel(snapshot: ThreadSnapshot, run: RunDto) {
  return actualRunModel(snapshot, run) ?? resolvedConsoleModel(snapshot);
}

/**
 * Tokens cumulés de la conversation — tous les runs du fil, entrée et sortie.
 *
 * `null` tant qu'aucun run n'a rapporté d'usage : un thread qui démarre n'a pas
 * consommé zéro token, il n'a pas encore de mesure. La distinction compte pour
 * l'anneau de contexte, qui doit rester absent plutôt que d'afficher 0 %.
 */
export function threadTotalTokens(snapshot: ThreadSnapshot | null): number | null {
  const usages = (snapshot?.runs ?? []).map((run) => run.usage).filter((usage) => usage != null);
  if (usages.length === 0) return null;
  return usages.reduce((total, usage) => total + (usage.totalTokens ?? 0), 0);
}

/**
 * L'identifiant de modèle à confronter à la table des fenêtres.
 *
 * Le modèle *effectivement* utilisé par le runtime prime : c'est sa fenêtre qui
 * s'applique, pas celle du modèle demandé. Sans préfixe fournisseur, que
 * `resolvedConsoleModel` ajoute pour l'affichage mais qui n'est pas un id.
 */
export function threadContextModel(snapshot: ThreadSnapshot | null): string | null {
  if (!snapshot) return null;
  const lastRunModel = [...snapshot.runs]
    .reverse()
    .find((run) => run.runtimeSession?.model)?.runtimeSession?.model;
  return lastRunModel ?? snapshot.effectiveModel ?? null;
}
