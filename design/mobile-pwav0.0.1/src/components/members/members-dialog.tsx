import { useMemo, useState } from "react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  flexRender,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
  type Column,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, SearchIcon, UsersRoundIcon } from "lucide-react";
import type { Member } from "../../state/console-store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

// Declared once outside the component: the feature set is static, and TanStack
// rebuilds the table when this object changes identity.
const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { text: sortFn_text },
});

const column = createColumnHelper<typeof features, Member>();

function SortHeader<TValue>({
  column,
  label,
}: {
  column: Column<typeof features, Member, TValue>;
  label: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3" />
      ) : (
        <ArrowUpDownIcon className="size-3 opacity-50" />
      )}
    </Button>
  );
}

const columns = column.columns([
  column.accessor("name", {
    header: ({ column }) => <SortHeader column={column} label="Membre" />,
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-200)] text-[10px] font-semibold text-[var(--accent-700)]">
          {row.original.initials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {row.original.name}
          </span>
          {/* The role column is dropped on small screens; it rides here instead
              so the table never needs a horizontal scroll on a phone. */}
          <span className="truncate text-xs text-muted-foreground sm:hidden">
            {row.original.role}
          </span>
        </span>
      </span>
    ),
  }),
  column.accessor("role", {
    header: ({ column }) => <SortHeader column={column} label="Rôle" />,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
  }),
  column.accessor("state", {
    header: ({ column }) => <SortHeader column={column} label="État" />,
    cell: ({ getValue }) => (
      <Badge
        variant="secondary"
        className="bg-[var(--state-info)] text-[var(--state-info-fg)]"
      >
        {getValue()}
      </Badge>
    ),
  }),
]);

export function MembersDialog({
  open,
  onOpenChange,
  members,
  workspaceName,
  onSelectMember,
  onOpenPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  workspaceName: string;
  /** Focuses that member on the members route. */
  onSelectMember: (name: string) => void;
  onOpenPage: () => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  // Row identity is the member name, which is also the app's member key.
  const data = useMemo(() => members, [members]);

  const table = useTable({
    features,
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getRowId: (member) => member.name,
  });

  const rows = table.getRowModel().rows;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Membres de l'espace</DialogTitle>
          <DialogDescription>
            {members.length} membre{members.length > 1 ? "s" : ""} dans{" "}
            {workspaceName}. Sélectionne un membre pour ouvrir sa fiche.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Filtrer par nom, rôle ou état…"
            aria-label="Filtrer les membres"
            className="pl-8"
          />
        </div>

        <div className="max-h-[46vh] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-[var(--card)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={`px-3 ${header.column.id === "role" ? "hidden sm:table-cell" : ""}`}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onSelectMember(row.original.name)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelectMember(row.original.name);
                    }}
                    className="cursor-pointer outline-none focus-visible:bg-[var(--surface-hover)]"
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={`px-3 py-2.5 ${cell.column.id === "role" ? "hidden sm:table-cell" : ""}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Aucun membre ne correspond.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button onClick={onOpenPage}>
            <UsersRoundIcon />
            Gérer les membres
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
