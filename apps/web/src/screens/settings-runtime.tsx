"use client";

import { useCallback, useState } from "react";
import type { RuntimePublicDto } from "@console/core/types/api";
import { RuntimeConnectionForm } from "@/components/forms/runtime-connection-form";
import { RuntimeLifecycle } from "@/components/settings/runtime-lifecycle";
import { RuntimeDashboardLifecycle } from "@/components/settings/runtime-dashboard-lifecycle";
import { RuntimeMutationProvider } from "@/components/settings/runtime-mutation-provider";
import { SettingsContent } from "@/components/settings/settings-content";
import { Badge, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";

type RuntimeMode = "direct" | "ssh";

export function runtimeBadgePresentation(
  runtime: RuntimePublicDto | null,
  displayedMode?: RuntimeMode,
) {
  if (!runtime || !runtime.configured) {
    return { tone: "warning" as const, label: "Non configuré" };
  }
  const target =
    runtime.transport === "ssh"
      ? `SSH${runtime.sshHost ? ` · ${runtime.sshHost}` : ""}`
      : "Accès direct";
  const version = runtime.detectedVersion ? ` · ${runtime.detectedVersion}` : "";
  if (displayedMode && displayedMode !== runtime.transport) {
    return {
      tone: "info" as const,
      label: `Runtime enregistré · ${target}${version}`,
    };
  }
  if (runtime.lastHealthStatus === "healthy") {
    if (runtime.transport === "ssh" && runtime.workspaceStatus !== "ready") {
      return { tone: "warning" as const, label: `${target} · Test réussi · Dossier requis` };
    }
    return { tone: "success" as const, label: `${target} · Hermes est à jour${version}` };
  }
  if (runtime.lastHealthStatus === "unauthorized") {
    return { tone: "danger" as const, label: `${target} · Token invalide` };
  }
  if (runtime.lastHealthStatus === "unreachable") {
    return { tone: "danger" as const, label: `${target} · Injoignable` };
  }
  return {
    tone: "info" as const,
    label: `${target} · Configuré${runtime.source === "env" ? " (env)" : ""}`,
  };
}

function runtimeBadge(runtime: RuntimePublicDto | null, displayedMode?: RuntimeMode) {
  const presentation = runtimeBadgePresentation(runtime, displayedMode);
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}

export function SettingsRuntimeScreen({ search }: { search: { mode?: "direct" | "ssh" } }) {
  const [runtime, setRuntime] = useState<RuntimePublicDto | null>(null);
  const onRuntimeChange = useCallback((next: RuntimePublicDto) => setRuntime(next), []);

  return (
    <RuntimeMutationProvider>
      <SettingsContent>
        <SectionHeading
          title="Runtime Hermes"
          description="Une même Console peut joindre Hermes sur la machine locale, un réseau privé ou un VPS. Les secrets restent masqués par défaut et leur révélation exige un OTP."
          action={runtimeBadge(runtime, search.mode)}
        />
        <Card>
          <CardSurface>
            <RuntimeConnectionForm mode={search.mode} onRuntimeChange={onRuntimeChange} />
          </CardSurface>
        </Card>
        <Card>
          <CardSurface>
            <RuntimeLifecycle runtime={runtime} onRuntimeChange={onRuntimeChange} />
          </CardSurface>
        </Card>
        <Card>
          <CardSurface>
            <RuntimeDashboardLifecycle runtime={runtime} />
          </CardSurface>
        </Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Fact title="Console décide" body="Authentification, autorisations, historique et politiques restent dans l’application." />
          <Fact title="Edge accède" body="La frontière réseau limite les routes, signe les appels et expose la santé du runtime." />
          <Fact title="Hermes exécute" body="Hermes conserve ses modèles, outils et capacités d’agent sans modification de sa CLI." />
        </div>
      </SettingsContent>
    </RuntimeMutationProvider>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardSurface>
        <p className="text-[0.8125rem] font-semibold">{title}</p>
        <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">{body}</p>
      </CardSurface>
    </Card>
  );
}
