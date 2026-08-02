"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
  type ChartConfig,
} from "@boardui/ui";
import type { RunActivityPoint } from "@console/core/modules/runs/types";

const RANGES = [
  { value: "30", label: "30 derniers jours" },
  { value: "14", label: "14 derniers jours" },
  { value: "7", label: "7 derniers jours" },
] as const;

const chartConfig = {
  completed: { label: "Terminées", color: "var(--state-pos-fg)" },
  failed: { label: "Échouées", color: "var(--destructive)" },
} satisfies ChartConfig;

function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Missions par jour, dans la disposition de `chart-area-interactive`
 * (dashboard-01) — mais sur les primitives BoardUI et des données réelles :
 * aucun `data.json` de démonstration. L'API ne sert que 30 points, d'où des
 * plages 30 / 14 / 7 jours au lieu des 3 mois du bloc.
 */
export function ActivityChart({ data }: { data: RunActivityPoint[] }) {
  const [range, setRange] = useState<string>("30");

  const points = useMemo(() => data.slice(-Number(range)), [data, range]);
  const total = useMemo(
    () => points.reduce((sum, point) => sum + point.completed + point.failed, 0),
    [points],
  );
  /**
   * Empilée à zéro, la série « Échouées » trace son stroke exactement sur la
   * frontière haute des « Terminées » : la courbe apparaissait rouge alors
   * qu'aucune mission n'avait échoué. On ne la dessine que si elle existe.
   */
  const hasFailures = useMemo(() => points.some((point) => point.failed > 0), [points]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Activité des missions</CardTitle>
        <CardDescription>
          {total === 0
            ? "Aucune mission sur la période"
            : `${total} mission${total > 1 ? "s" : ""} sur ${range} jours`}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            variant="outline"
            value={range}
            // `onValueChange` renvoie "" quand on déselectionne : garder la
            // valeur courante évite un graphique vide au second clic.
            onValueChange={(value) => value && setRange(value)}
            aria-label="Période affichée"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            {RANGES.map((item) => (
              <ToggleGroupItem key={item.value} value={item.value}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={range} onValueChange={(value) => value && setRange(value)}>
            <SelectTrigger
              size="sm"
              aria-label="Période affichée"
              className="flex w-44 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
            >
              <SelectValue placeholder="30 derniers jours" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {RANGES.map((item) => (
                <SelectItem key={item.value} value={item.value} className="rounded-lg">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={points}>
            <defs>
              <linearGradient id="fill-completed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.7} />
                <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fill-failed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.7} />
                <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatDay}
            />
            {/*
              Pas d'axe Y : le bloc n'en a pas, et la valeur exacte reste
              lisible dans l'infobulle.
            */}
            {/*
              `monotone`, surtout pas le `natural` du bloc d'origine : une
              spline naturelle prend son élan avant un pic isolé et rebondit
              après, donc elle descend sous zéro entre deux jours à zéro. Sur
              nos volumes — quelques missions étalées sur 30 jours — l'artefact
              est permanent. `monotone` reste plat entre deux points égaux et ne
              dépasse jamais leur min/max.
            */}
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) => formatDay(String(value))}
                />
              }
            />
            <Area
              dataKey="completed"
              type="monotone"
              stackId="missions"
              stroke="var(--color-completed)"
              fill="url(#fill-completed)"
            />
            {hasFailures ? (
              <Area
                dataKey="failed"
                type="monotone"
                stackId="missions"
                stroke="var(--color-failed)"
                fill="url(#fill-failed)"
              />
            ) : null}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
