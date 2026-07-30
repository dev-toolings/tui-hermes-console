import { Link } from "@/lib/router";
import { BotIcon, PlusIcon } from "lucide-react";
import { AgentCardActions } from "@/components/agents/agent-card-actions";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { HERMES_SEEDED_AGENT_ID } from "@console/core/modules/agents/identity";
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

  return (
    <PageShell>
      <SectionHeading
        title="Agents configurés"
        description="Un agent miroir du runtime Hermes. Seed via bun run db:seed — Hermes n’a pas d’API de profils."
        action={
          <ButtonLink href="/runs/new" variant="primary">
            <PlusIcon className="size-4" />
            Nouvelle mission
          </ButtonLink>
        }
      />

      {agents.length === 0 ? (
        <Card>
          <CardSurface className="py-10 text-center">
            <p className="text-sm font-medium">Aucun agent</p>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              Lance <code className="font-mono">bun run db:seed</code> avec Hermes joignable pour
              matérialiser l’agent runtime.
            </p>
          </CardSurface>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardSurface className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-[10px] bg-info-soft text-info-700">
                    <BotIcon className="size-5" />
                  </span>
                  <AgentCardActions
                    agentId={agent.id}
                    agentName={agent.name}
                    protectedAgent={agent.id === HERMES_SEEDED_AGENT_ID}
                  />
                </div>
                <h2 className="mt-4 text-sm font-semibold">{agent.name}</h2>
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
          ))}
        </div>
      )}

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

function Rule({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-surface-sunken p-3">
      <span className="font-mono text-[0.625rem] font-semibold text-primary">{number}</span>
      <p className="mt-2 font-medium">{title}</p>
      <p className="mt-1 leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
