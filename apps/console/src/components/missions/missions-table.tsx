/**
 * La vue tableau de `/runs`, telle qu'elle existait dans `screens/missions.tsx`.
 *
 * Elle n'est plus la vue par défaut mais reste la seule à donner durée et tokens
 * côte à côte sur toutes les missions, quel que soit leur état. Ses pilules
 * `?filter=` sont conservées : le kanban segmente déjà par statut, le tableau
 * non.
 */
import { Link } from "@/lib/router";
import { PlusIcon } from "lucide-react";
import { Badge, ButtonLink } from "@/components/ui/boardui";
import { RUN_STATUS, formatTokens } from "@console/core/lib/run-status";
import { formatWhen, type MissionRow } from "./mission-row";

const FILTERS = [
  { label: "Toutes", value: undefined },
  { label: "En cours", value: "active" },
  { label: "Terminées", value: "completed" },
  { label: "Échecs", value: "failed" },
] as const;

function matchesFilter(row: MissionRow, filter?: string) {
  if (filter === "active") return !RUN_STATUS[row.status].terminal;
  if (filter === "completed") return row.status === "completed";
  if (filter === "failed") return row.status === "failed";
  return true;
}

export function MissionsTable({
  rows,
  filter,
}: {
  rows: MissionRow[];
  /** `?filter=` de l'URL — TanStack le valide dans la route et le passe ici. */
  filter?: string;
}) {
  const visible = rows.filter((row) => matchesFilter(row, filter));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-seam p-3">
        {FILTERS.map((item) => {
          const active = filter === item.value || (!filter && !item.value);
          // La bascule de vue vit dans l'URL : la perdre ici renverrait au kanban.
          const href = item.value ? `/runs?view=table&filter=${item.value}` : "/runs?view=table";
          return (
            <Link
              key={item.label}
              href={href}
              className={`rounded-full px-3 py-1.5 text-[0.75rem] font-medium ${
                active ? "bg-ai-tertiary text-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium">Aucune conversation</p>
          <p className="mt-1 text-[0.75rem] text-muted-foreground">
            Lancez une mission depuis un agent pour peupler l’historique PostgreSQL.
          </p>
          <ButtonLink href="/runs/new" variant="primary" className="mt-4 inline-flex">
            <PlusIcon className="size-4" />
            Nouvelle mission
          </ButtonLink>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-subtle">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-seam text-[0.6875rem] font-medium text-muted-foreground">
                <th className="px-4 py-3">Mission</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Mise à jour</th>
                <th className="px-4 py-3 text-right">Durée</th>
                <th className="px-4 py-3 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((run) => {
                const status = RUN_STATUS[run.status];
                return (
                  <tr key={run.id} className="text-[0.75rem] transition-colors hover:bg-muted">
                    <td className="px-4 py-3">
                      <Link href={`/runs/${run.id}`} className="block max-w-md">
                        <span className="block truncate font-medium">{run.title}</span>
                        <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
                          {run.agent}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          run.status === "completed"
                            ? "success"
                            : run.status === "running" || run.status === "starting"
                              ? "info"
                              : run.status === "failed"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        <span aria-hidden className="mr-1">
                          {status.glyph}
                        </span>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatWhen(run.updatedAt)}</td>
                    <td className="px-4 py-3 text-right font-mono">{run.duration}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {run.tokens ? formatTokens(run.tokens) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
