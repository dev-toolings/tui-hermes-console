import { Link } from "@/lib/router";
import { PlusIcon } from "lucide-react";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { RUN_STATUS, formatDuration, formatTokens, type RunStatus } from "@console/core/lib/run-status";
import type { MissionsData } from "@/loaders";

function formatWhen(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function runDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return formatDuration(Math.max(0, end - start));
}

export function MissionsScreen({
  data,
  filter,
}: {
  data: MissionsData;
  /** `?filter=` de l'URL — TanStack le valide dans la route et le passe ici. */
  filter?: string;
}) {
  const { threads } = data;

  const rows = threads
    .map((thread) => {
      const status = (thread.latestRun?.status ?? "pending") as RunStatus;
      return {
        id: thread.id,
        title: thread.title,
        agent: thread.agentName,
        status,
        createdAt: formatWhen(thread.updatedAt),
        duration: runDuration(
          thread.latestRun?.startedAt ?? null,
          thread.latestRun?.endedAt ?? null,
        ),
        tokens: thread.latestRun?.usage?.totalTokens ?? null,
      };
    })
    .filter((row) => {
      if (filter === "active") return !RUN_STATUS[row.status].terminal;
      if (filter === "completed") return row.status === "completed";
      if (filter === "failed") return row.status === "failed";
      return true;
    });

  const filters = [
    { label: "Toutes", value: undefined },
    { label: "En cours", value: "active" },
    { label: "Terminées", value: "completed" },
    { label: "Échecs", value: "failed" },
  ] as const;

  return (
    <PageShell>
      <SectionHeading
        title="Historique des missions"
        description="L’historique relisible est conservé par la Console, pas par la durée de vie du runtime."
        action={
          <ButtonLink href="/runs/new" variant="primary">
            <PlusIcon className="size-4" />
            Nouvelle mission
          </ButtonLink>
        }
      />
      <Card>
        <CardSurface className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-seam p-3">
            {filters.map((item) => {
              const active = filter === item.value || (!filter && !item.value);
              const href = item.value ? `/runs?filter=${item.value}` : "/runs";
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
          {rows.length === 0 ? (
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
                  {rows.map((run) => {
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
                        <td className="px-4 py-3 text-muted-foreground">{run.createdAt}</td>
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
        </CardSurface>
      </Card>
    </PageShell>
  );
}
