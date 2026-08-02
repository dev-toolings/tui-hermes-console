"use client";

import { ChevronDownIcon, SearchIcon, ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import { Input } from "@boardui/ui";
import { Badge, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/router";
import type { AuditEntryDto, AuditDecision } from "@console/core/modules/audit/types";
import type { AuditData } from "@/loaders";

export type AuditSearch = {
  decision?: AuditDecision;
  resource?: string;
  q?: string;
};

const DECISION_FILTERS = [
  { label: "Toutes", value: undefined },
  { label: "Autorisées", value: "allowed" },
  { label: "Refusées", value: "denied" },
] as const;

export function matchesAuditSearch(entry: AuditEntryDto, search: AuditSearch) {
  if (search.decision && entry.decision !== search.decision) return false;
  if (search.resource && entry.resourceType !== search.resource) return false;
  const query = search.q?.trim().toLocaleLowerCase("fr");
  if (!query) return true;
  return [
    entry.action,
    entry.resourceType,
    entry.resourceId,
    entry.actorUserId,
    entry.actorRole,
    entry.reasonCode,
    entry.correlationId,
  ].some((value) => value.toLocaleLowerCase("fr").includes(query));
}

function searchHref(search: AuditSearch) {
  const params = new URLSearchParams();
  if (search.decision) params.set("decision", search.decision);
  if (search.resource) params.set("resource", search.resource);
  if (search.q?.trim()) params.set("q", search.q.trim());
  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function JsonState({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-surface-sunken p-3 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditScreen({ data, search }: { data: AuditData; search: AuditSearch }) {
  const router = useRouter();
  const resources = [...new Set(data.entries.map((entry) => entry.resourceType))].sort();
  const visible = data.entries.filter((entry) => matchesAuditSearch(entry, search));

  return (
    <PageShell>
      <SectionHeading
        title="Journal d’audit"
        description="Les 200 derniers événements immuables du site actif, du plus récent au plus ancien."
      />

      <Card>
        <CardSurface className="overflow-hidden p-0">
          <div className="grid gap-3 border-b border-seam p-3 lg:grid-cols-[auto_minmax(12rem,0.35fr)_minmax(16rem,0.65fr)] lg:items-center">
            <div className="flex flex-wrap gap-1" aria-label="Filtrer le journal par décision">
              {DECISION_FILTERS.map((filter) => {
                const active = search.decision === filter.value;
                return (
                  <button
                    key={filter.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => router.replace(searchHref({ ...search, decision: filter.value }))}
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

            <label>
              <span className="sr-only">Type de ressource</span>
              <select
                value={search.resource ?? ""}
                onChange={(event) => router.replace(searchHref({ ...search, resource: event.target.value || undefined }))}
                className="h-9 w-full rounded-[10px] border border-input bg-control px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Toutes les ressources</option>
                {resources.map((resource) => <option key={resource} value={resource}>{resource}</option>)}
              </select>
            </label>

            <label className="relative block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Rechercher dans le journal</span>
              <Input
                type="search"
                value={search.q ?? ""}
                onChange={(event) => router.replace(searchHref({ ...search, q: event.target.value }))}
                placeholder="Action, acteur, ressource ou corrélation"
                className="pl-9"
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">Aucun événement trouvé</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le journal reste inchangé ; seuls les filtres courants ne retournent rien.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((entry) => {
                const allowed = entry.decision === "allowed";
                const DecisionIcon = allowed ? ShieldCheckIcon : ShieldXIcon;
                return (
                  <details key={entry.eventId} className="group">
                    <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors hover:bg-muted sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                      <span className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        allowed ? "bg-pos-100 text-pos-700" : "bg-neg-100 text-neg-700",
                      )}>
                        <DecisionIcon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-medium">{entry.action}</span>
                          <Badge tone={allowed ? "success" : "danger"}>
                            {allowed ? "Autorisée" : "Refusée"}
                          </Badge>
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {entry.resourceType} · {entry.resourceId} · {entry.actorRole}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground sm:text-right">
                        <span className="block font-mono">#{entry.sequence}</span>
                        <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
                      </span>
                      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                    </summary>

                    <div className="grid gap-4 border-t border-border bg-surface-sunken/40 px-4 py-4 lg:grid-cols-2">
                      <JsonState label="État avant" value={entry.beforeState} />
                      <JsonState label="État après" value={entry.afterState} />
                      <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:col-span-2">
                        <div><dt className="text-muted-foreground">Acteur</dt><dd className="break-all font-mono">{entry.actorUserId}</dd></div>
                        <div><dt className="text-muted-foreground">Motif</dt><dd className="font-mono">{entry.reasonCode}</dd></div>
                        <div><dt className="text-muted-foreground">Corrélation</dt><dd className="break-all font-mono">{entry.correlationId}</dd></div>
                        <div><dt className="text-muted-foreground">Enregistré</dt><dd>{formatTimestamp(entry.recordedAt)}</dd></div>
                        <div><dt className="text-muted-foreground">Hash précédent</dt><dd className="break-all font-mono">{entry.previousHash ?? "Premier événement"}</dd></div>
                        <div><dt className="text-muted-foreground">Hash de l’entrée</dt><dd className="break-all font-mono">{entry.entryHash}</dd></div>
                      </dl>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </CardSurface>
      </Card>
    </PageShell>
  );
}
