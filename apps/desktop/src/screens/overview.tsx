import { getRouteApi } from "@tanstack/react-router";
import { ActivityIcon, BotIcon, Clock3Icon, ServerIcon } from "lucide-react";
import { runtimeTargetLabel } from "../api";

const route = getRouteApi("/");

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Aperçu porté depuis `apps/web/src/app/(console)/page.tsx`.
 *
 * Même design system, mêmes données — seule la provenance change : `loader`
 * côté client au lieu d'un server component. C'est la preuve que la migration
 * Next → Vite ne coûte que le transport des données.
 */
export function OverviewScreen() {
  const { runtime, threads, agents } = route.useLoaderData();

  const active = threads.filter(
    (thread) => thread.latestRun && !TERMINAL.has(thread.latestRun.status),
  );
  const completed = threads.filter((thread) => thread.latestRun?.status === "completed");

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Vue d’ensemble</h1>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Agents actifs" value={agents.length} icon={BotIcon} />
        <Metric label="Missions en cours" value={active.length} icon={ActivityIcon} />
        <Metric label="Terminées" value={completed.length} icon={Clock3Icon} />
        <Metric label="Conversations" value={threads.length} icon={ServerIcon} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Runtime Hermes</h2>
        <p className="mt-1 text-[0.75rem] text-muted-foreground">Exécution</p>
        <p className="mt-0.5 font-mono text-[0.75rem] break-words">
          {runtimeTargetLabel(runtime)}
        </p>
        <p className="mt-1 text-[0.75rem] text-muted-foreground">
          {runtime.transport === "ssh" ? "Tunnel SSH" : "Accès direct"}
          {runtime.detectedVersion ? ` · ${runtime.detectedVersion}` : ""}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <h2 className="border-b border-seam px-4 py-3 text-base font-semibold">
          Missions récentes
        </h2>
        {threads.length === 0 ? (
          <p className="px-4 py-8 text-center text-[0.75rem] text-muted-foreground">
            Aucune conversation en base.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {threads.slice(0, 8).map((thread) => (
              <li key={thread.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium">
                    {thread.title}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-muted-foreground">
                    {thread.agentName}
                  </span>
                </span>
                <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                  {thread.latestRun?.status ?? "pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof BotIcon;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-[0.6875rem] font-medium text-muted-foreground">
            {label}
          </span>
          <strong className="mt-2 block text-2xl font-semibold tracking-tight">
            {value}
          </strong>
        </span>
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}
