"use client";

import { ActivityIcon, MessageSquareIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Input, ToggleGroup, ToggleGroupItem } from "@boardui/ui";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { MissionsKanban } from "@/components/missions/missions-kanban";
import { MissionsTable } from "@/components/missions/missions-table";
import { toMissionRows } from "@/components/missions/mission-row";
import { Link, useRouter } from "@/lib/router";
import { cn } from "@/lib/cn";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";
import { runStatusStyle } from "@console/core/lib/run-status";
import type { ThreadListItemDto, ThreadSource } from "@console/core/modules/runs/types";
import type { SessionsData } from "@/loaders";

export type SessionsView = "list" | "kanban";

export type SessionsSearch = {
  source?: ThreadSource;
  view?: SessionsView;
  filter?: string;
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

export function resolvedSessionsView(search: SessionsSearch): SessionsView {
  if (search.source !== "mission") return "list";
  return search.view ?? "kanban";
}

export function sessionsSearchForView(
  search: SessionsSearch,
  view: SessionsView,
): SessionsSearch {
  return {
    ...search,
    source: view === "kanban" ? "mission" : search.source,
    view,
  };
}

export function matchesSessionSearch(thread: ThreadListItemDto, search: SessionsSearch) {
  if (search.source && thread.source !== search.source) return false;
  const query = search.q?.trim().toLocaleLowerCase("fr");
  if (!query) return true;
  return [thread.title, thread.agentName, thread.model, thread.provider]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase("fr").includes(query));
}

export function sessionsHref(search: SessionsSearch) {
  const params = new URLSearchParams();
  if (search.source) params.set("source", search.source);
  if (search.source === "mission" && search.view) params.set("view", search.view);
  if (search.source === "mission" && search.filter) params.set("filter", search.filter);
  if (search.q?.trim()) params.set("q", search.q.trim());
  const query = params.toString();
  return query ? `/sessions?${query}` : "/sessions";
}

export function SessionsViewToggle({
  view,
  onViewChange,
}: {
  view: SessionsView;
  onViewChange: (view: SessionsView) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(next) => {
        if (next === "list" || next === "kanban") onViewChange(next);
      }}
      variant="outline"
      size="sm"
      aria-label="Vue des sessions"
    >
      <ToggleGroupItem value="list">Liste</ToggleGroupItem>
      <ToggleGroupItem value="kanban">Kanban</ToggleGroupItem>
    </ToggleGroup>
  );
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
  const capabilities = readPersonaCapabilities();
  const canCreate = capabilities.has("thread.create");
  const canCancel = capabilities.has("run.cancel");
  const canRetry = capabilities.has("run.retry");
  const view = resolvedSessionsView(search);
  const visible = data.threads.filter((thread) => matchesSessionSearch(thread, search));
  const missionRows = toMissionRows(visible);

  return (
    <PageShell>
      <SectionHeading
        title="Sessions"
        description="Conversations et missions sont réunies dans un même historique relisible."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SessionsViewToggle
              view={view}
              onViewChange={(next) => {
                router.replace(sessionsHref(sessionsSearchForView(search, next)));
              }}
            />
            {canCreate ? (
              <ButtonLink href="/tasks/new" variant="primary">
                <PlusIcon className="size-4" />
                Nouvelle tâche
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardSurface className="p-0">
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1" aria-label="Filtrer les sessions par origine">
              {SOURCE_FILTERS.map((sourceFilter) => {
                const active = search.source === sourceFilter.value;
                return (
                  <button
                    key={sourceFilter.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => router.replace(sessionsHref({
                      ...search,
                      source: sourceFilter.value,
                      view: sourceFilter.value === "mission" ? search.view : undefined,
                      filter: sourceFilter.value === "mission" ? search.filter : undefined,
                    }))}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-ai-tertiary text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {sourceFilter.label}
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
                onChange={(event) => router.replace(sessionsHref({ ...search, q: event.target.value }))}
                placeholder="Titre, agent ou modèle"
                className="pl-9"
              />
            </label>
          </div>
        </CardSurface>
      </Card>

      {search.source === "mission" && view === "kanban" ? (
        <MissionsKanban
          rows={missionRows}
          canCreate={canCreate}
          canCancel={canCancel}
          canRetry={canRetry}
        />
      ) : search.source === "mission" ? (
        <Card>
          <CardSurface className="overflow-hidden p-0">
            <MissionsTable
              rows={missionRows}
              filter={search.filter}
              filterHref={(filter) => sessionsHref({
                ...search,
                source: "mission",
                view: "list",
                filter,
              })}
            />
          </CardSurface>
        </Card>
      ) : (
        <SessionsList threads={visible} />
      )}
    </PageShell>
  );
}

function SessionsList({ threads }: { threads: ThreadListItemDto[] }) {
  return (
    <Card>
      <CardSurface className="overflow-hidden p-0">
        {threads.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">Aucune session trouvée</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Modifiez la recherche ou démarrez un échange depuis Chat.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map((thread) => {
              const status = thread.latestRun
                ? runStatusStyle(thread.latestRun.status, thread.latestRun.error)
                : null;
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
  );
}
