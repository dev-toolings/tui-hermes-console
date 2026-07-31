"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Columns3Icon,
  GripVerticalIcon,
  MoreVerticalIcon,
  PlusIcon,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Badge,
  Button,
  buttonVariants,
  Checkbox,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useIsMobile,
} from "@boardui/ui";
import { Link, useRouter } from "@/lib/router";
import { cn } from "@/lib/cn";
import { RUN_STATUS, formatTokens, type RunStatus } from "@console/core/lib/run-status";

export type MissionRow = {
  id: string;
  title: string;
  agentName: string;
  updatedAt: string;
  status: RunStatus;
  totalTokens: number | null;
};

const TABS = [
  { value: "all", label: "Toutes" },
  { value: "active", label: "En cours" },
  { value: "done", label: "Terminées" },
  { value: "failed", label: "Échecs" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

/** Libellés du menu « Personnaliser les colonnes » — `column.id` est anglais. */
const COLUMN_LABELS: Record<string, string> = {
  title: "Mission",
  agentName: "Agent",
  status: "État",
  updatedAt: "Mise à jour",
  totalTokens: "Tokens",
};

function matchesTab(row: MissionRow, tab: TabValue) {
  if (tab === "active") return !RUN_STATUS[row.status].terminal;
  if (tab === "done") return row.status === "completed";
  if (tab === "failed") return row.status === "failed";
  return true;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: RunStatus }) {
  const style = RUN_STATUS[status];
  return (
    <Badge variant="outline" className={cn("px-1.5", style.badge)}>
      <span aria-hidden>{style.glyph}</span>
      {style.label}
    </Badge>
  );
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id });

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon-sm"
      iconOnly
      className="size-7 bg-transparent text-muted-foreground hover:bg-transparent"
    >
      <GripVerticalIcon className="size-3 text-muted-foreground" />
      <span className="sr-only">Glisser pour réordonner</span>
    </Button>
  );
}

const columns: ColumnDef<MissionRow>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
  },
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Tout sélectionner"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Sélectionner la ligne"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: "Mission",
    cell: ({ row }) => <MissionCellViewer mission={row.original} />,
    enableHiding: false,
  },
  {
    accessorKey: "agentName",
    header: "Agent",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {row.original.agentName}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "État",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "updatedAt",
    header: "Mise à jour",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatWhen(row.original.updatedAt)}</span>
    ),
  },
  {
    accessorKey: "totalTokens",
    header: () => <div className="w-full text-right">Tokens</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-muted-foreground tabular-nums">
        {row.original.totalTokens
          ? formatTokens(row.original.totalTokens)
          : RUN_STATUS[row.original.status].terminal
            ? "—"
            : "en cours"}
      </div>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <RowActions mission={row.original} />,
  },
];

