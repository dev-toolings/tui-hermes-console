/**
 * Le board des missions, calqué sur `board-view.tsx` / `board-column.tsx` de
 * Multica : colonnes de 280 px à fond teinté, en-tête « pastille · libellé ·
 * compte » avec ses actions à droite, zone de dépôt en défilement propre,
 * collision pointeur-d'abord, et fantôme incliné pendant le geste.
 *
 * Une différence tient au domaine, pas au goût : chez Multica une colonne est
 * un champ modifiable, on y dépose ce qu'on veut. Ici le statut appartient au
 * runtime — les seules mutations exposées sont `cancel` et `retry`
 * (`kanban-columns.ts`). Les voies qui ne correspondent à aucune des deux se
 * ferment pendant le drag : la carte n'y entre pas, il n'y a donc pas d'échec
 * à expliquer après coup.
 */
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Dialog } from "@boardui/ui";
import { Button, ButtonLink } from "@/components/ui/boardui";
import { toast } from "@/components/ui/toast";
import { cancelRun, retryRun } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/router";
import {
  BOARD_CARD_WIDTH,
  BOARD_COL_WIDTH,
  LANES,
  dropAction,
  laneOf,
  type DropAction,
  type Lane,
  type LaneId,
} from "./kanban-columns";
import { DraggableMissionCard, MissionCardContent } from "./mission-card";
import { StatusIcon } from "./status-icon";
import type { MissionRow } from "./mission-row";

const LANE_IDS = new Set<string>(LANES.map((lane) => lane.id));

/**
 * Collision de Multica (`makeKanbanCollision`) : on privilégie ce que le
 * pointeur survole vraiment, et parmi ces cibles les cartes plutôt que la
 * colonne — sinon déposer entre deux cartes viserait toujours la colonne.
 * `closestCenter` ne sert que hors de toute zone.
 */
const kanbanCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) {
    const cards = pointer.filter((collision) => !LANE_IDS.has(String(collision.id)));
    return cards.length > 0 ? cards : pointer;
  }
  return closestCenter(args);
};

const SR_INSTRUCTIONS = {
  draggable:
    "Appuyez sur Entrée ou Espace pour saisir la mission, puis les flèches pour la déplacer. " +
    "Déposez-la dans « À faire » ou « En cours » pour la relancer, dans « Échecs » pour l’annuler. " +
    "Entrée pour valider, Échap pour abandonner.",
};

