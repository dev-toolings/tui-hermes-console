import Link from "next/link";
import {
  ActivityIcon,
  ArrowUpRightIcon,
  BotIcon,
  Clock3Icon,
  FileBoxIcon,
  PlusIcon,
  ServerIcon,
} from "lucide-react";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { RUN_STATUS, formatTokens, type RunStatus } from "@/lib/run-status";
import { runtimeTargetLabel, runtimeTransportLabel } from "@/lib/runtime/target";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { MissionsTable, type MissionRow } from "@/components/dashboard/missions-table";
import { listAgents } from "@/modules/agents/repository";
import { getRuntimePublic } from "@/modules/runtime/config";
import { getRunActivity, listThreads } from "@/modules/runs/repository";

export default async function DashboardPage() {
  const [agents, threads, runtime, activity] = await Promise.all([
    listAgents(),
    listThreads({ source: "mission" }),
    getRuntimePublic(),
    getRunActivity(30),
  ]);

  const active = threads.filter(
    (thread) => thread.latestRun && !RUN_STATUS[thread.latestRun.status as RunStatus].terminal,
  );
  const completed = threads.filter((thread) => thread.latestRun?.status === "completed");
  const tokens30d = activity.reduce((sum, point) => sum + point.tokens, 0);

  const missionRows: MissionRow[] = threads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    agentName: thread.agentName,
    updatedAt: thread.updatedAt,
    status: (thread.latestRun?.status ?? "pending") as RunStatus,
    totalTokens: thread.latestRun?.usage?.totalTokens ?? null,
  }));

  const runtimeTone =
    !runtime.configured
      ? ("warning" as const)
      : runtime.lastHealthStatus === "healthy"
        ? ("success" as const)
        : runtime.lastHealthStatus === "unreachable" ||
            runtime.lastHealthStatus === "unauthorized"
          ? ("danger" as const)
          : ("info" as const);

  const runtimeLabel =
    !runtime.configured
      ? "À configurer"
      : runtime.lastHealthStatus === "healthy"
        ? "Connecté"
        : runtime.lastHealthStatus === "unreachable"
          ? "Injoignable"
          : runtime.lastHealthStatus === "unauthorized"
            ? "Token invalide"
            : runtime.source === "env"
              ? "Env"
              : "Configuré";

  return (
    <PageShell>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Agents actifs"
          value={String(agents.length)}
          detail="Objets locaux à la Console"
          icon={BotIcon}
        />
        <Metric
          label="Missions en cours"
          value={String(active.length)}
          detail={active.length === 1 ? "1 conversation active" : `${active.length} conversations`}
          icon={ActivityIcon}
          tone="info"
        />
        <Metric
          label="Terminées"
          value={String(completed.length)}
          detail="Conversations avec dernier run completed"
          icon={Clock3Icon}
          tone="success"
        />
        <Metric
          label="Tokens (30 j)"
          value={tokens30d === 0 ? "0" : formatTokens(tokens30d)}
          detail="Consommation mesurée par le runtime"
          icon={FileBoxIcon}
        />
      </section>

      <Card>
        <CardSurface className="p-0">
          <ActivityChart data={activity} />
        </CardSurface>
      </Card>

      <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardSurface className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-seam px-4 py-3.5">
              <SectionHeading
                title="Missions récentes"
                description="État consolidé par la Console, indépendamment de la durée de rétention Hermes."
              />
              <ButtonLink href="/runs" variant="ghost">
                Tout voir
                <ArrowUpRightIcon className="size-3.5" />
              </ButtonLink>
            </div>
            <MissionsTable rows={missionRows.slice(0, 8)} />
          </CardSurface>
        </Card>

        <div className="flex w-full flex-col gap-4 self-start">
          <Card>
            <CardSurface>
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-warn-soft text-warn-700">
                  <ServerIcon className="size-4" />
                </span>
                <Badge tone={runtimeTone}>{runtimeLabel}</Badge>
              </div>
              <h2 className="mt-5 text-base font-semibold">Runtime Hermes</h2>
              {runtime.baseUrl ? (
                <>
                  {/* Nommer la machine qui exécute vraiment : en tunnel, la
                      baseUrl est vue depuis l'autre bout et laisse croire à une
                      exécution locale. */}
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">Exécution</p>
                  {/* `break-all` coupait « 8642 » en « 864 » + « 2 ». On casse
                      aux séparateurs, jamais au milieu d'un hôte ou d'un port. */}
                  <p className="mt-0.5 font-mono text-[0.75rem] leading-5 break-words text-foreground">
                    {runtimeTargetLabel(runtime)}
                  </p>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    {runtimeTransportLabel(runtime)}
                  </p>
                </>
              ) : (
                <p className="mt-1 break-all text-[0.8125rem] text-muted-foreground">
                  Connectez la Console à l’API Hermes, sur cette machine, un VPS ou une adresse
                  privée.
                </p>
              )}
              <ButtonLink href="/settings/runtime" variant="primary" className="mt-4 w-fit">
                {runtime.configured ? "Gérer la connexion" : "Configurer la connexion"}
              </ButtonLink>
            </CardSurface>
          </Card>

          <Card>
            <CardSurface>
              <SectionHeading title="Démarrage rapide" />
              <div className="mt-3 flex flex-col items-start gap-2">
                <ButtonLink href="/runs/new" variant="primary">
                  <PlusIcon className="size-4" />
                  Nouvelle mission
                </ButtonLink>
                <ButtonLink href="/agents/new">
                  <BotIcon className="size-4 text-muted-foreground" />
                  Créer un agent
                </ButtonLink>
              </div>
            </CardSurface>
          </Card>
        </div>
      </section>

      <Card>
        <CardSurface>
          <SectionHeading
            title="Agents"
            description="Les agents sont configurés dans la Console et injectés dans chaque mission."
            action={<ButtonLink href="/agents">Gérer les agents</ButtonLink>}
          />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {agents.length === 0 ? (
              <p className="text-[0.75rem] text-muted-foreground md:col-span-3">
                Aucun agent — créez-en un pour démarrer.
              </p>
            ) : (
              agents.slice(0, 6).map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="rounded-xl border border-border bg-surface-sunken p-3 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-ai-tertiary text-muted-foreground">
                      <BotIcon className="size-4" />
                    </span>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {agent.runs} mission{agent.runs === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="mt-3 block text-[0.8125rem] font-medium">{agent.name}</span>
                  <span className="mt-1 line-clamp-2 text-[0.6875rem] leading-5 text-muted-foreground">
                    {agent.description ?? "Sans description"}
                  </span>
                </Link>
              ))
            )}
          </div>
        </CardSurface>
      </Card>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof BotIcon;
  tone?: "neutral" | "info" | "success";
}) {
  const tones = {
    neutral: "bg-ai-tertiary text-muted-foreground",
    info: "bg-info-soft text-info-700",
    success: "bg-pos-soft text-pos-700",
  };
  return (
    <Card>
      <CardSurface>
        <div className="flex items-start justify-between gap-3">
          <span>
            <span className="block text-[0.6875rem] font-medium text-muted-foreground">{label}</span>
            <strong className="mt-2 block text-2xl font-semibold tracking-tight">{value}</strong>
          </span>
          <span className={`flex size-8 items-center justify-center rounded-[10px] ${tones[tone]}`}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 text-[0.6875rem] text-muted-foreground">{detail}</p>
      </CardSurface>
    </Card>
  );
}
