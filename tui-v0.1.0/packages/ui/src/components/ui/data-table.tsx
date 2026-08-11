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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"
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
  pageSizeOptions?: readonly number[]
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  rowsPerPageLabel?: string
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
    "h-16 border-b border-border transition-colors last:border-0 hover:bg-transparent data-[state=selected]:bg-transparent",
    selected ? "bg-surface-hover" : "hover:bg-surface-hover dark:hover:bg-transparent"
  )
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  rowSelection = {},
  onRowSelectionChange,
  page,
  pageSize,
  pageSizeOptions = [12, 24, 48, 96],
  onPageChange,
  onPageSizeChange,
  rowsPerPageLabel = "Lignes par page",
  previousLabel,
  nextLabel,
  empty,
  minWidth = "820px",
  toolbar,
  className,
}: DataTableProps<TData>) {
  const pageSizeSelectId = React.useId()
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
  const rows = table.getRowModel().rows
  const placeholderRows = rows.length > 0 ? Math.max(pageSize - rows.length, 0) : 0
  const selectablePageSizes = Array.from(new Set([pageSize, ...pageSizeOptions])).sort(
    (a, b) => a - b,
  )

  const handlePageSizeChange = (value: string) => {
    const nextPageSize = Number(value)
    if (!Number.isFinite(nextPageSize) || nextPageSize <= 0 || !onPageSizeChange) return
    onPageSizeChange(nextPageSize)
    onPageChange(1)
  }

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
            {rows.length > 0 ? (
              <>
                {rows.map((row) => (
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
                ))}
                {Array.from({ length: placeholderRows }, (_, index) => (
                  <TableRow
                    key={`placeholder-${index}`}
                    aria-hidden="true"
                    className={cn(rowClass(false), "pointer-events-none")}
                  >
                    <TableCell colSpan={columns.length} className="py-0" />
                  </TableRow>
                ))}
              </>
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
        <div className="flex flex-1 items-center gap-3">
          {onPageSizeChange ? (
            <div className="flex items-center gap-2">
              <label
                htmlFor={pageSizeSelectId}
                className="whitespace-nowrap text-xs text-muted-foreground"
              >
                {rowsPerPageLabel}
              </label>
              <Select value={`${pageSize}`} onValueChange={handlePageSizeChange}>
                <SelectTrigger id={pageSizeSelectId} size="sm" className="w-16 px-2.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {selectablePageSizes.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <PagerButton disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
            {previousLabel}
          </PagerButton>
        </div>
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
        <div className="flex flex-1 justify-end">
          <PagerButton disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
            {nextLabel}
          </PagerButton>
        </div>
      </div>
    </div>
  )
}

/** Selected row count from TanStack row-selection state. */
export function countRowSelection(selection: RowSelectionState) {
  return Object.values(selection).filter(Boolean).length
}
