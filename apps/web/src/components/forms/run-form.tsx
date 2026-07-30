"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUpIcon, InfoIcon, LoaderCircleIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/boardui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AgentOption = {
  id: string;
  name: string;
};

export function RunForm() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/agents", { cache: "no-store" });
        const body = (await response.json()) as {
          agents?: AgentOption[];
          error?: { message?: string };
        };
        if (!response.ok) {
          throw new Error(body.error?.message ?? "Impossible de charger les agents.");
        }
        if (!cancelled) {
          const list = body.agents ?? [];
          setAgents(list);
          if (list[0] && !agentId) setAgentId(list[0].id);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Impossible de charger les agents.");
        }
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const form = new FormData(event.currentTarget);
        if (!agentId) {
          setError("Choisissez un agent.");
          setSubmitting(false);
          return;
        }

        try {
          const response = await fetch("/api/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId,
              message: String(form.get("instruction") ?? ""),
            }),
          });
          const body = (await response.json()) as {
            threadId?: string;
            error?: { message?: string };
          };
          if (!response.ok || !body.threadId) {
            throw new Error(body.error?.message ?? "La mission n’a pas pu être créée.");
          }
          router.push(`/runs/${body.threadId}`);
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : "La mission n’a pas pu être créée.",
          );
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="run-agent" className="text-[0.8125rem] font-medium">
          Agent
        </label>
        <Select
          value={agentId || undefined}
          onValueChange={setAgentId}
          disabled={loadingAgents || agents.length === 0}
        >
          <SelectTrigger id="run-agent" className="w-full">
            <SelectValue
              placeholder={loadingAgents ? "Chargement…" : "Choisir un agent"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[0.8125rem] font-medium">Instruction</span>
        <span className="text-[0.6875rem] text-muted-foreground">
          Décrivez un résultat fini et vérifiable.
        </span>
        <textarea
          name="instruction"
          required
          rows={8}
          placeholder="Analyse les fichiers fournis et produis…"
          className={`${input} min-h-40 resize-y py-3`}
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-[0.8125rem] font-medium">Fichiers d’entrée</p>
        <p className="text-[0.6875rem] text-muted-foreground">
          Ils seront déposés dans l’espace de travail partagé avec le runtime.
        </p>
        <div className="flex min-h-32 cursor-not-allowed flex-col items-center justify-center rounded-2xl border border-dashed border-input bg-surface-sunken p-5 text-center opacity-70">
          <FileUpIcon className="size-5 text-muted-foreground" />
          <span className="mt-2 text-[0.8125rem] font-medium">Pièces jointes bientôt disponibles</span>
          <span className="mt-1 text-[0.6875rem] text-muted-foreground">
            La première verticale dialogue en texte avec Hermes.
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-info-soft p-3 text-[0.75rem] text-info-700">
        <p className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          La conversation et ses événements sont persistés dans PostgreSQL. Hermes reste seul
          responsable de l’exécution des outils.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p
          role={error ? "alert" : "status"}
          className={`text-[0.6875rem] ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ??
            (agents.length === 0 && !loadingAgents
              ? "Aucun agent en base — créez-en un d’abord."
              : "Une conversation persistée sera créée par soumission.")}
        </p>
        <Button type="submit" variant="primary" disabled={submitting || agents.length === 0}>
          {submitting ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {submitting ? "Connexion à Hermes…" : "Lancer la conversation"}
        </Button>
      </div>
    </form>
  );
}

const input =
  "min-h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[0.8125rem] text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
