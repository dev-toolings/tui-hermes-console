"use client";

import { useEffect, useState } from "react";
import type { HermesRuntimeUpdateOperationDto, HermesRuntimeUpdatePlanDto } from "@console/core/types/api";
import {
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  DownloadIcon,
  LoaderCircleIcon,
  SearchIcon,
  ScrollTextIcon,
  SparklesIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { buttonVariants, Input } from "@boardui/ui";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, PageShell, SectionHeading } from "@/components/ui/boardui";
import { toast } from "@/components/ui/toast";
import { publishHermesUpdateState } from "@/components/updates/hermes-update-store";
import type { HermesUpdatesData } from "@/loaders";
import {
  fetchHermesRuntimeUpdateOperation,
  fetchHermesRuntimeUpdateState,
  startHermesRuntimeUpdate,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/router";

type UpdateCategory = "feature" | "improvement" | "suppression" | "other";
type UpdateKind = "all" | "features" | "improvements" | "suppressions";

export type UpdatesSearch = {
  kind: UpdateKind;
  q?: string;
  action?: "update";
  operation?: string;
};

type ReleaseSource = HermesUpdatesData["releases"][number];

type ParsedReleaseItem = {
  id: string;
  text: string;
  section: string;
  category: UpdateCategory;
};

type ParsedRelease = ReleaseSource & {
  isLatest: boolean;
  parsedItems: ParsedReleaseItem[];
};

const KIND_FILTERS = [
  { label: "Tous", value: "all" as const },
  { label: "Features", value: "features" as const },
  { label: "Améliorations", value: "improvements" as const },
  { label: "Suppressions", value: "suppressions" as const },
] as const;

const RELEASE_MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline decoration-primary/35 underline-offset-2 transition-colors hover:decoration-primary"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.78rem] text-foreground">
      {children}
    </code>
  ),
};

function normalize(input: string) {
  return input.toLocaleLowerCase("fr");
}

function categoryTone(category: UpdateCategory) {
  if (category === "feature") return "info";
  if (category === "improvement") return "warning";
  if (category === "suppression") return "danger";
  return "neutral";
}

function categoryLabel(category: UpdateCategory) {
  if (category === "feature") return "Feature";
  if (category === "improvement") return "Amélioration";
  if (category === "suppression") return "Suppression";
  return "Autre";
}

function categoryFromSection(section: string): UpdateCategory {
  const normalized = normalize(section);
  if (
    normalized.includes("add") ||
    normalized.includes("nouve") ||
    normalized.includes("feature")
  ) return "feature";
  if (
    normalized.includes("change") ||
    normalized.includes("improv") ||
    normalized.includes("enhance") ||
    normalized.includes("upgrade") ||
    normalized.includes("fix")
  ) return "improvement";
  if (
    normalized.includes("remove") ||
    normalized.includes("deprecated") ||
    normalized.includes("suppression") ||
    normalized.includes("supprimer") ||
    normalized.includes("breaking")
  ) return "suppression";
  return "other";
}

function categoryFromText(text: string): UpdateCategory {
  const normalized = normalize(text);
  if (
    normalized.includes("remove") ||
    normalized.includes("removed") ||
    normalized.includes("deprecated") ||
    normalized.includes("supprim") ||
    normalized.includes("drop support")
  ) return "suppression";
  if (
    normalized.includes("fix") ||
    normalized.includes("improv") ||
    normalized.includes("enhance") ||
    normalized.includes("upgrade") ||
    normalized.includes("optimi") ||
    normalized.includes("amélior") ||
    normalized.includes("faster") ||
    normalized.includes("reduced")
  ) return "improvement";
  if (
    normalized.includes("add") ||
    normalized.includes("ajout") ||
    normalized.includes("nouvelle") ||
    normalized.includes("new ") ||
    normalized.includes(" now ") ||
    normalized.includes("landed") ||
    normalized.includes("support")
  ) return "feature";
  return "other";
}

function resolveCategory(section: string, text: string): UpdateCategory {
  const sectionCategory = categoryFromSection(section);
  return sectionCategory === "other" ? categoryFromText(text) : sectionCategory;
}

