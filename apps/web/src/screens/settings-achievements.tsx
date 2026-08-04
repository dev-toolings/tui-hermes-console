import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrainCircuitIcon,
  CalendarIcon,
  GlobeIcon,
  LoaderCircleIcon,
  LockIcon,
  PencilLineIcon,
  RefreshCwIcon,
  RocketIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  TriangleAlertIcon,
  TrophyIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";
import { SettingsContent } from "@/components/settings/settings-content";
import { fetchAchievements, fetchAchievementsScanStatus } from "@/lib/api";
import type {
  HermesAchievementDto,
  HermesAchievementsScanStatusDto,
} from "@console/core/types/api";
import type { AchievementsData } from "@/loaders";

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_MS = 6 * 60_000;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Agent Autonomy": RocketIcon,
  "Debugging Chaos": TriangleAlertIcon,
  "Vibe Coding": PencilLineIcon,
  "Hermes Native": SparklesIcon,
  "Research/Web": GlobeIcon,
  "Tool Mastery": TerminalIcon,
  "Model Lore": BrainCircuitIcon,
  Lifestyle: CalendarIcon,
};

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TIER_TONES: Record<string, BadgeTone> = {
  Copper: "warning",
  Silver: "neutral",
  Gold: "warning",
  Diamond: "info",
  Olympian: "success",
};

const STATE_LABELS: Record<HermesAchievementDto["state"], string> = {
  unlocked: "Débloqué",
  discovered: "Découvert",
  secret: "Secret",
};

