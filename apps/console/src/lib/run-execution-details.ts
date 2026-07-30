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