function parseReleaseItems(raw: string): ParsedReleaseItem[] {
  if (!raw.trim()) return [];

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let section = "Notes";
  const items: ParsedReleaseItem[] = [];
  const heading = /^\s*#{1,6}\s+(.+)$/;
  const explicitSection = /^\s*(?:-|\*)\s+\*\*(.+?)\*\*:?$/;
  const bullet = /^\s*(?:-|\*|\d+\.)\s+(.+)$/;

  for (const line of lines) {
    const rawLine = line.trim();
    if (!rawLine) continue;

    const headingMatch = rawLine.match(heading);
    if (headingMatch) {
      section = headingMatch[1].trim();
      continue;
    }

    const explicitSectionMatch = rawLine.match(explicitSection);
    if (explicitSectionMatch) {
      section = explicitSectionMatch[1].trim();
      continue;
    }

    const bulletMatch = rawLine.match(bullet);
    if (!bulletMatch) continue;

    const text = bulletMatch[1].trim();
    if (!text) continue;
    items.push({
      id: `${section}-${items.length}-${text.slice(0, 12)}`,
      text,
      section,
      category: resolveCategory(section, text),
    });
  }

  if (items.length > 0) return items;

  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 4)
    .map((text, index) => ({
      id: `fallback-${index}`,
      text,
      section: "Notes",
      category: categoryFromText(text),
    }));
}

function parseRelease(release: ReleaseSource, index: number): ParsedRelease {
  return {
    ...release,
    isLatest: index === 0,
    parsedItems: parseReleaseItems(release.body ?? ""),
  };
}

function releaseMatchesKind(item: ParsedReleaseItem, kind: UpdateKind) {
  if (kind === "all") return true;
  if (kind === "features") return item.category === "feature";
  if (kind === "improvements") return item.category === "improvement";
  return item.category === "suppression";
}

function itemMatchesQuery(item: ParsedReleaseItem, query: string) {
  if (!query) return true;
  return normalize(item.text).includes(query) || normalize(item.section).includes(query);
}

function releaseMatchesMeta(release: ParsedRelease, query: string) {
  if (!query) return true;
  return [
    release.tagName,
    release.name ?? "",
    release.htmlUrl,
    release.publishedAt,
    release.createdAt,
  ].some((candidate) => normalize(candidate).includes(query));
}

function formattedDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function categoryIcon(category: UpdateCategory) {
  if (category === "feature") return SparklesIcon;
  if (category === "improvement") return WrenchIcon;
  if (category === "suppression") return XCircleIcon;
  return ScrollTextIcon;
}

function updatesHref(search: UpdatesSearch) {
  const params = new URLSearchParams();
  if (search.kind !== "all") params.set("kind", search.kind);
  if (search.q?.trim()) params.set("q", search.q.trim());
  const query = params.toString();
  return query ? `/updates?${query}` : "/updates";
}

function countCategories(items: ParsedReleaseItem[]) {
  return items.reduce(
    (counts, item) => {
      counts.all += 1;
      if (item.category === "feature") counts.features += 1;
      if (item.category === "improvement") counts.improvements += 1;
      if (item.category === "suppression") counts.suppressions += 1;
      return counts;
    },
    { all: 0, features: 0, improvements: 0, suppressions: 0 },
  );
}

