"use client";

import { useCallback, useState } from "react";
import { RuntimeConnectionForm } from "@/components/forms/runtime-connection-form";
import { RuntimeLifecycle } from "@/components/settings/runtime-lifecycle";
import { SettingsContent } from "@/components/settings/settings-content";
import { Badge, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";

type RuntimeDto = {
  configured: boolean;
  transport?: "direct" | "ssh";
  baseUrl: string | null;
  lastHealthStatus: string;
  detectedVersion: string | null;
  source: string;
};

function runtimeBadge(runtime: RuntimeDto | null) {
  if (!runtime || !runtime.configured) {
    return <Badge tone="warning">Non configuré</Badge>;
  }
  if (runtime.lastHealthStatus === "healthy") {
    return (
      <Badge tone="success">
        Connecté{runtime.detectedVersion ? ` · ${runtime.detectedVersion}` : ""}
      </Badge>
    );
  }
  if (runtime.lastHealthStatus === "unauthorized") {
    return <Badge tone="danger">Token invalide</Badge>;
  }
  if (runtime.lastHealthStatus === "unreachable") {
    return <Badge tone="danger">Injoignable</Badge>;
  }
  return (
    <Badge tone="info">
      Configuré{runtime.source === "env" ? " (env)" : ""}
    </Badge>
  );
}

export default function RuntimeSettingsPage() {
  const [runtime, setRuntime] = useState<RuntimeDto | null>(null);
  const onRuntimeChange = useCallback((next: RuntimeDto) => setRuntime(next), []);

  return (
    <SettingsContent>
      <SectionHeading
        title="Runtime Hermes"
        description="Une même Console peut joindre Hermes sur la machine locale, un réseau privé ou un VPS. Le navigateur ne reçoit jamais les secrets du runtime."
        action={runtimeBadge(runtime)}
      />
      <Card>
        <CardSurface>
          <RuntimeConnectionForm onRuntimeChange={onRuntimeChange} />
        </CardSurface>
      </Card>
      <Card>
        <CardSurface>
          <RuntimeLifecycle runtime={runtime} onRuntimeChange={onRuntimeChange} />
        </CardSurface>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        <Fact title="Console décide" body="Authentification, autorisations, historique et politiques restent dans l’application." />
        <Fact title="Edge accède" body="La frontière réseau limite les routes, signe les appels et expose la santé du runtime." />
        <Fact title="Hermes exécute" body="Hermes conserve ses modèles, outils et capacités d’agent sans modification de sa CLI." />
      </div>
    </SettingsContent>
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
