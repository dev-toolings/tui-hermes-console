"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@boardui/ui";
import {
  ActivityIcon,
  CableIcon,
  FolderCheckIcon,
  GaugeIcon,
  WrenchIcon,
} from "lucide-react";
import type { RuntimePublicDto } from "@console/core/types/api";
import { RuntimeConnectionForm } from "@/components/forms/runtime-connection-form";
import { RuntimeLifecycle } from "@/components/settings/runtime-lifecycle";
import { RuntimeDashboardLifecycle } from "@/components/settings/runtime-dashboard-lifecycle";
import { RuntimeMutationProvider } from "@/components/settings/runtime-mutation-provider";
import { SettingsContent } from "@/components/settings/settings-content";
import {
  Badge,
  ButtonLink,
  Card,
  CardSurface,
  SectionHeading,
} from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import { Link, useRouter } from "@/lib/router";
import {
  normalizeRuntimeSection,
  runtimeSettingsHref,
  type RuntimeMode,
  type RuntimeSection,
} from "@/lib/runtime/settings-navigation";

type RuntimeSearch = {
  mode?: RuntimeMode;
  section?: RuntimeSection;
};

const SECTIONS = [
  { value: "status", label: "État", icon: GaugeIcon },
  { value: "connection", label: "Connexion", icon: CableIcon },
  { value: "workspace", label: "Dossier", icon: FolderCheckIcon },
  { value: "services", label: "Services", icon: ActivityIcon },
  { value: "advanced", label: "Avancé", icon: WrenchIcon },
] as const satisfies ReadonlyArray<{
  value: RuntimeSection;
  label: string;
  icon: typeof GaugeIcon;
}>;

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

export function SettingsRuntimeScreen({ search }: { search: RuntimeSearch }) {
  const router = useRouter();
  const [runtime, setRuntime] = useState<RuntimePublicDto | null>(null);
  const onRuntimeChange = useCallback((next: RuntimePublicDto) => setRuntime(next), []);
  const resolvedMode = search.mode ?? (runtime?.transport === "ssh" ? "ssh" : runtime ? "direct" : undefined);
  const displayedMode = resolvedMode ?? "direct";
  const section = normalizeRuntimeSection(search.section, resolvedMode);

  useEffect(() => {
    if (!resolvedMode || !search.section || section === search.section) return;
    router.replace(runtimeSettingsHref(resolvedMode, section));
  }, [resolvedMode, router, search.section, section]);

  return (
    <RuntimeMutationProvider>
      <SettingsContent>
        <SectionHeading
          title="Runtime Hermes"
          description="Configurez l’accès, le dossier de travail et les services Hermes sans mélanger les opérations courantes et avancées."
          action={runtimeBadge(runtime, search.mode)}
        />

        <RuntimeSectionNavigation
          mode={displayedMode}
          section={section}
          workspaceRequired={Boolean(
            displayedMode === "ssh" &&
            runtime?.transport === "ssh" &&
            runtime.workspaceStatus !== "ready",
          )}
        />

        <RuntimeConnectionForm
          mode={search.mode}
          section={section}
          onRuntimeChange={onRuntimeChange}
        />

        {section === "status" ? (
          <RuntimeStatusPanel runtime={runtime} mode={displayedMode} />
        ) : null}

        {section === "services" ? (
          runtime ? (
            <div className="space-y-4">
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
            </div>
          ) : (
            <RuntimePanelSkeleton />
          )
        ) : null}
      </SettingsContent>
    </RuntimeMutationProvider>
  );
}