export function UpdatesScreen({
  data,
  search,
}: {
  data: HermesUpdatesData;
  search: UpdatesSearch;
}) {
  const router = useRouter();
  const [updatePlan, setUpdatePlan] = useState<HermesRuntimeUpdatePlanDto | null>(null);
  const [operation, setOperation] = useState<HermesRuntimeUpdateOperationDto | null>(null);
  const [showUpdatePanel, setShowUpdatePanel] = useState(
    search.action === "update" || Boolean(search.operation),
  );
  const showUpdatePanelFromRoute = search.action === "update" || Boolean(search.operation);
  const isUpdatePanelVisible = showUpdatePanel || showUpdatePanelFromRoute;
  const [updating, setUpdating] = useState(false);
  const query = normalize(search.q?.trim() ?? "");
  const parsedReleases = data.releases.map((release, index) => parseRelease(release, index));
  const latest = parsedReleases[0];
  const allCounts = countCategories(parsedReleases.flatMap((release) => release.parsedItems));
  const latestCounts = latest ? countCategories(latest.parsedItems) : null;

  const visible = parsedReleases
    .map((release) => {
      const matchingKind = release.parsedItems.filter((item) =>
        releaseMatchesKind(item, search.kind),
      );
      const matchesMeta = releaseMatchesMeta(release, query);
      const filteredItems = query && !matchesMeta
        ? matchingKind.filter((item) => itemMatchesQuery(item, query))
        : matchingKind;
      return filteredItems.length > 0 || matchesMeta
        ? { ...release, filteredItems }
        : null;
    })
    .filter(
      (release): release is ParsedRelease & { filteredItems: ParsedReleaseItem[] } =>
        release !== null,
    );

  const visibleNoteCount = visible.reduce(
    (total, release) => total + release.filteredItems.length,
    0,
  );

  useEffect(() => {
    let active = true;
    void fetchHermesRuntimeUpdateState()
      .then(async ({ plan, activeOperation }) => {
        if (!active) return;
        const requestedOperation = search.operation && activeOperation?.id !== search.operation
          ? await fetchHermesRuntimeUpdateOperation(search.operation).catch(() => null)
          : activeOperation;
        if (!active) return;
        setUpdatePlan(plan);
        setOperation(requestedOperation);
        setUpdating(Boolean(requestedOperation && !["succeeded", "rolled_back", "failed", "recovery_required"].includes(requestedOperation.status)));
        publishHermesUpdateState(plan, requestedOperation);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [search.operation]);

  useEffect(() => {
    if (!operation || ["succeeded", "rolled_back", "failed", "recovery_required"].includes(operation.status)) return;
    const events = new EventSource(`/api/runtime/update/${encodeURIComponent(operation.id)}/events`);
    events.addEventListener("update", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { operation: HermesRuntimeUpdateOperationDto };
      setOperation(payload.operation);
      if (updatePlan) publishHermesUpdateState(updatePlan, payload.operation);
      if (["succeeded", "rolled_back", "failed", "recovery_required"].includes(payload.operation.status)) {
        events.close();
        setUpdating(false);
        if (payload.operation.status === "succeeded") toast.success("Hermes est à jour et le runtime est sain.");
        else toast.error(payload.operation.error?.message ?? payload.operation.message);
        void fetchHermesRuntimeUpdateState().then(({ plan }) => {
          setUpdatePlan(plan);
          publishHermesUpdateState(plan, payload.operation);
        }).catch(() => undefined);
      }
    });
    return () => events.close();
  }, [operation?.id, operation?.status, updatePlan]);

  async function updateHermes() {
    if (updating || !updatePlan?.latestTag) return;
    setUpdating(true);
    try {
      const nextOperation = await startHermesRuntimeUpdate({
        expectedConfigRevision: updatePlan.configRevision,
        targetTag: updatePlan.latestTag,
        trigger: "manual",
      });
      setOperation(nextOperation);
      router.replace(updatesHref({ ...search, action: undefined, operation: nextOperation.id }));
      publishHermesUpdateState(updatePlan, nextOperation);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La mise à jour Hermes a échoué.");
      setUpdating(false);
    }
  }

  return (
    <PageShell>
      <SectionHeading
        title="Mises à jour Hermes"
          description="Les nouveautés Hermes, classées sans changelog brut."
        action={
          <div className="flex flex-wrap items-center gap-2">
          {updatePlan?.available && updatePlan.supported && !showUpdatePanel ? (
              <button
                type="button"
                disabled={updating}
                onClick={() => setShowUpdatePanel(true)}
                className={cn(buttonVariants({ variant: "primary", size: "md" }), "disabled:cursor-wait disabled:opacity-70")}
              >
                {updating ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <DownloadIcon className="size-3.5" aria-hidden="true" />
                )}
                {updating ? "Mise à jour…" : "Mettre à jour"}
              </button>
            ) : null}
            <a
              href="https://github.com/NousResearch/hermes-agent/releases"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Releases GitHub
              <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        }
      />

      {(isUpdatePanelVisible || operation) && updatePlan && operation?.status !== "succeeded" ? (
        <section id="update-control" className="mb-5 rounded-xl border border-seam bg-card px-4 py-4 shadow-board-card" aria-live="polite">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {operation ? operation.message : `Mettre Hermes à jour vers ${updatePlan.latestVersion ?? updatePlan.latestTag ?? "la dernière version"}`}
              </p>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                {operation
                  ? `${operation.method} · ${operation.previousVersion ?? "version inconnue"} → ${operation.targetVersion ?? operation.targetTag}`
                  : `${updatePlan.transport === "ssh" ? "Hôte distant via SSH" : "Hôte local"} · ${updatePlan.method} · backup et rollback automatiques en cas d’échec.`}
              </p>
              {!operation && updatePlan.available ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Le runtime sera brièvement indisponible. Les nouvelles missions seront bloquées pendant l’opération.
                </p>
              ) : null}
              {!updatePlan.supported && updatePlan.reason ? (
                <p className="mt-2 text-xs text-destructive">{updatePlan.reason}</p>
              ) : null}
            </div>
            {(!operation || operation.status === "rolled_back" || operation.status === "failed") && updatePlan.available && updatePlan.supported ? (
              <button
                type="button"
                disabled={updating}
                onClick={() => void updateHermes()}
                className={cn(buttonVariants({ variant: "primary", size: "md" }), "shrink-0 disabled:cursor-wait disabled:opacity-70")}
              >
                {updating ? <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <DownloadIcon className="size-3.5" aria-hidden="true" />}
                {updating
                  ? "Démarrage…"
                  : operation
                    ? "Réessayer la mise à jour"
                    : "Lancer la mise à jour"}
              </button>
            ) : null}
          </div>
          {operation ? (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`Progression ${operation.progress} %`}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${operation.progress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="capitalize">{operation.phase.replaceAll("_", " ")}</span>
                <span className="font-mono">{operation.progress} %</span>
              </div>
              {operation.error ? <p className="mt-2 text-xs text-destructive">{operation.error.message}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {latest ? (
        <section className="overflow-hidden rounded-2xl border border-seam bg-card">
          <div className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="success">Dernière version</Badge>
                <span className="font-mono text-xs text-muted-foreground">{latest.tagName}</span>
              </div>
              <h2 className="max-w-3xl text-lg font-semibold tracking-tight text-foreground">
                {latest.name ?? latest.tagName}
              </h2>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
                Publiée le {formattedDate(latest.publishedAt)}
              </div>
              {updatePlan?.available ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Installée : <span className="font-mono text-foreground">{updatePlan.currentVersion ?? "inconnue"}</span>
                  {updatePlan.latestVersion ? <> · Disponible : <span className="font-mono text-foreground">{updatePlan.latestVersion}</span></> : null}
                  {!updatePlan.supported && updatePlan.reason ? <> · {updatePlan.reason}</> : null}
                </p>
              ) : null}
            </div>

            {latestCounts ? (
              <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs lg:justify-end">
                <div>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-foreground">{latestCounts.all}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Features</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-foreground">{latestCounts.features}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Améliorations</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-foreground">{latestCounts.improvements}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-label="Filtres des mises à jour" className="rounded-xl border border-seam bg-card p-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Type de mise à jour">
            {KIND_FILTERS.map((filter) => {
              const active = search.kind === filter.value;
              return (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => router.replace(updatesHref({ ...search, kind: filter.value }))}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                    active
                      ? "bg-ai-tertiary text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {filter.label}
                  <span
                    className={cn(
                      "font-mono text-[0.68rem]",
                      active ? "text-foreground/70" : "text-muted-foreground/70",
                    )}
                  >
                    {allCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="relative block w-full lg:max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Rechercher dans les notes</span>
            <Input
              type="search"
              value={search.q ?? ""}
              onChange={(event) =>
                router.replace(updatesHref({ ...search, q: event.target.value }))
              }
              placeholder="Version, titre ou fonctionnalité"
              className="pl-9"
            />
          </label>
        </div>
        <p className="mt-2 px-1 text-[0.72rem] text-muted-foreground" aria-live="polite">
          {visible.length} version{visible.length > 1 ? "s" : ""}, {visibleNoteCount} note{visibleNoteCount > 1 ? "s" : ""}
        </p>
      </section>

      <section aria-label="Historique des versions" className="overflow-hidden rounded-2xl border border-seam bg-card">
        {visible.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <SearchIcon className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Aucune mise à jour trouvée</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Modifiez la recherche ou choisissez un autre type de changement.
            </p>
          </div>
        ) : (
          visible.map((release) => {
            const dominantCategory =
              release.filteredItems[0]?.category ?? release.parsedItems[0]?.category ?? "other";
            const Icon = categoryIcon(dominantCategory);

            return (
              <details
                key={release.id}
                className="group border-b border-seam last:border-b-0"
                open={release.isLatest}
              >
                <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-open:bg-ai-tertiary group-open:text-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground">{release.tagName}</span>
                      {release.isLatest ? <Badge tone="success">Dernière</Badge> : null}
                      <Badge tone="neutral">
                        {release.filteredItems.length} note{release.filteredItems.length > 1 ? "s" : ""}
                      </Badge>
                    </span>
                    <span className="mt-1 block truncate text-sm text-foreground">
                      {release.name || "Notes de version"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
                    {formattedDate(release.publishedAt)}
                  </span>
                  <ChevronDownIcon
                    className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>

                <div className="border-t border-seam bg-surface-sunken/35">
                  {release.filteredItems.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-muted-foreground">
                      Aucun détail ne correspond à ce filtre pour cette version.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {release.filteredItems.map((item) => (
                        <li
                          key={item.id}
                          className="grid gap-3 px-4 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:px-5"
                        >
                          <div className="flex flex-wrap content-start items-center gap-1.5 sm:block">
                            <Badge tone={categoryTone(item.category)}>{categoryLabel(item.category)}</Badge>
                            <p className="mt-0 truncate text-[0.7rem] text-muted-foreground sm:mt-2">
                              {item.section}
                            </p>
                          </div>
                          <div className="min-w-0 text-sm leading-6 text-foreground/90 [&_p]:m-0">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={RELEASE_MARKDOWN_COMPONENTS}
                            >
                              {item.text}
                            </ReactMarkdown>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <footer className="flex flex-col gap-2 border-t border-seam px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <span className="text-muted-foreground">
                      Publiée le {formattedDate(release.publishedAt)}
                    </span>
                    <a
                      href={release.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Lire la release complète
                      <ArrowUpRightIcon className="size-3" aria-hidden="true" />
                    </a>
                  </footer>
                </div>
              </details>
            );
          })
        )}
      </section>
    </PageShell>
  );
}
