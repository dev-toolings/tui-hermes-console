/**
 * La ligne que les deux vues de `/runs` partagent.
 *
 * Le tableau et le kanban lisent la même liste de fils ; sans forme commune ils
 * se mettraient à dériver l'un de l'autre — c'est déjà ce qui distinguait
 * l'Aperçu de l'écran Missions. Le kanban ajoute un besoin que le tableau
 * n'avait pas : `runId`, la cible de `/cancel` et `/retry`. Le fil et son
 * dernier run n'ont pas le même identifiant, les confondre casserait la
 * mutation en silence.
 */
import { formatDuration, type RunStatus } from "@console/core/lib/run-status";
import type { ThreadListItemDto } from "@console/core/modules/runs/types";

export type MissionRow = {
  /** Identifiant du fil — la destination de `/runs/:id`. */
  id: string;
  /** Dernier run du fil. `null` quand le fil n'a jamais rien exécuté. */
  runId: string | null;
  title: string;
  agent: string;
  status: RunStatus;
  /** ISO, pour trier. Le libellé se calcule à l'affichage. */
  updatedAt: string;
  duration: string;
  tokens: number | null;
};

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function runDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  // Une mission encore en vol se mesure jusqu'à maintenant : la valeur est
  // figée au rendu, elle se rafraîchit quand le loader se rejoue.
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return formatDuration(Math.max(0, end - start));
}

export function toMissionRows(threads: ThreadListItemDto[]): MissionRow[] {
  return threads.map((thread) => ({
    id: thread.id,
    runId: thread.latestRun?.id ?? null,
    title: thread.title,
    agent: thread.agentName,
    status: (thread.latestRun?.status ?? "pending") as RunStatus,
    updatedAt: thread.updatedAt,
    duration: runDuration(
      thread.latestRun?.startedAt ?? null,
      thread.latestRun?.endedAt ?? null,
    ),
    tokens: thread.latestRun?.usage?.totalTokens ?? null,
  }));
}
