/**
 * Langage visuel des statuts de mission.
 *
 * Regle : jamais la couleur seule. Chaque statut porte un libelle ET un glyphe,
 * pour rester lisible en daltonisme comme en lecture d'ecran.
 */

export type RunStatus =
  | "pending"
  | "starting"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

/** Statuts renvoyes par le runtime Hermes — mesures pendant le spike Phase 0. */
export type HermesRunStatus =
  | "started"
  | "running"
  | "waiting_for_approval"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled";

export const RUN_STATUS_FROM_HERMES: Record<HermesRunStatus, RunStatus> = {
  started: "running",
  running: "running",
  waiting_for_approval: "awaiting_approval",
  stopping: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

export type StatusStyle = {
  label: string;
  /** Glyphe textuel — le statut ne repose jamais sur la seule couleur. */
  glyph: string;
  /** Classes du point indicateur. */
  dot: string;
  /** Classes du badge complet. */
  badge: string;
  /** Le statut est-il terminal ? */
  terminal: boolean;
  /** Anime le point (neutralise par prefers-reduced-motion). */
  live: boolean;
};

export const ARTIFACT_DELIVERY_ERROR_PREFIX =
  "[ARTIFACT_DELIVERY_FAILED] ";

export const RUN_STATUS: Record<RunStatus, StatusStyle> = {
  pending: {
    label: "En attente",
    glyph: "○",
    dot: "bg-muted-foreground",
    badge: "text-muted-foreground bg-muted",
    terminal: false,
    live: false,
  },
  starting: {
    label: "Démarrage",
    glyph: "◔",
    dot: "bg-muted-foreground",
    badge: "text-muted-foreground bg-muted",
    terminal: false,
    live: true,
  },
  running: {
    label: "En cours",
    glyph: "●",
    dot: "bg-accent",
    badge: "bg-info-100 text-info-700",
    terminal: false,
    live: true,
  },
  // Le seul etat qui reclame un humain : il domine visuellement.
  awaiting_approval: {
    label: "Autorisation requise",
    glyph: "⚠",
    dot: "bg-warn-700",
    badge: "bg-warn-100 text-warn-700",
    terminal: false,
    live: true,
  },
  completed: {
    label: "Terminée",
    glyph: "✓",
    dot: "bg-pos-700",
    badge: "bg-pos-100 text-pos-700",
    terminal: true,
    live: false,
  },
  failed: {
    label: "Échec",
    glyph: "✗",
    dot: "bg-destructive",
    badge: "bg-neg-100 text-neg-700",
    terminal: true,
    live: false,
  },
  cancelled: {
    label: "Annulée",
    glyph: "⊘",
    dot: "bg-muted-foreground",
    badge: "text-muted-foreground bg-muted line-through",
    terminal: true,
    live: false,
  },
};

export const isTerminal = (s: RunStatus) => RUN_STATUS[s].terminal;

const DELIVERY_FAILED_STATUS: StatusStyle = {
  label: "Exécution terminée · livraison échouée",
  glyph: "!",
  dot: "bg-destructive",
  badge: "bg-neg-100 text-neg-700",
  terminal: true,
  live: false,
};

export function isArtifactDeliveryFailure(error: string | null | undefined) {
  return error?.startsWith(ARTIFACT_DELIVERY_ERROR_PREFIX) ?? false;
}

export function artifactDeliveryFailureMessage(
  error: string | null | undefined,
) {
  if (!isArtifactDeliveryFailure(error)) return null;
  return error!.slice(ARTIFACT_DELIVERY_ERROR_PREFIX.length);
}

export function runStatusStyle(
  status: RunStatus,
  error?: string | null,
): StatusStyle {
  if (status === "completed" && isArtifactDeliveryFailure(error)) {
    return DELIVERY_FAILED_STATUS;
  }
  return RUN_STATUS[status];
}

/** Duree lisible : "2 min 14 s", "930 ms". Toujours rendue en tabular-nums. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m} min ${String(rest).padStart(2, "0")} s`;
}

/** 38 387 -> "38 387" (espace insecable fine, lisible en francais). */
export function formatTokens(n: number): string {
  return n.toLocaleString("fr-FR").replace(/ /g, " ");
}
