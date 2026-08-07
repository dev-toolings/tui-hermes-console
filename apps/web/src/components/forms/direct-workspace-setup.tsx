"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FolderCheckIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ServerIcon,
  TerminalIcon,
} from "lucide-react";
import type {
  RuntimeDirectWorkspaceDiscoveryDto,
  RuntimePublicDto,
} from "@console/core/types/api";
import { Badge, Button } from "@/components/ui/boardui";

export function DirectWorkspaceSetup({
  runtime,
}: {
  runtime: RuntimePublicDto | null;
}) {
  const [discovery, setDiscovery] = useState<RuntimeDirectWorkspaceDiscoveryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = runtime?.configured === true && runtime.transport === "direct";
  const [loading, setLoading] = useState(configured);

  async function discover() {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      setDiscovery(await requestDirectWorkspace(runtime.configRevision));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le diagnostic du dossier partagé a échoué.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    void requestDirectWorkspace(runtime.configRevision, controller.signal)
      .then((next) => setDiscovery(next))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Le diagnostic du dossier partagé a échoué.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [configured, runtime?.configRevision]);

  return (
    <section aria-labelledby="direct-workspace-title" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-seam pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-info-soft text-[0.6875rem] font-semibold text-info-700">
              2
            </span>
            <h3 id="direct-workspace-title" className="text-[0.8125rem] font-semibold">
              Dossier partagé avec Hermes
            </h3>
          </div>
          <p className="mt-1 max-w-[68ch] pl-9 text-[0.6875rem] leading-5 text-muted-foreground">
            En accès direct, Hermes et la Console doivent voir le même dossier sous le même chemin absolu.
          </p>
        </div>
        {configured ? (
          <Button
            type="button"
            disabled={loading}
            leadingIcon={loading ? LoaderCircleIcon : RefreshCwIcon}
            onClick={() => void discover()}
          >
            {loading ? "Analyse…" : "Relancer"}
          </Button>
        ) : null}
      </div>

      {!configured ? (
        <p role="status" className="rounded-xl bg-inset px-3 py-2 text-[0.6875rem] leading-5 text-muted-foreground">
          Enregistrez d’abord une connexion directe pour diagnostiquer son dossier partagé.
        </p>
      ) : loading && !discovery ? (
        <DirectWorkspaceSkeleton />
      ) : error ? (
        <p role="alert" className="flex items-start gap-2 text-[0.6875rem] leading-5 text-destructive">
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : discovery ? (
        <DirectWorkspaceResult discovery={discovery} />
      ) : null}
    </section>
  );
}

async function requestDirectWorkspace(
  configRevision: number | null,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/runtime/workspace/discover", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hermes-Toast": "0",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      ...(configRevision ? { expectedRevision: configRevision } : {}),
    }),
  });
  const body = (await response.json()) as {
    discovery?: RuntimeDirectWorkspaceDiscoveryDto;
    error?: { message?: string };
  };
  if (!response.ok || body.discovery?.transport !== "direct") {
    throw new Error(body.error?.message ?? "Le diagnostic du dossier partagé a échoué.");
  }
  return body.discovery;
}

function DirectWorkspaceResult({
  discovery,
}: {
  discovery: RuntimeDirectWorkspaceDiscoveryDto;
}) {
  const presentation = proofPresentation(discovery);
  if (discovery.scope === "remote") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl bg-inset p-3">
          <ServerIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.75rem] font-semibold">Runtime direct distant</p>
              <Badge tone="neutral">Non inspectable</Badge>
            </div>
            <p className="mt-1 max-w-[68ch] text-[0.6875rem] leading-5 text-muted-foreground">
              La connexion API fonctionne, mais elle ne donne aucun accès au système de fichiers distant. Montez un dossier identique dans Hermes et la Console, ou utilisez le mode SSH pour une détection vérifiable.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-inset p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.75rem] font-semibold">{presentation.title}</p>
            <Badge tone={presentation.tone}>{presentation.badge}</Badge>
            {discovery.restartRequired ? <Badge tone="warning">Redémarrage requis</Badge> : null}
          </div>
          {discovery.sharedWorkdir ? (
            <code className="mt-2 block break-all font-mono text-[0.6875rem] text-foreground">
              {discovery.sharedWorkdir.path}
            </code>
          ) : null}
          <p className="mt-1 max-w-[68ch] text-[0.6875rem] leading-5 text-muted-foreground">
            {presentation.description}
          </p>
        </div>
        {discovery.proofLevel === "verified" ? (
          <CheckCircle2Icon aria-hidden className="size-5 shrink-0 text-pos-700" />
        ) : (
          <AlertTriangleIcon aria-hidden className="size-5 shrink-0 text-warn-700" />
        )}
      </div>

      <dl className="divide-y divide-seam border-y border-seam text-[0.6875rem]">
        <PathRow
          icon={FolderCheckIcon}
          label="Chemin Console"
          value={discovery.sharedWorkdir?.path ?? "Non disponible"}
        />
        <PathRow
          icon={TerminalIcon}
          label="terminal.cwd Hermes"
          value={discovery.hermesTerminalCwd ?? "Non confirmé par le CLI local"}
        />
        <PathRow
          icon={ServerIcon}
          label="Source Console"
          value={
            discovery.sharedWorkdir?.source === "env"
              ? "HERMES_SHARED_WORKDIR"
              : "Valeur locale par défaut"
          }
        />
      </dl>

      {[...discovery.blockers, ...discovery.warnings].map((message) => (
        <p key={message} className="flex items-start gap-2 text-[0.6875rem] leading-5 text-warn-700">
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {message}
        </p>
      ))}

      {discovery.proofLevel !== "verified" ? (
        <div className="border-t border-seam pt-4">
          <p className="text-[0.75rem] font-medium">Configuration attendue</p>
          <p className="mt-1 max-w-[68ch] text-[0.6875rem] leading-5 text-muted-foreground">
            Définissez <code className="font-mono text-foreground">HERMES_SHARED_WORKDIR</code> côté Console, montez ce dossier dans Hermes au chemin strictement identique, puis configurez <code className="font-mono text-foreground">terminal.cwd</code> avec cette même valeur. Redémarrez les services après une modification d’environnement ou de montage.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PathRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderCheckIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="min-w-0 break-all font-mono text-foreground">{value}</dd>
    </div>
  );
}

function DirectWorkspaceSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Analyse du dossier partagé">
      <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-10 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="h-10 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function proofPresentation(discovery: RuntimeDirectWorkspaceDiscoveryDto) {
  switch (discovery.proofLevel) {
    case "verified":
      return {
        title: "Dossier partagé confirmé",
        badge: "Vérifié",
        tone: "success" as const,
        description: "La Console peut lire et écrire ici, et le CLI Hermes local confirme le même terminal.cwd.",
      };
    case "misaligned":
      return {
        title: "Chemins désalignés",
        badge: "À corriger",
        tone: "warning" as const,
        description: "La Console et Hermes n’utilisent pas le même chemin absolu.",
      };
    case "console_only":
      return {
        title: "Dossier accessible à la Console",
        badge: "Hermes non confirmé",
        tone: "info" as const,
        description: "Les droits locaux sont valides, mais l’identité de stockage Hermes reste à confirmer.",
      };
    default:
      return {
        title: "Dossier indisponible",
        badge: "Bloqué",
        tone: "danger" as const,
        description: "Le chemin local doit être corrigé avant de pouvoir prouver le partage.",
      };
  }
}