function RuntimeSectionNavigation({
  mode,
  section,
  workspaceRequired,
}: {
  mode: RuntimeMode;
  section: RuntimeSection;
  workspaceRequired: boolean;
}) {
  const router = useRouter();
  const availableSections = SECTIONS;
  const current = availableSections.find((candidate) => candidate.value === section) ?? SECTIONS[0];

  return (
    <nav aria-label="Sections du runtime" className="border-b border-seam">
      <div className="pb-3 sm:hidden">
        <label htmlFor="runtime-section" className="sr-only">
          Section du runtime
        </label>
        <Select
          value={section}
          onValueChange={(next) => {
            router.push(runtimeSettingsHref(mode, next as RuntimeSection));
          }}
        >
          <SelectTrigger id="runtime-section" className="min-h-11">
            <SelectValue>
              <current.icon aria-hidden className="size-4" />
              {current.label}
              {current.value === "workspace" && workspaceRequired ? (
                <span className="text-warn-700">Requis</span>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableSections.map((candidate) => (
              <SelectItem key={candidate.value} value={candidate.value}>
                <candidate.icon aria-hidden className="size-4" />
                {candidate.label}
                {candidate.value === "workspace" && workspaceRequired ? (
                  <span className="text-warn-700">Requis</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden min-w-0 items-center gap-1 sm:flex" role="list">
        {availableSections.map((candidate) => {
          const active = candidate.value === section;
          return (
            <Link
              key={candidate.value}
              href={runtimeSettingsHref(mode, candidate.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex min-h-11 items-center gap-2 rounded-t-lg px-3 text-[0.75rem] font-medium text-muted-foreground transition-colors",
                "hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                active && "bg-muted/60 text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-primary",
              )}
            >
              <candidate.icon aria-hidden className="size-4" />
              <span>{candidate.label}</span>
              {candidate.value === "workspace" && workspaceRequired ? (
                <Badge tone="warning" className="px-1.5 py-0 text-[0.625rem]">
                  Requis
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function RuntimeStatusPanel({
  runtime,
  mode,
}: {
  runtime: RuntimePublicDto | null;
  mode: RuntimeMode;
}) {
  if (!runtime) return <RuntimePanelSkeleton />;

  const savedTarget = runtime.configured
    ? runtime.transport === "ssh"
      ? `${runtime.sshUser ?? "utilisateur"}@${runtime.sshHost ?? "hôte"}:${runtime.sshPort}`
      : runtime.baseUrl ?? "Adresse non renseignée"
    : "Aucune cible enregistrée";
  const workspaceLabel =
    runtime.transport !== "ssh"
      ? "Diagnostic disponible dans l’onglet Dossier"
      : runtime.workspaceStatus === "ready"
        ? runtime.remoteWorkdir ?? "Prêt"
        : "Configuration requise";
  const health = runtime.configured
    ? runtime.lastHealthStatus === "healthy"
      ? "Opérationnel"
      : runtime.lastHealthStatus === "unauthorized"
        ? "Token invalide"
        : runtime.lastHealthStatus === "unreachable"
          ? "Injoignable"
          : "À vérifier"
    : "Non configuré";

  return (
    <Card>
      <CardSurface className="p-0">
        <div className="flex flex-col gap-3 border-b border-seam p-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-[0.8125rem] font-semibold">Runtime enregistré</h3>
            <p className="mt-1 max-w-[68ch] text-[0.6875rem] leading-5 text-muted-foreground">
              Cette synthèse décrit la cible réellement utilisée par la Console, pas un brouillon affiché dans Connexion.
            </p>
          </div>
          {!runtime.configured ? (
            <ButtonLink href={runtimeSettingsHref(mode, "connection")} variant="primary">
              Configurer la connexion
            </ButtonLink>
          ) : runtime.transport === "ssh" && runtime.workspaceStatus !== "ready" ? (
            <ButtonLink href={runtimeSettingsHref("ssh", "workspace")} variant="primary">
              Configurer le dossier
            </ButtonLink>
          ) : null}
        </div>

        <dl className="divide-y divide-seam text-[0.75rem]">
          <StatusRow label="État" value={health} />
          <StatusRow
            label="Transport"
            value={runtime.configured ? (runtime.transport === "ssh" ? "Tunnel SSH" : "Accès direct") : "Non défini"}
          />
          <StatusRow label="Cible" value={savedTarget} mono={runtime.configured} />
          <StatusRow label="Version" value={runtime.detectedVersion ?? "Non détectée"} mono />
          <StatusRow label="Token" value={runtime.tokenConfigured ? "Chiffré et enregistré" : "Absent"} />
          <StatusRow label="Dossier de travail" value={workspaceLabel} mono={runtime.transport === "ssh"} />
          <StatusRow
            label="Dernière vérification"
            value={runtime.lastCheckedAt ? formatRuntimeDate(runtime.lastCheckedAt) : "Jamais"}
          />
        </dl>
      </CardSurface>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words text-foreground", mono && "font-mono text-[0.6875rem]")}>{value}</dd>
    </div>
  );
}

function RuntimePanelSkeleton() {
  return (
    <Card>
      <CardSurface>
        <div className="space-y-3" role="status" aria-label="Chargement du runtime">
          <div className="h-4 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-10 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-10 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-10 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        </div>
      </CardSurface>
    </Card>
  );
}

function formatRuntimeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
