import { formatDuration } from "@/lib/run-status";

const INACTIVITY_THRESHOLD_MS = 15_000;

/** Badge « inactif depuis X » — signal UI, ne clôture pas la mission (PRD §15). */
export function formatInactivityLabel(
  lastEventAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!lastEventAt) return null;
  const elapsed = nowMs - new Date(lastEventAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < INACTIVITY_THRESHOLD_MS) return null;
  return `Inactif depuis ${formatDuration(elapsed)}`;
}
