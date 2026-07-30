"use client";

import { useRouter } from "@/lib/router";
import { useState, useTransition } from "react";
import { AgentForm } from "@/components/forms/agent-form";
import { Badge, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";

type AgentView = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  model: string | null;
  archivedAt: string | null;
  runs: number;
  lastRunAt: string | null;
};

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

export function AgentDetailClient({ agent }: { agent: AgentView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const archived = Boolean(agent.archivedAt);

  return (
    <PageShell className="mx-auto max-w-5xl">
      <SectionHeading
        title={agent.name}
        description={agent.description ?? "Sans description"}
        action={
          <ButtonLink href="/runs/new" variant="primary">
            Lancer une mission
          </ButtonLink>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardSurface>
            <AgentForm
              agentId={agent.id}
              initial={{
                name: agent.name,
                description: agent.description ?? "",
                model: agent.model ?? "",
                instructions: agent.instructions,
              }}
            />
          </CardSurface>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardSurface>
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Activité
              </p>
              <dl className="mt-3 space-y-2 text-[0.75rem]">
                <Row label="Missions" value={String(agent.runs)} />
                <Row label="Dernière" value={formatRelative(agent.lastRunAt)} />
                <Row label="Modèle" value={agent.model ?? "hermes-agent"} />
              </dl>
            </CardSurface>
          </Card>
          <Card>
            <CardSurface>
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                État
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[0.75rem]">{archived ? "Archivé" : "Disponible"}</span>
                <Badge tone={archived ? "neutral" : "success"}>
                  {archived ? "Archivé" : "Actif"}
                </Badge>
              </div>
              {error ? (
                <p role="alert" className="mt-3 text-[0.6875rem] text-destructive">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={pending || archived}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      const response = await fetch(`/api/agents/${agent.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ archive: true }),
                      });
                      const body = (await response.json()) as { error?: { message?: string } };
                      if (!response.ok) {
                        throw new Error(body.error?.message ?? "Archivage impossible.");
                      }
                      router.push("/agents");
                      router.refresh();
                    } catch (reason) {
                      setError(reason instanceof Error ? reason.message : "Archivage impossible.");
                    }
                  });
                }}
                className="mt-4 w-full rounded-[10px] border border-neg-100 bg-neg-soft px-3 py-2 text-[0.75rem] font-medium text-neg-700 disabled:opacity-50"
              >
                {pending ? "Archivage…" : "Archiver l’agent"}
              </button>
            </CardSurface>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
