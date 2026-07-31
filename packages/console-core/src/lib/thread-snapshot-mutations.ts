import type {
  ProductRunStatus,
  StoredProductEvent,
  ThreadSnapshot,
} from "../modules/runs/types";

export type ApprovalRequest = {
  command: string | null;
  choices: string[];
  description: string | null;
};

/**
 * Le vocabulaire d'Hermes, mot pour mot : `POST /v1/runs/:id/approval` refuse
 * tout ce qui n'est pas l'un de ces quatre choix (« Invalid approval choice;
 * expected one of: once, session, always, deny »). Un booléen ne suffit pas —
 * c'est le choix lui-même que le runtime attend.
 */
export const APPROVAL_CHOICES = ["once", "session", "always", "deny"] as const;
export type ApprovalChoice = (typeof APPROVAL_CHOICES)[number];

export function statusFromEvent(event: StoredProductEvent): ProductRunStatus | null {
  if (event.type === "approval.requested") return "awaiting_approval";
  if (event.type === "run.completed") return "completed";
  if (event.type === "run.error") return "failed";
  if (event.type === "system.notice" && event.payload.kind === "cancelled") {
    return "cancelled";
  }
  return null;
}

export function isTerminalProductEvent(event: StoredProductEvent) {
  const status = statusFromEvent(event);
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function applyProductEventToSnapshot(
  snapshot: ThreadSnapshot,
  event: StoredProductEvent,
): ThreadSnapshot {
  if (event.cursor <= snapshot.cursor) return snapshot;

  const nextStatus = statusFromEvent(event);
  const now = new Date().toISOString();
  const next: ThreadSnapshot = {
    ...snapshot,
    cursor: event.cursor,
    events: [...snapshot.events, event],
    runs: snapshot.runs.map((run) => {
      if (run.id !== event.runId) return run;

      const withEventAt = { ...run, lastEventAt: now };

      if (nextStatus === "awaiting_approval") {
        return { ...withEventAt, status: "awaiting_approval" };
      }
      if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "cancelled") {
        return {
          ...withEventAt,
          status: nextStatus,
          endedAt: now,
          error:
            event.type === "run.error"
              ? String(event.payload.message ?? "Erreur Hermes.")
              : run.error,
        };
      }
      if (run.status === "pending" || run.status === "starting") {
        return {
          ...withEventAt,
          status: "running",
          startedAt: run.startedAt ?? now,
        };
      }
      return withEventAt;
    }),
  };

  return next;
}

/** Dernière demande d’autorisation encore ouverte pour un run (après le dernier terminal). */
export function latestOpenApproval(
  events: StoredProductEvent[],
  runId: string,
): ApprovalRequest | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.runId !== runId) continue;
    if (isTerminalProductEvent(event)) return null;
    // La décision d'un humain ferme la demande immédiatement. Attendre que le
    // statut du run repasse en `running` laissait la carte à l'écran le temps
    // d'un aller-retour serveur, donc offrait un second clic sans objet.
    if (event.type === "approval.responded") return null;
    if (event.type === "approval.requested") {
      return {
        command: typeof event.payload.command === "string" ? event.payload.command : null,
        choices: Array.isArray(event.payload.choices)
          ? event.payload.choices.map(String)
          : [],
        description:
          typeof event.payload.description === "string" ? event.payload.description : null,
      };
    }
  }
  return null;
}
