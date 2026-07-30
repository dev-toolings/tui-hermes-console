import Link from "next/link";
import { ActivityIcon, BookOpenIcon, BracesIcon, HeartPulseIcon } from "lucide-react";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { getRuntimePublic, resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { testHermesRuntimeAgainst } from "@/modules/runtime/hermes-adapter";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const runtime = await getRuntimePublic();

  let probe: {
    ok: boolean;
    version: string | null;
    latencyMs: number | null;
    error: string | null;
    features: string[];
  } = {
    ok: false,
    version: runtime.detectedVersion,
    latencyMs: null,
    error: null,
    features: [],
  };

  if (runtime.configured) {
    const started = Date.now();
    try {
      const config = await resolveHermesRuntimeConfig();
      const result = await testHermesRuntimeAgainst(config);
      const features = result.capabilities.features
        ? Object.entries(result.capabilities.features)
            .filter(([, enabled]) => enabled === true)
            .map(([name]) => name)
            .slice(0, 12)
        : [];
      const version =
        typeof result.health === "object" &&
        result.health &&
        "version" in result.health &&
        typeof (result.health as { version?: unknown }).version === "string"
          ? (result.health as { version: string }).version
          : runtime.detectedVersion;
      probe = {
        ok: true,
        version,
        latencyMs: Date.now() - started,
        error: null,
        features,
      };
    } catch (error) {
      probe = {
        ok: false,
        version: runtime.detectedVersion,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Probe runtime échoué.",
        features: [],
      };
    }
  }

  const hermesTone = !runtime.configured
    ? ("warning" as const)
    : probe.ok
      ? ("success" as const)
      : ("danger" as const);
  const hermesLabel = !runtime.configured
    ? "Non configuré"
    : probe.ok
      ? probe.version
        ? `Joignable · ${probe.version}`
        : "Joignable"
      : "Injoignable";

  const report = [
    `console.web          ready`,
    `runtime.source       ${runtime.source}`,
    `runtime.configured   ${runtime.configured}`,
    `runtime.base_url     ${runtime.baseUrl ?? "—"}`,
    `runtime.health       ${probe.ok ? "healthy" : runtime.configured ? "unreachable" : "not_configured"}`,
    `runtime.version      ${probe.version ?? "—"}`,
    `runtime.latency_ms   ${probe.latencyMs ?? "—"}`,
    `runtime.token        ${runtime.tokenConfigured ? "present (hidden)" : "missing"}`,
    `runtime.features     ${probe.features.length ? probe.features.join(",") : "unknown"}`,
    `edge.relay           not_in_scope_v0`,
    `probe.error          ${probe.error ?? "—"}`,
  ].join("\n");

  return (
    <PageShell>
      <SectionHeading
        title="Diagnostic"
        description="Vérifiez la Console et Hermes sans exposer de secret. Edge/Relay est hors périmètre v0.1."
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <Diagnostic icon={HeartPulseIcon} title="Console web" value="Disponible" tone="success" />
        <Diagnostic
          icon={ActivityIcon}
          title="Edge ou Relay"
          value="Hors périmètre"
          tone="neutral"
        />
        <Diagnostic icon={BracesIcon} title="Runtime Hermes" value={hermesLabel} tone={hermesTone} />
      </div>
      <Card>
        <CardSurface>
          <SectionHeading
            title="Rapport de diagnostic"
            description="Versions, capacités et latence mesurées à l’instant — jamais le token."
            action={
              <ButtonLink href="/settings/runtime" variant="primary">
                Runtime
              </ButtonLink>
            }
          />
          <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-sunken p-4 font-mono text-[0.6875rem] leading-5 text-muted-foreground">
            {report}
          </pre>
        </CardSurface>
      </Card>
      <Card>
        <CardSurface className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info-700">
            <BookOpenIcon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-medium">Événements bruts</span>
            <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
              Sur une conversation <code className="font-mono">thr_*</code>, le flux SSE et les
              événements persistés restent consultables dans l’écran mission.
            </span>
          </span>
          <Link
            href="/runs"
            className="text-[0.75rem] font-medium text-primary hover:underline"
          >
            Voir les missions
          </Link>
        </CardSurface>
      </Card>
    </PageShell>
  );
}

function Diagnostic({
  icon: Icon,
  title,
  value,
  tone,
}: {
  icon: typeof ActivityIcon;
  title: string;
  value: string;
  tone: "success" | "warning" | "neutral" | "danger";
}) {
  return (
    <Card>
      <CardSurface>
        <div className="flex items-center justify-between gap-3">
          <Icon className="size-4 text-muted-foreground" />
          <Badge tone={tone}>{value}</Badge>
        </div>
        <p className="mt-4 text-[0.8125rem] font-medium">{title}</p>
      </CardSurface>
    </Card>
  );
}