function clampPct(value: number | null): number {
  if (value === null || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function SettingsAchievementsScreen({ data }: { data: AchievementsData }) {
  const [view, setView] = useState(data);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const dto = view.achievements;
  const achievements = dto.achievements;
  const scanStatus = view.scanStatus;
  const scanning =
    scanStatus.state === "running" ||
    scanStatus.state === "pending" ||
    scanStatus.snapshotStale;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const [nextAchievements, nextStatus] = await Promise.all([
        fetchAchievements(),
        fetchAchievementsScanStatus(),
      ]);
      setView({ achievements: nextAchievements, scanStatus: nextStatus });
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : "Impossible de rafraîchir les badges.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Tant qu'un scan est en cours ou que le snapshot est périmé, on surveille
  // `/scan-status` puis on rechargé les badges une fois le scan terminé.
  useEffect(() => {
    if (!scanning) return;

    const startedAt = Date.now();
    const interval = window.setInterval(async () => {
      if (Date.now() - startedAt > POLL_MAX_MS) {
        window.clearInterval(interval);
        return;
      }
      try {
        const status: HermesAchievementsScanStatusDto = await fetchAchievementsScanStatus();
        setView((current) => ({ ...current, scanStatus: status }));
        if (status.state === "idle" && !status.snapshotStale) {
          window.clearInterval(interval);
          const [nextAchievements, nextStatus] = await Promise.all([
            fetchAchievements(),
            fetchAchievementsScanStatus(),
          ]);
          setView({ achievements: nextAchievements, scanStatus: nextStatus });
        }
      } catch {
        // Dashboard temporairement injoignable : on réessaie au tick suivant.
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [scanning]);

  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const filtered = useMemo(
    () =>
      normalizedQuery
        ? achievements.filter((achievement) =>
            `${achievement.name} ${achievement.description} ${achievement.category}`
              .toLocaleLowerCase("fr")
              .includes(normalizedQuery),
          )
        : achievements,
    [achievements, normalizedQuery],
  );

  const groups = useMemo(() => {
    const map = new Map<string, HermesAchievementDto[]>();
    for (const achievement of filtered) {
      const key = achievement.category || "Autres";
      const bucket = map.get(key);
      if (bucket) bucket.push(achievement);
      else map.set(key, [achievement]);
    }
    return [...map.entries()];
  }, [filtered]);

  const counters = [
    { label: "Débloqués", value: dto.unlockedCount, tone: "success" as const },
    { label: "Découverts", value: dto.discoveredCount, tone: "info" as const },
    { label: "Secrets", value: dto.secretCount, tone: "neutral" as const },
    { label: "Total", value: dto.totalCount, tone: "neutral" as const },
  ];

  return (
    <SettingsContent>
      <SectionHeading
        title="Badges"
        description="Les badges du plugin hermes-achievements, calculés par le Dashboard à partir de l’historique réel des sessions Hermes. Lecture seule."
        action={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
          >
            {refreshing ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            )}
            Rafraîchir
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {counters.map((counter) => (
          <div
            key={counter.label}
            className="flex flex-col gap-1 rounded-xl border border-input bg-card px-3 py-2.5"
          >
            <span className="text-[0.6875rem] text-muted-foreground">{counter.label}</span>
            <span className="font-mono text-[0.9375rem] font-semibold">{counter.value}</span>
          </div>
        ))}
      </div>

      {scanning ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl bg-info-soft p-3 text-[0.75rem] text-info-700"
        >
          <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" />
          Scan de l’historique en cours : les badges se débloquent au fil de l’analyse.
        </div>
      ) : null}

      {dto.error ? (
        <div
          role="alert"
          className="rounded-xl bg-warn-soft p-3 text-[0.75rem] text-warn-700"
        >
          {dto.error}
        </div>
      ) : null}

      {refreshError ? (
        <div
          role="alert"
          className="rounded-xl bg-neg-soft p-3 text-[0.75rem] text-neg-700"
        >
          {refreshError}
        </div>
      ) : null}

      <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 sm:max-w-xs">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Filtrer les badges</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrer…"
          className="min-w-0 flex-1 bg-transparent text-[0.75rem] outline-none placeholder:text-muted-foreground"
        />
      </label>

      {groups.length === 0 ? (
        <Card>
          <CardSurface className="flex flex-col items-start gap-1">
            <p className="font-medium text-foreground">Aucun badge</p>
            <p className="text-[0.75rem] text-muted-foreground">
              Le Dashboard n’a renvoyé aucun badge pour l’historique actuel.
            </p>
          </CardSurface>
        </Card>
      ) : (
        groups.map(([category, items]) => (
          <section key={category} aria-label={category}>
            <h3 className="mb-2 text-[0.8125rem] font-medium text-foreground">{category}</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          </section>
        ))
      )}
    </SettingsContent>
  );
}

function AchievementCard({ achievement }: { achievement: HermesAchievementDto }) {
  const CategoryIcon = CATEGORY_ICONS[achievement.category] ?? TrophyIcon;
  const Icon = achievement.state === "secret" ? LockIcon : CategoryIcon;
  const pct = clampPct(achievement.progressPct);

  return (
    <Card>
      <CardSurface className="flex h-full min-h-44 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <Badge
            tone={
              achievement.state === "unlocked"
                ? "success"
                : achievement.state === "discovered"
                  ? "info"
                  : "neutral"
            }
          >
            {STATE_LABELS[achievement.state]}
          </Badge>
        </div>

        <div className="min-w-0">
          <h4 className="truncate text-[0.8125rem] font-semibold text-foreground" title={achievement.name}>
            {achievement.name}
          </h4>
          <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-4 text-muted-foreground">
            {achievement.description}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <Badge>{achievement.category}</Badge>
          {achievement.tier ? (
            <Badge tone={TIER_TONES[achievement.tier] ?? "neutral"}>{achievement.tier}</Badge>
          ) : null}
        </div>

        {achievement.progressPct !== null && achievement.progressPct !== undefined ? (
          <div>
            <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
              <span>{achievement.nextTier ? `Prochain : ${achievement.nextTier}` : "Tier max"}</span>
              <span className="font-mono">{Math.round(pct)} %</span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}

        {achievement.criteria ? (
          <details className="text-[0.6875rem] text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground/80 select-none">
              Ce qui compte
            </summary>
            <p className="mt-1 leading-4">{achievement.criteria}</p>
          </details>
        ) : null}
      </CardSurface>
    </Card>
  );
}
