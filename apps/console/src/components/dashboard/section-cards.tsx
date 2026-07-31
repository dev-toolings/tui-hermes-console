import { BotIcon, MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Badge,
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@boardui/ui";
import { RUN_STATUS, formatTokens, type RunStatus } from "@console/core/lib/run-status";
import type { RunActivityPoint } from "@console/core/modules/runs/types";
import type { DashboardData } from "@/loaders";

/**
 * Tendance à 7 jours, calculée sur la série d'activité réelle (30 points) :
 * les 7 derniers jours contre les 7 précédents. Rien n'est simulé — quand la
 * semaine précédente est vide, il n'y a pas de pourcentage à afficher et on
 * retombe sur la variation absolue.
 */
type Trend =
  | { kind: "percent"; value: number }
  | { kind: "absolute"; value: number }
  | { kind: "flat" };

function weekTrend(points: RunActivityPoint[], pick: (point: RunActivityPoint) => number): Trend {
  const sum = (slice: RunActivityPoint[]) => slice.reduce((total, point) => total + pick(point), 0);
  const current = sum(points.slice(-7));
  const previous = sum(points.slice(-14, -7));

  if (previous === 0) {
    return current === 0 ? { kind: "flat" } : { kind: "absolute", value: current };
  }
  return { kind: "percent", value: ((current - previous) / previous) * 100 };
}

function trendDirection(trend: Trend): "up" | "down" | "flat" {
  if (trend.kind === "flat") return "flat";
  if (trend.kind === "absolute") return "up";
  if (trend.value > 0) return "up";
  if (trend.value < 0) return "down";
  return "flat";
}

/** Notation compacte : le badge doit tenir sur une ligne, même à 1,8 M tokens. */
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

function trendLabel(trend: Trend): string {
  if (trend.kind === "flat") return "0";
  if (trend.kind === "absolute") return `+${compact.format(trend.value)}`;
  const rounded = Math.round(trend.value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("fr-FR")} %`;
}

const TREND_ICON = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  flat: MinusIcon,
} as const;

const TREND_SENTENCE = {
  up: "En hausse cette semaine",
  down: "En baisse cette semaine",
  flat: "Stable cette semaine",
} as const;

export function SectionCards({ data }: { data: DashboardData }) {
  const { agents, threads, activity } = data;

  const active = threads.filter(
    (thread) => thread.latestRun && !RUN_STATUS[thread.latestRun.status as RunStatus].terminal,
  );
  const completed30d = activity.reduce((total, point) => total + point.completed, 0);
  const failed30d = activity.reduce((total, point) => total + point.failed, 0);
  const tokens30d = activity.reduce((total, point) => total + point.tokens, 0);

  const completedTrend = weekTrend(activity, (point) => point.completed);
  const failedTrend = weekTrend(activity, (point) => point.failed);
  const tokensTrend = weekTrend(activity, (point) => point.tokens);

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-board-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {/*
        Libellés courts : à 259px de carte, la description du bloc tient sur
        une ligne. « Missions en cours (30 j) » passait à deux et allongeait la
        carte de 20px par rapport à la référence — la fenêtre de mesure est
        reportée en bas de carte.
      */}
      <MetricCard
        label="En cours"
        value={String(active.length)}
        action={
          <Badge variant="outline">
            <BotIcon className="size-3.5" />
            {agents.length} agent{agents.length === 1 ? "" : "s"}
          </Badge>
        }
        headline={
          active.length === 0 ? "Aucune exécution active" : "Exécutions suivies en temps réel"
        }
        detail="Runs non terminaux, tous agents confondus"
      />

      <TrendCard
        label="Terminées"
        value={completed30d.toLocaleString("fr-FR")}
        trend={completedTrend}
        detail="Runs terminés sur 30 jours"
      />

      <TrendCard
        label="Échecs"
        value={failed30d.toLocaleString("fr-FR")}
        trend={failedTrend}
        detail="Runs en échec sur 30 jours"
      />

      <TrendCard
        label="Tokens"
        value={tokens30d === 0 ? "0" : formatTokens(tokens30d)}
        trend={tokensTrend}
        detail="Consommation cumulée sur 30 jours"
      />
    </div>
  );
}

function TrendCard({
  label,
  value,
  trend,
  detail,
}: {
  label: string;
  value: string;
  trend: Trend;
  detail: string;
}) {
  const direction = trendDirection(trend);
  const Icon = TREND_ICON[direction];

  return (
    <MetricCard
      label={label}
      value={value}
      action={
        <Badge variant="outline">
          <Icon className="size-3.5" />
          {trendLabel(trend)}
        </Badge>
      }
      headline={
        <>
          {TREND_SENTENCE[direction]} <Icon className="size-4" />
        </>
      }
      detail={detail}
    />
  );
}

function MetricCard({
  label,
  value,
  action,
  headline,
  detail,
}: {
  label: string;
  value: string;
  action: ReactNode;
  headline: ReactNode;
  detail: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {/*
          `formatTokens` sépare les milliers par une espace fine sécable : sans
          `whitespace-nowrap`, « 1 840 486 » se coupait en deux lignes.
        */}
        <CardTitle className="text-2xl font-semibold whitespace-nowrap tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <CardAction>{action}</CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">{headline}</div>
        <div className="text-muted-foreground">{detail}</div>
      </CardFooter>
    </Card>
  );
}