function RowActions({ mission }: { mission: MissionRow }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          iconOnly
          className="flex size-8 bg-transparent text-muted-foreground hover:bg-muted data-open:bg-muted"
        >
          <MoreVerticalIcon className="size-4" />
          <span className="sr-only">Ouvrir le menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => router.push(`/runs/${mission.id}`)}>
          Ouvrir la mission
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(mission.id)}>
          Copier l’identifiant
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/runs/new")}>
          Nouvelle mission
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DraggableRow({ row }: { row: Row<MissionRow> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({ id: row.original.id });

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function MissionsDataTable({ rows }: { rows: MissionRow[] }) {
  /**
   * L'ordre est un état local, comme dans le bloc : le drag réordonne
   * l'affichage, il ne persiste rien côté serveur. On mémorise une liste d'ids
   * plutôt qu'une copie des lignes — ainsi un rechargement du loader remplace
   * bien les données sans perdre l'ordre choisi.
   */
  const [order, setOrder] = React.useState<string[]>([]);
  const data = React.useMemo(() => {
    if (order.length === 0) return rows;
    const rank = new Map(order.map((id, index) => [id, index]));
    // Les lignes arrivées depuis le dernier drag n'ont pas de rang : elles
    // passent à la fin, dans l'ordre du serveur.
    return [...rows].sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [rows, order]);

  const [tab, setTab] = React.useState<TabValue>("all");
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const sortableId = React.useId();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  const counts = React.useMemo(
    () =>
      Object.fromEntries(
        TABS.map((item) => [item.value, data.filter((row) => matchesTab(row, item.value)).length]),
      ) as Record<TabValue, number>,
    [data],
  );

  const visibleRows = React.useMemo(
    () => data.filter((row) => matchesTab(row, tab)),
    [data, tab],
  );
  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => visibleRows.map((row) => row.id),
    [visibleRows],
  );

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { sorting, columnVisibility, rowSelection, pagination },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    const ids = data.map((row) => row.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as TabValue);
        setPagination((state) => ({ ...state, pageIndex: 0 }));
      }}
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Label htmlFor="mission-view-selector" className="sr-only">
          Vue
        </Label>
        <Select value={tab} onValueChange={(value) => value && setTab(value as TabValue)}>
          <SelectTrigger size="sm" id="mission-view-selector" className="flex w-fit @4xl/main:hidden">
            <SelectValue placeholder="Choisir une vue" />
          </SelectTrigger>
          <SelectContent>
            {TABS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
              {counts[item.value] > 0 ? (
                <Badge variant="secondary">{counts[item.value]}</Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                leadingIcon={Columns3Icon}
                trailingIcon={ChevronDownIcon}
              >
                <span className="hidden lg:inline">Personnaliser les colonnes</span>
                <span className="lg:hidden">Colonnes</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {COLUMN_LABELS[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/*
            `Button asChild` est inutilisable ici : le Button BoardUI enveloppe
            ses enfants dans un `<span>`, que `Slot` prendrait pour l'unique
            enfant à cloner. On applique donc les variantes au lien, comme le
            fait déjà `ButtonLink`.
          */}
          <Link
            href="/runs/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 px-2.5")}
          >
            <PlusIcon className="size-4" />
            <span className="hidden lg:inline">Nouvelle mission</span>
          </Link>
        </div>
      </div>

      <TabsContent value={tab} className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows.length ? (
                  <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      {rows.length === 0
                        ? "Aucune conversation en base. Lancez une première mission."
                        : "Aucune mission dans cet état."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} sur{" "}
            {table.getFilteredRowModel().rows.length} ligne(s) sélectionnée(s).
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Lignes par page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} sur{" "}
              {Math.max(table.getPageCount(), 1)}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                size="icon-sm"
                iconOnly
                className="hidden size-8 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeftIcon className="size-4" />
                <span className="sr-only">Première page</span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                iconOnly
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeftIcon className="size-4" />
                <span className="sr-only">Page précédente</span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                iconOnly
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRightIcon className="size-4" />
                <span className="sr-only">Page suivante</span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                iconOnly
                className="hidden size-8 lg:flex"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRightIcon className="size-4" />
                <span className="sr-only">Dernière page</span>
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

/**
 * Panneau de détail du bloc. Le `data.json` de shadcn portait un formulaire
 * éditable ; ici la mission est un objet du runtime, en lecture seule — le
 * seul geste possible est d'ouvrir son exécution.
 */
function MissionCellViewer({ mission }: { mission: MissionRow }) {
  const isMobile = useIsMobile();
  const status = RUN_STATUS[mission.status];

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button
          variant="link"
          size="sm"
          className="w-fit px-0 text-left text-foreground [&>span]:px-0"
        >
          {mission.title}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{mission.title}</DrawerTitle>
          <DrawerDescription>Dernière activité le {formatWhen(mission.updatedAt)}</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={mission.status} />
            <span className="text-muted-foreground">
              {status.terminal ? "Exécution terminée" : "Exécution en cours"}
            </span>
          </div>
          <Separator />
          <dl className="grid gap-3">
            <Field label="Agent" value={mission.agentName} />
            <Field
              label="Tokens"
              value={mission.totalTokens ? formatTokens(mission.totalTokens) : "—"}
            />
            <Field label="Identifiant" value={mission.id} mono />
          </dl>
        </div>

        <DrawerFooter>
          <Link
            href={`/runs/${mission.id}`}
            className={cn(buttonVariants({ variant: "primary", size: "md" }), "w-full")}
          >
            Ouvrir la mission
          </Link>
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Fermer
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("break-words", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
