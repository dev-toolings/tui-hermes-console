/**
 * Le modèle du kanban : quelles colonnes, et quel geste est légal.
 *
 * Le statut d'un run appartient au runtime, pas à l'interface — on ne « déplace »
 * pas une mission dans l'état de son choix. Les seules transitions que le serveur
 * expose sont `POST /api/runs/:runId/cancel` et `POST /api/runs/:runId/retry`.
 * `dropAction` est la traduction exacte de ces deux routes en gestes : tout ce
 * qu'elle refuse rend la colonne inerte, plutôt que d'accepter un dépôt pour le
 * rejeter ensuite par un message.
 *
 * Le fichier est volontairement pur : c'est la règle métier du board, elle se
 * teste sans monter React ni dnd-kit.
 */
import { RUN_STATUS, type RunStatus } from "@console/core/lib/run-status";
import type { StatusMark } from "./status-icon";

export type LaneId = "todo" | "running" | "approval" | "done" | "failed";

export type Lane = {
  id: LaneId;
  label: string;
  statuses: readonly RunStatus[];
  /** Remplissage de la pastille, de l'anneau vide au disque plein. */
  progress: number;
  mark?: StatusMark;
  /** Teinte de la pastille et du titre de colonne. */
  iconColor: string;
  /** Fond de la colonne — un lavis, jamais une couleur pleine. */
  columnBg: string;
};

/**
 * Cinq voies pour sept statuts. `pending`/`starting` d'un côté et
 * `failed`/`cancelled` de l'autre ne se distinguent pas à l'échelle d'un board :
 * les fusionner évite deux colonnes presque toujours vides.
 *
 * La progression suit le parcours réel d'une mission (anneau vide → moitié →
 * disque plein), comme le `STATUS_CONFIG` de Multica. Les teintes, elles,
 * restent celles que `run-status.ts` a déjà fixées pour toute la Console :
 * bleu pour l'exécution, ambre pour ce qui attend un humain, vert pour le
 * succès, rouge pour l'échec.
 */
export const LANES: readonly Lane[] = [
  {
    id: "todo",
    label: "À faire",
    statuses: ["pending", "starting"],
    progress: 0,
    iconColor: "text-muted-foreground",
    columnBg: "bg-muted/40",
  },
  {
    id: "running",
    label: "En cours",
    statuses: ["running"],
    progress: 0.5,
    iconColor: "text-info-700",
    columnBg: "bg-info-700/5",
  },
  {
    id: "approval",
    label: "Autorisation",
    statuses: ["awaiting_approval"],
    progress: 0.5,
    mark: "slash",
    iconColor: "text-warn-700",
    columnBg: "bg-warn-700/5",
  },
  {
    id: "done",
    label: "Terminées",
    statuses: ["completed"],
    progress: 1,
    mark: "check",
    iconColor: "text-pos-700",
    columnBg: "bg-pos-700/5",
  },
  {
    id: "failed",
    label: "Échecs",
    statuses: ["failed", "cancelled"],
    progress: 0,
    mark: "cross",
    iconColor: "text-neg-700",
    columnBg: "bg-neg-700/5",
  },
];

/** Largeur de colonne de Multica ; la carte occupe le reste (col − p-2 − p-1). */
export const BOARD_COL_WIDTH = 280;
export const BOARD_CARD_WIDTH = BOARD_COL_WIDTH - 16 - 8;

export const LANE_BY_ID = new Map(LANES.map((lane) => [lane.id, lane]));

const LANE_BY_STATUS = new Map<RunStatus, LaneId>(
  LANES.flatMap((lane) => lane.statuses.map((status) => [status, lane.id] as const)),
);

export function laneOf(status: RunStatus): LaneId {
  // Le Map couvre les sept statuts ; le repli n'existe que pour un statut
  // inventé par un runtime plus récent que cette Console.
  return LANE_BY_STATUS.get(status) ?? "todo";
}

export type DropAction = "cancel" | "retry";

/**
 * Ce que produit le dépôt d'une carte dans une colonne — `null` si rien.
 *
 * Déposer une mission active dans « Échecs », c'est demander son annulation.
 * Déposer une mission terminée dans « À faire » ou « En cours », c'est demander
 * sa relance — qui crée un nouveau run dans le même fil, sans écraser
 * l'historique. Les deux voies valent : le run relancé repart en `pending`, donc
 * littéralement « À faire », mais on le vise aussi bien là où il va se voir
 * travailler.
 */
export function dropAction(status: RunStatus, lane: LaneId): DropAction | null {
  const terminal = RUN_STATUS[status].terminal;
  if (!terminal && lane === "failed") return "cancel";
  if (terminal && (lane === "todo" || lane === "running")) return "retry";
  return null;
}
