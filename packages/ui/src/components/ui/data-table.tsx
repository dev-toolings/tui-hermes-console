"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
} from "@tanstack/react-table"
import { cn } from "../../lib/utils"
import { Checkbox, PagerButton } from "./boardui"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

export type { ColumnDef, RowSelectionState }

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  getRowId: (row: TData) => string
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
  empty?: React.ReactNode
  minWidth?: string
  toolbar?: React.ReactNode
  className?: string
}

/** Reusable checkbox column — pairs with DataTable row selection state. */
export function selectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
        onChange={() => table.toggleAllPageRowsSelected()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onChange={() => row.toggleSelected()} />
    ),
    enableSorting: false,
    enableHiding: false,
  }
}

function rowClass(selected: boolean) {
  return cn(
    "border-b border-border transition-colors last:border-0 hover:bg-transparent data-[state=selected]:bg-transparent",
    selected ? "bg-surface-hover" : "hover:bg-surface-hover dark:hover:bg-transparent"
  )
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  page,
  pageSize,
  onPageChange,
  previousLabel,
  nextLabel,
  empty,
  minWidth = "820px",
  toolbar,
  className,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      rowSelection,
      pagination: { pageIndex: page - 1, pageSize },
    },
    onRowSelectionChange,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex: page - 1, pageSize })
          : updater
      onPageChange(next.pageIndex + 1)
    },
    enableRowSelection: Boolean(onRowSelectionChange),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const pages = table.getPageCount()
  const current = page
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1).slice(0, 6)

  return (
    <div className={className}>
      {toolbar}
      <div className="border-t border-border">
        <Table style={{ minWidth }}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow
                key={group.id}
                className="border-b border-border text-left text-xs text-muted-foreground hover:bg-transparent"
              >
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "py-2.5 font-medium",
                      header.column.id === "select" && "w-10 pl-4",
                      header.column.id === "actions" && "pr-4 text-right"
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={rowClass(row.getIsSelected())}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-2.5",
                        cell.column.id === "select" && "pl-4",
                        cell.column.id === "actions" && "pr-4"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-muted-foreground/70"
                >
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <PagerButton disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          {previousLabel}
        </PagerButton>
        <div className="hidden items-center gap-1 sm:flex">
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              className={cn(
                "size-8 rounded-lg text-sm font-medium tabular-nums transition-colors",
                n === current
                  ? "border border-input bg-card text-foreground shadow-[var(--shadow-xs)]"
                  : "text-muted-foreground hover:bg-surface-hover"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <PagerButton disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
          {nextLabel}
        </PagerButton>
      </div>
    </div>
  )
}

/** Selected row count from TanStack row-selection state. */
export function countRowSelection(selection: RowSelectionState) {
  return Object.values(selection).filter(Boolean).length
}
