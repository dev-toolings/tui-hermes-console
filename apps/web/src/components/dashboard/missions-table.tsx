"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@boardui/ui";
import { Badge } from "@/components/ui/boardui";
import { RUN_STATUS, formatTokens, type RunStatus } from "@/lib/run-status";

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
] as const;

function badgeTone(status: RunStatus) {
  if (status === "completed") return "success" as const;
  if (status === "running" || status === "starting") return "info" as const;
  if (status === "failed") return "danger" as const;
  return "neutral" as const;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MissionsTable({ rows }: { rows: MissionRow[] }) {
  const [tab, setTab] = useState<string>("all");

  const filtered = useMemo(() => {
    if (tab === "active") return rows.filter((row) => !RUN_STATUS[row.status].terminal);
    if (tab === "done") return rows.filter((row) => row.status === "completed");
    return rows;
  }, [rows, tab]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((row) => !RUN_STATUS[row.status].terminal).length,
      done: rows.filter((row) => row.status === "completed").length,
    }),
    [rows],
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-seam px-4 py-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                <span className="ml-1 text-[0.6875rem] text-muted-foreground tabular-nums">
                  {counts[item.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="overflow-x-auto scrollbar-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mission</TableHead>
              <TableHead className="hidden sm:table-cell">Agent</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="hidden md:table-cell">Mise à jour</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "Aucune conversation en base. Lancez une première mission."
                    : "Aucune mission dans cet état."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const status = RUN_STATUS[row.status];
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[22rem]">
                      <Link
                        href={`/runs/${row.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {row.agentName}
                    </TableCell>
                    <TableCell>
                      <Badge tone={badgeTone(row.status)}>
                        <span aria-hidden className="mr-1">
                          {status.glyph}
                        </span>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatWhen(row.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                      {row.totalTokens
                        ? formatTokens(row.totalTokens)
                        : status.terminal
                          ? "—"
                          : "en cours"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
