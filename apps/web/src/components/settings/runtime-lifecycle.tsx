"use client";

import * as React from "react";
import { CheckCircle2Icon, LoaderCircleIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/boardui";
import { notifyRuntimePublicChanged } from "@/lib/runtime/public-client";

type RuntimeDto = {
  configured: boolean;
  baseUrl: string | null;
  lastHealthStatus: string;
  detectedVersion: string | null;
  source: string;
};

type LifecycleState =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "restarting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function RuntimeLifecycle({
  runtime,
  onRuntimeChange,
}: {
  runtime: RuntimeDto | null;
  onRuntimeChange: (runtime: RuntimeDto) => void;
}) {
  const [state, setState] = React.useState<LifecycleState>({ kind: "idle" });
  const managedLocally = isLocalRuntimeUrl(runtime?.baseUrl);

  async function restart() {
    setState({ kind: "restarting" });
    try {
      const response = await fetch("/api/runtime/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        recoveryMs?: number;
        runtime?: RuntimeDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.ok || !body.runtime) {
        throw new Error(body.error?.message ?? "Le redémarrage Hermes a échoué.");
      }
      onRuntimeChange(body.runtime);
      notifyRuntimePublicChanged();
      setState({
        kind: "success",
        message: `Runtime opérationnel en ${formatDuration(body.recoveryMs ?? 0)}.`,
      });
    } catch (reason) {
      setState({
        kind: "error",
        message:
          reason instanceof Error ? reason.message : "Le redémarrage Hermes a échoué.",
      });
    }
  }

  const restarting = state.kind === "restarting";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-semibold">Cycle de vie du runtime</p>
          <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">
            Redémarre le service Hermes local, puis attend le retour de `/health` et des capacités
            avant d’annoncer le succès.
          </p>
        </div>
        {state.kind !== "confirm" ? (
          <Button
            disabled={!runtime?.configured || !managedLocally || restarting}
            onClick={() => setState({ kind: "confirm" })}
          >
            {restarting ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <RotateCwIcon className="size-4" />
            )}
            {restarting ? "Redémarrage…" : "Redémarrer Hermes"}
          </Button>
        ) : null}
      </div>

      {state.kind === "confirm" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-100 bg-warn-soft p-3">
          <TriangleAlertIcon className="size-4 shrink-0 text-warn-700" />
          <p className="min-w-0 flex-1 text-[0.75rem] leading-5 text-warn-700">
            Les missions actives peuvent être interrompues pendant quelques secondes.
          </p>
          <Button onClick={() => setState({ kind: "idle" })}>Annuler</Button>
          <Button variant="danger" onClick={() => void restart()}>
            Confirmer le redémarrage
          </Button>
        </div>
      ) : null}

      {state.kind === "success" ? (
        <p role="status" className="flex items-center gap-2 text-[0.75rem] text-pos-700">
          <CheckCircle2Icon className="size-4" />
          {state.message}
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="flex items-center gap-2 text-[0.75rem] text-neg-700">
          <TriangleAlertIcon className="size-4" />
          {state.message}
        </p>
      ) : null}

      {!runtime?.configured ? (
        <p className="text-[0.6875rem] text-muted-foreground">
          Enregistrez d’abord la connexion au runtime.
        </p>
      ) : !managedLocally ? (
        <p className="text-[0.6875rem] text-muted-foreground">
          Ce runtime est distant. Son Edge doit exposer une API d’administration avant que la
          Console puisse le redémarrer.
        </p>
      ) : null}
    </div>
  );
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(1).replace(".", ",")} s`;
}

function isLocalRuntimeUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}
