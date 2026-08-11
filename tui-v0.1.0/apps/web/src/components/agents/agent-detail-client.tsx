"use client";

import { useRouter } from "@/lib/router";
import { useState } from "react";
import { ArchiveIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { AgentForm } from "@/components/forms/agent-form";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardSurface,
  PageShell,
  SectionHeading,
} from "@/components/ui/boardui";

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
  const [pendingAction, setPendingAction] = useState<
    "archive" | "restore" | "delete" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const archived = Boolean(agent.archivedAt);

  async function setArchived(archive: boolean) {
    setError(null);
    setPendingAction(archive ? "archive" : "restore");
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "updated",
        },
        body: JSON.stringify({ archive }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(
          body.error?.message ??
            (archive ? "Archivage impossible." : "Restauration impossible."),
        );
      }
      router.push("/agents");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Mise à jour impossible.");
      setPendingAction(null);
    }
  }

  async function deletePermanently() {
    if (
      !window.confirm(
        `Supprimer définitivement « ${agent.name} » ?\n\nL’agent sera retiré de la base et les sessions Hermes liées seront effacées. Cette action est irréversible.`,
      )
    ) {
      return;
    }
    setError(null);
    setPendingAction("delete");
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
        headers: { "X-Hermes-Toast": "deleted" },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Suppression impossible.");
      }
      router.push("/agents");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
      setPendingAction(null);
    }
  }

  return (
    <PageShell className="mx-auto max-w-5xl">
      <SectionHeading
        title={agent.name}
        description={agent.description ?? "Sans description"}
        action={
          archived ? null : (
            <ButtonLink href="/tasks/new" variant="primary">
              Lancer une mission
            </ButtonLink>
          )
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
              {archived ? (
                <div className="mt-4 space-y-2">
                  <Button
                    className="w-full"
                    disabled={pendingAction !== null}
                    leadingIcon={RotateCcwIcon}
                    onClick={() => void setArchived(false)}
                  >
                    {pendingAction === "restore" ? "Restauration…" : "Restaurer l’agent"}
                  </Button>
                  <Button
                    className="w-full"
                    variant="danger"
                    disabled={pendingAction !== null}
                    leadingIcon={Trash2Icon}
                    onClick={() => void deletePermanently()}
                  >
                    {pendingAction === "delete" ? "Suppression…" : "Supprimer définitivement"}
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-4 w-full"
                  disabled={pendingAction !== null}
                  leadingIcon={ArchiveIcon}
                  onClick={() => void setArchived(true)}
                >
                  {pendingAction === "archive" ? "Archivage…" : "Archiver l’agent"}
                </Button>
              )}
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
