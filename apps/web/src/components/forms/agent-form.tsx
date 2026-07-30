"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/boardui";

export function AgentForm({
  agentId,
  initial,
}: {
  agentId?: string;
  initial?: { name: string; description: string; instructions: string; model: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setSaved(false);
        setError(null);
        const form = new FormData(event.currentTarget);
        const payload = {
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? "") || null,
          instructions: String(form.get("instructions") ?? ""),
          model: String(form.get("model") ?? "") || null,
        };

        try {
          const response = await fetch(agentId ? `/api/agents/${agentId}` : "/api/agents", {
            method: agentId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const body = (await response.json()) as {
            agent?: { id: string };
            error?: { message?: string };
          };
          if (!response.ok || !body.agent) {
            throw new Error(body.error?.message ?? "L’agent n’a pas pu être enregistré.");
          }
          setSaved(true);
          if (!agentId) {
            router.push(`/agents/${body.agent.id}`);
            router.refresh();
            return;
          }
          router.refresh();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
        } finally {
          setSaving(false);
        }
      }}
      className="space-y-5"
    >
      <Field label="Nom" required>
        <input
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="Analyste documentaire"
          className={input}
        />
      </Field>
      <Field label="Description" hint="Visible lors du choix de l’agent.">
        <input
          name="description"
          defaultValue={initial?.description}
          placeholder="Ce que cet agent sait faire"
          className={input}
        />
      </Field>
      <Field
        label="Instructions"
        required
        hint="Injectées dans le prompt système de chaque mission. Aucun profil Hermes n’est créé."
      >
        <textarea
          name="instructions"
          required
          defaultValue={initial?.instructions}
          rows={9}
          placeholder="Tu analyses les documents fournis…"
          className={`${input} min-h-44 resize-y py-2.5`}
        />
      </Field>
      <Field label="Modèle" hint="Optionnel. Transmis tel quel au runtime.">
        <input
          name="model"
          defaultValue={initial?.model}
          placeholder="Laisser vide pour le modèle du runtime"
          className={input}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {error ? (
          <p role="alert" className="text-[0.8125rem] text-destructive">
            {error}
          </p>
        ) : saved ? (
          <p role="status" className="flex items-center gap-2 text-[0.8125rem] text-pos-700">
            <CheckIcon className="size-4" />
            Agent enregistré en base.
          </p>
        ) : (
          <p className="text-[0.6875rem] text-muted-foreground">Nom et instructions obligatoires.</p>
        )}
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
          {saving ? "Enregistrement…" : "Enregistrer l’agent"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-1 text-[0.8125rem] font-medium">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {hint ? <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const input =
  "min-h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[0.8125rem] text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
