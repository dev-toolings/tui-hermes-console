"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ToggleGroup,
  ToggleGroupItem,
  type ChartConfig,
} from "@boardui/ui";
import type { RunActivityPoint } from "@/modules/runs/repository";

const RANGES = [
  { value: "7", label: "7 j" },
  { value: "14", label: "14 j" },
  { value: "30", label: "30 j" },
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
 * Missions par jour. Reprend la disposition de `chart-area-interactive`
 * (dashboard-01) mais sur les primitives BoardUI et des données réelles :
 * aucun `data.json` de démonstration.
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
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-seam px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Activité des missions</h2>
          <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
            {total === 0
              ? "Aucune mission sur la période"
              : `${total} mission${total > 1 ? "s" : ""} sur ${range} jours`}
          </p>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          value={range}
          // `onValueChange` renvoie "" quand on déselectionne : garder la
          // valeur courante évite un graphique vide au second clic.
          onValueChange={(value) => value && setRange(value)}
          aria-label="Période affichée"
        >
          {RANGES.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="px-2 pt-4 pb-2">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={points} margin={{ left: 4, right: 8, top: 4 }}>
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
              minTickGap={24}
              tickFormatter={formatDay}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              // Des missions se comptent à l'unité : une graduation à 2,5
              // n'aurait aucun sens.
              allowDecimals={false}
            />
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
              type="natural"
              stackId="missions"
              stroke="var(--color-completed)"
              fill="url(#fill-completed)"
            />
            {hasFailures ? (
              <Area
                dataKey="failed"
                type="natural"
                stackId="missions"
                stroke="var(--color-failed)"
                fill="url(#fill-failed)"
              />
            ) : null}
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