export function MissionsKanban({ rows }: { rows: MissionRow[] }) {
  const router = useRouter();
  /**
   * L'ordre choisi à la souris, comme dans la data-table de l'Aperçu : un
   * classement local d'identifiants, jamais persisté. Mémoriser des ids plutôt
   * que des lignes laisse le loader remplacer les données sans le perdre.
   */
  const [order, setOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<MissionRow | null>(null);

  const sensors = useSensors(
    // 5 px, comme Multica : en deçà le geste est un clic — la carte est un lien.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byLane = useMemo(() => {
    const rank = new Map(order.map((id, index) => [id, index]));
    const lanes = new Map<LaneId, MissionRow[]>(LANES.map((lane) => [lane.id, []]));
    for (const row of rows) lanes.get(laneOf(row.status))!.push(row);
    for (const list of lanes.values()) {
      list.sort((a, b) => {
        const ra = rank.get(a.id);
        const rb = rank.get(b.id);
        if (ra !== undefined && rb !== undefined) return ra - rb;
        // Les missions arrivées depuis le dernier drag n'ont pas de rang :
        // elles gardent l'ordre du serveur, la plus récente en tête.
        if (ra !== undefined) return -1;
        if (rb !== undefined) return 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    }
    return lanes;
  }, [rows, order]);

  const activeRow = activeId ? (rows.find((row) => row.id === activeId) ?? null) : null;

  /** Voies ouvertes pendant le geste : la voie d'origine, plus les actions légales. */
  function laneOpen(lane: LaneId) {
    if (!activeRow) return true;
    return laneOf(activeRow.status) === lane || dropAction(activeRow.status, lane) !== null;
  }

  async function apply(action: DropAction, row: MissionRow) {
    if (!row.runId) {
      toast.error("Cette mission n’a encore aucune exécution.");
      return;
    }
    setPendingId(row.id);
    try {
      if (action === "cancel") {
        const result = await cancelRun(row.runId);
        toast.success(result.status === "stopping" ? "Annulation en cours…" : "Mission annulée.");
      } else {
        await retryRun(row.runId);
        toast.success("Mission relancée.");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const row = activeRow;
    setActiveId(null);
    if (!row || !event.over) return;

    const target = (event.over.data.current as { lane?: LaneId } | undefined)?.lane;
    if (!target) return;

    const source = laneOf(row.status);
    if (target === source) {
      // Réordonnancement dans la voie : on ne réécrit que ce segment du
      // classement, pour ne pas figer l'ordre des quatre autres colonnes.
      const ids = byLane.get(source)!.map((item) => item.id);
      const from = ids.indexOf(row.id);
      const to = ids.indexOf(String(event.over.id));
      if (from === -1 || to === -1 || from === to) return;
      const moved = arrayMove(ids, from, to);
      setOrder((previous) => [...previous.filter((id) => !ids.includes(id)), ...moved]);
      return;
    }

    const action = dropAction(row.status, target);
    if (!action) return;
    // L'annulation coupe une mission en vol : un geste parasite ne doit pas
    // suffire. La relance, elle, n'enlève rien — elle part directement.
    if (action === "cancel") setConfirmCancel(row);
    else void apply("retry", row);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Mission ${labelOf(rows, active.id)} saisie.`,
    onDragOver: ({ over }) =>
      over ? `Sur la colonne ${laneLabel(over.data.current)}.` : "Hors d’une colonne.",
    onDragEnd: ({ over }) =>
      over ? `Mission déposée dans ${laneLabel(over.data.current)}.` : "Dépôt abandonné.",
    onDragCancel: () => "Déplacement abandonné.",
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center dark:bg-surface">
        <p className="text-sm font-medium">Aucune conversation</p>
        <p className="mt-1 text-[0.75rem] text-muted-foreground">
          Lancez une mission depuis un agent pour peupler l’historique PostgreSQL.
        </p>
        <ButtonLink href="/runs/new" variant="primary" className="mt-4 inline-flex">
          <PlusIcon className="size-4" />
          Nouvelle mission
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={kanbanCollision}
        accessibility={{ announcements, screenReaderInstructions: SR_INSTRUCTIONS }}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto scrollbar-subtle p-2">
          {LANES.map((lane) => (
            <BoardColumn
              key={lane.id}
              lane={lane}
              rows={byLane.get(lane.id)!}
              open={laneOpen(lane.id)}
              dragging={activeRow !== null}
              dropHint={activeRow ? dropHintFor(activeRow, lane.id) : null}
              pendingId={pendingId}
            />
          ))}
        </div>

        {/* Fantôme incliné de Multica : il flotte au-dessus du board sans
            rejouer d'animation de chute au relâchement. */}
        <DragOverlay dropAnimation={null}>
          {activeRow ? (
            <div
              style={{ width: BOARD_CARD_WIDTH }}
              className="rotate-1 cursor-grabbing opacity-90 shadow-lg shadow-black/10"
            >
              <MissionCardContent row={activeRow} lane={laneOf(activeRow.status)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog
        open={confirmCancel !== null}
        onClose={() => setConfirmCancel(null)}
        title="Annuler cette mission ?"
        description={confirmCancel?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(null)}>
              Revenir
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const row = confirmCancel;
                setConfirmCancel(null);
                if (row) void apply("cancel", row);
              }}
            >
              Annuler la mission
            </Button>
          </>
        }
      >
        <p>
          L’exécution est interrompue côté runtime. L’historique est conservé : la mission reste
          relisible, et vous pourrez la relancer depuis la colonne « Échecs ».
        </p>
      </Dialog>
    </>
  );
}

/** Ce que le dépôt ferait, affiché en surimpression quand la voie est visée. */
function dropHintFor(row: MissionRow, lane: LaneId) {
  const action = dropAction(row.status, lane);
  if (!action) return null;
  return action === "cancel" ? "Annuler la mission" : "Relancer la mission";
}

function BoardColumn({
  lane,
  rows,
  open,
  dragging,
  dropHint,
  pendingId,
}: {
  lane: Lane;
  rows: MissionRow[];
  open: boolean;
  dragging: boolean;
  dropHint: string | null;
  pendingId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: lane.id,
    data: { lane: lane.id },
    disabled: !open,
  });

  return (
    <section
      style={{ width: BOARD_COL_WIDTH }}
      aria-label={`${lane.label} — ${rows.length} mission(s)`}
      className={cn(
        "flex shrink-0 flex-col rounded-xl p-2 transition-opacity",
        lane.columnBg,
        // Une voie fermée s'efface au lieu de refuser : on ne propose pas un
        // geste pour l'annuler ensuite.
        dragging && !open && "opacity-40",
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 text-[0.75rem] font-semibold",
              lane.iconColor,
            )}
          >
            <StatusIcon progress={lane.progress} mark={lane.mark} className="size-3" />
            <span className="truncate text-foreground">{lane.label}</span>
          </span>
          <span className="text-[0.75rem] tabular-nums text-muted-foreground">{rows.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <ButtonLink
            href="/runs/new"
            variant="ghost"
            className="size-6 rounded-full p-0 text-muted-foreground"
          >
            <PlusIcon className="size-3.5" />
            <span className="sr-only">Nouvelle mission</span>
          </ButtonLink>
        </div>
      </div>

      <div className="relative min-h-[200px] flex-1 rounded-lg">
        {isOver && dropHint ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/40">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[0.75rem] font-medium shadow-sm">
              {dropHint === "Annuler la mission" ? (
                <XIcon className="size-3.5" />
              ) : (
                <RotateCcwIcon className="size-3.5" />
              )}
              {dropHint}
            </span>
          </div>
        ) : null}
        <div
          ref={setNodeRef}
          className={cn(
            "absolute inset-0 overflow-y-auto scrollbar-subtle rounded-lg p-1 transition-colors",
            isOver && dropHint && "bg-accent/15 ring-2 ring-accent/25",
            isOver && !dropHint && "bg-accent/60",
          )}
        >
          {rows.length > 0 ? (
            <SortableContext
              items={rows.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((row, index) => (
                // `pt-2` plutôt qu'un `gap` : l'écart reste dans la boîte
                // mesurée de la carte, ce que le tri de dnd-kit préfère.
                <div key={row.id} className={index === 0 ? undefined : "pt-2"}>
                  <DraggableMissionCard
                    row={row}
                    lane={lane.id}
                    droppable={open}
                    pending={pendingId === row.id}
                  />
                </div>
              ))}
            </SortableContext>
          ) : (
            <p className="py-8 text-center text-[0.75rem] text-muted-foreground">Aucune mission</p>
          )}
        </div>
      </div>
    </section>
  );
}

function labelOf(rows: MissionRow[], id: string | number) {
  return rows.find((row) => row.id === String(id))?.title ?? String(id);
}

/** Le survol peut viser la colonne comme une carte : les deux portent `lane`. */
function laneLabel(data: unknown) {
  const lane = (data as { lane?: LaneId } | undefined)?.lane;
  return LANES.find((item) => item.id === lane)?.label ?? "une colonne";
}
