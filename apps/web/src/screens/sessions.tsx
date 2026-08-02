"use client";

import { ActivityIcon, MessageSquareIcon, SearchIcon } from "lucide-react";
import { Input } from "@boardui/ui";
import { Badge, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { Link, useRouter } from "@/lib/router";
import { cn } from "@/lib/cn";
import { runStatusStyle } from "@console/core/lib/run-status";
import type { ThreadListItemDto, ThreadSource } from "@console/core/modules/runs/types";
import type { SessionsData } from "@/loaders";

export type SessionsSearch = {
  source?: ThreadSource;
  q?: string;
};

const SOURCE_FILTERS = [
  { label: "Toutes", value: undefined },
  { label: "Chat", value: "chat" },
  { label: "Missions", value: "mission" },
] as const;

export function sessionDestination(thread: Pick<ThreadListItemDto, "id" | "source">) {
  return thread.source === "chat" ? `/chat/${thread.id}` : `/runs/${thread.id}`;
}

export function matchesSessionSearch(thread: ThreadListItemDto, search: SessionsSearch) {
  if (search.source && thread.source !== search.source) return false;
  const query = search.q?.trim().toLocaleLowerCase("fr");
  if (!query) return true;
  return [thread.title, thread.agentName, thread.model, thread.provider]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase("fr").includes(query));
}

function searchHref(search: SessionsSearch) {
  const params = new URLSearchParams();
  if (search.source) params.set("source", search.source);
  if (search.q?.trim()) params.set("q", search.q.trim());
  const query = params.toString();
  return query ? `/sessions?${query}` : "/sessions";
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionsScreen({
  data,
  search,
}: {
  data: SessionsData;
  search: SessionsSearch;
}) {
  const router = useRouter();
  const visible = data.threads.filter((thread) => matchesSessionSearch(thread, search));

  return (
    <PageShell>
      <SectionHeading
        title="Sessions"
        description="Retrouvez les espaces conversationnels et les fils de mission conservés par la Console."
      />

      <Card>
        <CardSurface className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-seam p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1" aria-label="Filtrer les sessions par origine">
              {SOURCE_FILTERS.map((filter) => {
                const active = search.source === filter.value;
                return (
                  <button
                    key={filter.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => router.replace(searchHref({ ...search, source: filter.value }))}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-ai-tertiary text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>

            <label className="relative block w-full sm:max-w-xs">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Rechercher une session</span>
              <Input
                type="search"
                value={search.q ?? ""}
                onChange={(event) => router.replace(searchHref({ ...search, q: event.target.value }))}
                placeholder="Titre, agent ou modèle"
                className="pl-9"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">Aucune session trouvée</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Modifiez la recherche ou démarrez un échange depuis Chat.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((thread) => {
                const status = thread.latestRun ? runStatusStyle(thread.latestRun.status, thread.latestRun.error) : null;
                const SourceIcon = thread.source === "chat" ? MessageSquareIcon : ActivityIcon;
                return (
                  <li key={thread.id}>
                    <Link
                      href={sessionDestination(thread)}
                      className="grid min-w-0 gap-3 px-4 py-3 transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.45fr)_auto] sm:items-center"
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <SourceIcon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{thread.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {thread.agentName} · {thread.provider ? `${thread.provider} / ` : ""}{thread.model}
                          </span>
                        </span>
                      </span>

                      <span className="flex flex-wrap items-center gap-2 sm:justify-start">
                        <Badge tone="neutral">{thread.source === "chat" ? "Chat" : "Mission"}</Badge>
                        {status ? (
                          <Badge tone={thread.latestRun?.status === "completed" ? "success" : thread.latestRun?.status === "failed" ? "danger" : "info"}>
                            <span aria-hidden className="mr-1">{status.glyph}</span>
                            {status.label}
                          </Badge>
                        ) : null}
                      </span>

                      <time className="text-xs text-muted-foreground sm:text-right" dateTime={thread.updatedAt}>
                        {formatWhen(thread.updatedAt)}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardSurface>
      </Card>
    </PageShell>
  );
}
