import { lazy, Suspense } from "react";
import { SectionCards } from "@/components/dashboard/section-cards";
import type { MissionRow } from "@/components/dashboard/missions-data-table";
import type { RunStatus } from "@console/core/lib/run-status";
import type { DashboardData } from "@/loaders";

/**
 * Le graphique tire `recharts` (110 ko gzip) et la table `react-table` +
 * `dnd-kit` (28 ko) — à eux deux, plus que tout le reste de l'écran. L'Aperçu
 * étant la route d'accueil, on ne peut pas différer l'écran entier sans juste
 * déplacer l'attente : ce sont donc ces deux blocs qui arrivent en second, une
 * fois les cartes de métriques déjà lisibles.
 *
 * Le découpage correspondant vit dans `manualChunks` (vite.config.ts).
 */
const ActivityChart = lazy(() =>
  import("@/components/dashboard/activity-chart").then((m) => ({
    default: m.ActivityChart,
  })),
);
const MissionsDataTable = lazy(() =>
  import("@/components/dashboard/missions-data-table").then((m) => ({
    default: m.MissionsDataTable,
  })),
);

/** Réserve la hauteur du bloc pour que son arrivée ne décale rien. */
function Reserved({ className }: { className: string }) {
  return <div aria-hidden className={className} />;
}

/**
 * Écran d'aperçu, dans la composition du bloc `dashboard-01` :
 * cartes de métriques, graphique d'activité, table des missions.
 */
export function DashboardScreen({ data }: { data: DashboardData }) {
  const missionRows: MissionRow[] = data.threads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    agentName: thread.agentName,
    updatedAt: thread.updatedAt,
    status: (thread.latestRun?.status ?? "pending") as RunStatus,
    error: thread.latestRun?.error ?? null,
    totalTokens: thread.latestRun?.usage?.totalTokens ?? null,
  }));

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards data={data} />
        <div className="px-4 lg:px-6">
          <Suspense fallback={<Reserved className="h-[358px] rounded-xl bg-card/40" />}>
            <ActivityChart data={data.activity} />
          </Suspense>
        </div>
        <Suspense fallback={<Reserved className="h-[420px]" />}>
          <MissionsDataTable rows={missionRows} />
        </Suspense>
      </div>
    </div>
  );
}
