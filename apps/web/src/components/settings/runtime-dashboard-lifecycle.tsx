"use client";

import * as React from "react";
import type {
  HermesDashboardDto,
  RuntimePublicDto,
} from "@console/core/types/api";
import {
  CircleStopIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/boardui";
import { fetchHermesDashboard, manageHermesDashboard } from "@/lib/api";
import { useRuntimeMutation } from "./runtime-mutation-provider";

type Action = "start" | "restart";

export function RuntimeDashboardLifecycle({
  runtime,
}: {
  runtime: RuntimePublicDto | null;
}) {
  const [dashboard, setDashboard] = React.useState<HermesDashboardDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<Action | "refresh" | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { runMutation } = useRuntimeMutation();

  const refresh = React.useCallback(async () => {
    setBusy("refresh");
    setError(null);
    try {
      setDashboard(await fetchHermesDashboard());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sonde Dashboard impossible.");
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh, runtime?.configRevision, runtime?.transport, runtime?.baseUrl]);

  async function run(action: Action) {
    if (action === "restart" && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(action);
    setConfirming(false);
    setError(null);
    try {
      setDashboard(
        await runMutation(
          action === "restart" ? "Redémarrage du Dashboard Hermes" : "Démarrage du Dashboard Hermes",
          (signal) => manageHermesDashboard(action, signal),
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action Dashboard impossible.");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const status = dashboard ? dashboardStatus(dashboard) : null;
  const isRunning = dashboard?.status === "running";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.8125rem] font-semibold">Dashboard Hermes</p>
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          </div>
          <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">
            Nécessaire pour modifier les skills, la configuration et les outils Hermes. Les changements de skills prennent effet à la prochaine session.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy !== null}
          leadingIcon={busy === "refresh" ? SpinnerIcon : RefreshCwIcon}
          onClick={() => void refresh()}
        >
          Vérifier
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-seam bg-inset px-3 py-3">
        <div className="min-w-0 text-[0.6875rem] text-muted-foreground">
          <p className="font-medium text-foreground">
            {dashboard ? dashboardTarget(dashboard) : "Sonde du Dashboard en cours…"}
          </p>
          <p className="mt-1">
            {dashboard?.manager && dashboard.manager !== "unknown"
              ? `Gestionnaire : ${dashboard.manager}`
              : "Gestionnaire non détecté"}
            {dashboard?.version ? ` · ${dashboard.version}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={loading || busy !== null || !dashboard?.canStart}
            leadingIcon={busy === "start" ? SpinnerIcon : PlayIcon}
            onClick={() => void run("start")}
          >
            {busy === "start" ? "Démarrage…" : "Démarrer"}
          </Button>
          <Button
            variant="secondary"
            disabled={loading || busy !== null || !dashboard?.canRestart}
            leadingIcon={busy === "restart" ? SpinnerIcon : RotateCwIcon}
            onClick={() => void run("restart")}
          >
            {busy === "restart" ? "Redémarrage…" : "Redémarrer"}
          </Button>
        </div>
      </div>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-100 bg-warn-soft p-3">
          <TriangleAlertIcon className="size-4 shrink-0 text-warn-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[0.75rem] leading-5 text-warn-700">
            Seul le Dashboard sera redémarré. Hermes API et les missions ne seront pas redémarrés.
          </p>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
          <Button onClick={() => void run("restart")}>Confirmer</Button>
        </div>
      ) : null}

      {dashboard?.reason && !isRunning ? (
        <p role="status" className="flex items-start gap-2 text-[0.6875rem] leading-5 text-muted-foreground">
          <CircleStopIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{dashboard.reason}</span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-[0.6875rem] leading-5 text-neg-700">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return <LoaderCircleIcon className={`${className ?? ""} animate-spin motion-reduce:animate-none`} />;
}

function dashboardStatus(dashboard: HermesDashboardDto) {
  if (dashboard.status === "running") {
    return { label: "Opérationnel", tone: "success" as const };
  }
  if (dashboard.status === "unreachable") {
    return { label: "SSH injoignable", tone: "danger" as const };
  }
  if (dashboard.status === "unsupported") {
    return { label: "À préparer", tone: "warning" as const };
  }
  return { label: "Arrêté", tone: "warning" as const };
}

function dashboardTarget(dashboard: HermesDashboardDto) {
  return dashboard.transport === "ssh"
    ? `Distant · loopback:${dashboard.port} via SSH`
    : `Local · 127.0.0.1:${dashboard.port}`;
}
