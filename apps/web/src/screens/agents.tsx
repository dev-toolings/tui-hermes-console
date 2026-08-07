import { Link } from "@/lib/router";
import { BotIcon, PlusIcon } from "lucide-react";
import { AgentCardActions } from "@/components/agents/agent-card-actions";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import type { AgentsData } from "@/loaders";

function formatRelative(iso: string | null) {
  if (!iso) return "Jamais";
  const date = new Date(iso);
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function AgentsScreen({ data }: { data: AgentsData }) {
  const { agents } = data;
  const activeAgents = agents.filter((agent) => !agent.archivedAt);
  const archivedAgents = agents.filter((agent) => agent.archivedAt);

  return (
    <PageShell>
      <SectionHeading
        title="Agents configurés"
        description="Les agents actifs peuvent recevoir de nouvelles missions. Les agents archivés restent disponibles pour restauration ou suppression."
        action={
          <ButtonLink href="/tasks/new" variant="primary">
            <PlusIcon className="size-4" />
            Nouvelle mission
          </ButtonLink>
        }
      />

      {activeAgents.length === 0 ? (
        <Card>
          <CardSurface className="py-10 text-center">
            <p className="text-sm font-medium">Aucun agent</p>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              Créez votre premier agent pour lui confier des missions avec ses propres instructions.
            </p>
            <ButtonLink href="/agents/new" className="mt-4">
              <PlusIcon className="size-4" />
              Créer un agent
            </ButtonLink>
          </CardSurface>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {activeAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      )}

      {archivedAgents.length > 0 ? (
        <section className="space-y-3" aria-labelledby="archived-agents-title">
          <div>
            <h2 id="archived-agents-title" className="text-sm font-semibold">
              Agents archivés
            </h2>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              Indisponibles pour les nouvelles missions. Restaurez-les ou supprimez-les
              définitivement.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {archivedAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
          </div>
        </section>
      ) : null}

      <Card>
        <CardSurface className="p-0">
          <div className="border-b border-seam px-4 py-3.5">
            <SectionHeading
              title="Modèle d’exécution"
              description="Les instructions sont injectées à chaque lancement, sans provisioning de profil côté Hermes."
            />
          </div>
          <div className="grid gap-3 p-4 text-[0.75rem] md:grid-cols-3">
            <Rule number="01" title="Console" body="Conserve l’identité et les instructions de l’agent." />
            <Rule number="02" title="Mission" body="Capture le prompt, les fichiers et le statut persistant." />
            <Rule number="03" title="Hermes" body="Exécute avec ses propres outils et renvoie les événements." />
          </div>
        </CardSurface>
      </Card>
    </PageShell>
  );
}

function AgentCard({ agent }: { agent: AgentsData["agents"][number] }) {
  const archived = Boolean(agent.archivedAt);

  return (
    <Card>
      <CardSurface className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 items-center justify-center rounded-[10px] bg-info-soft text-info-700">
            <BotIcon className="size-5" />
          </span>
          <AgentCardActions
            agentId={agent.id}
            agentName={agent.name}
            archived={archived}
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold">{agent.name}</h2>
          {archived ? <Badge>Archivé</Badge> : null}
        </div>
        <p className="mt-1 flex-1 text-[0.75rem] leading-5 text-muted-foreground">
          {agent.description ?? "Sans description"}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge>{agent.model ?? "hermes-agent"}</Badge>
          <span className="text-[0.6875rem] text-muted-foreground">
            {agent.runs} mission{agent.runs === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-seam pt-3">
          <span className="text-[0.6875rem] text-muted-foreground">
            Dernière : {formatRelative(agent.lastRunAt)}
          </span>
          <Link
            href={`/agents/${agent.id}`}
            className="text-[0.75rem] font-medium text-primary hover:underline"
          >
            Configurer
          </Link>
        </div>
      </CardSurface>
    </Card>
  );
}

function Rule({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-surface-sunken p-3">
      <span className="font-mono text-[0.625rem] font-semibold text-primary">{number}</span>
      <p className="mt-2 font-medium">{title}</p>
      <p className="mt-1 leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
