/**
 * La carte du board, calquée sur `BoardCardContent` de Multica.
 *
 * Même anatomie en quatre bandes — méta discrète, titre sur deux lignes,
 * puces, méta de bas de carte — et mêmes gestes : la carte entière est la
 * poignée, elle enveloppe un lien, et le capteur n'arme le drag qu'après 5 px
 * pour qu'un clic net reste un clic. Le contenu, lui, est le nôtre : une
 * mission n'a ni priorité ni assigné, elle a un agent, une durée et des tokens.
 */
import { memo } from "react";
import { useSortable, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ClockIcon } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/cn";
import { RUN_STATUS, formatTokens } from "@console/core/lib/run-status";
import { LANE_BY_ID, type LaneId } from "./kanban-columns";
import { StatusIcon } from "./status-icon";
import { formatWhen, type MissionRow } from "./mission-row";

/** Le corps visuel, partagé par la carte triable et le fantôme du DragOverlay. */
export const MissionCardContent = memo(function MissionCardContent({
  row,
  lane,
}: {
  row: MissionRow;
  lane: LaneId;
}) {
  const config = LANE_BY_ID.get(lane)!;
  const status = RUN_STATUS[row.status];
  // La colonne dit déjà l'état ; on ne le répète sur la carte que là où deux
  // statuts partagent une voie — « en attente » vs « démarrage », « échec »
  // vs « annulée ».
  const showStatusChip = config.statuses.length > 1;

  return (
    <div className="rounded-lg border-[0.5px] border-border bg-card px-2.5 py-3 shadow-[var(--shadow-elevated)] transition-colors group-hover/card:border-foreground/15 group-hover/card:bg-surface-hover dark:bg-surface">
      {/* Bande 1 : pastille + agent à gauche, activité à droite */}
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex min-w-0 items-center gap-1.5", config.iconColor)}>
          <StatusIcon progress={config.progress} mark={config.mark} className="size-3.5" />
          <p className="truncate text-[0.75rem] text-muted-foreground">{row.agent}</p>
        </div>
        {status.live ? (
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              status.dot,
              "animate-pulse motion-reduce:animate-none",
            )}
          />
        ) : null}
      </div>

      {/* Bande 2 : titre */}
      <p className="mt-1 line-clamp-2 text-[0.875rem] font-medium leading-snug">{row.title}</p>

      {/* Bande 3 : puces */}
      {showStatusChip ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex max-w-[160px] items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem]",
              status.badge,
            )}
          >
            <span aria-hidden>{status.glyph}</span>
            <span className="truncate">{status.label}</span>
          </span>
        </div>
      ) : null}

      {/* Bande 4 : mise à jour à gauche, coût à droite */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[0.75rem] text-muted-foreground">
          {formatWhen(row.updatedAt)}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-[0.75rem] text-muted-foreground">
          <span className="flex items-center gap-1 tabular-nums">
            <ClockIcon className="size-3" />
            {row.duration}
          </span>
          {row.tokens ? (
            <span className="tabular-nums">{formatTokens(row.tokens)} tok</span>
          ) : null}
        </div>
      </div>
    </div>
  );
});

/**
 * Multica coupe l'animation de repositionnement pendant le tri : sans ça, la
 * carte rejoue son déplacement après le drop et double le mouvement.
 */
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

export const DraggableMissionCard = memo(function DraggableMissionCard({
  row,
  lane,
  /** La carte accepte-t-elle qu'on dépose sur elle ? Faux dans une voie fermée. */
  droppable,
  pending,
}: {
  row: MissionRow;
  lane: LaneId;
  droppable: boolean;
  pending: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { lane, status: row.status },
    animateLayoutChanges,
    // Une carte reste triable dans sa voie ; seule sa cible de dépôt se ferme,
    // sinon un dépôt sur une carte contournerait la voie désactivée.
    disabled: { draggable: pending, droppable: !droppable },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "group/card touch-none",
        isDragging && "opacity-30",
        pending && "pointer-events-none opacity-60",
      )}
    >
      <Link
        href={`/runs/${row.id}`}
        draggable={false}
        className={cn("group block transition-colors", isDragging && "pointer-events-none")}
      >
        <MissionCardContent row={row} lane={lane} />
      </Link>
    </div>
  );
});
