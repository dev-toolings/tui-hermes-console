"use client";

import { useRef, useState } from "react";
import { Link, useRouter } from "@/lib/router";
import { ArrowUpIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChatSurface } from "@/components/chat/openclaw-shell";
import {
  AGENT_MENTION_LISTBOX_ID,
  AgentMentionPopup,
  agentMentionOptionId,
} from "@/components/chat/agent-mention-popup";
import { useAgentMention } from "@/components/chat/use-agent-mention";
import { parseAgentMention } from "@console/core/modules/session/mentions";
import { useRuntimeStatus } from "@/components/shell/use-runtime-status";

/** OpenClaw `/new` — draft page; nothing persisted until first send. */
export function OpenClawNewSessionDraft() {
  const router = useRouter();
  const { refreshSessions } = useChatSurface();
  const runtime = useRuntimeStatus();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionPicker = useAgentMention(textareaRef, message, setMessage);
  const workspaceBlocked =
    runtime.runtime?.transport === "ssh" && runtime.runtime.workspaceStatus !== "ready";

  // Une mention n'ouvrant pas le message reste du texte libre : le dire tout de suite.
  const tokens = message.split(/\s+/);
  const strayMention =
    !parseAgentMention(message) &&
    mentionPicker.agents.some((agent) => tokens.includes(`@${agent.slug}`));

  const send = async () => {
    const text = message.trim();
    if (!text || submitting) return;
    if (workspaceBlocked) {
      setError("Configurez le dossier de travail distant avant de créer une session.");
      return;
    }

    // `@agent …` ne démarre jamais une session de chat : ça part en mission.
    const mention = parseAgentMention(text);
    if (mention && !mention.prompt) {
      setError(`Ajoutez une instruction après « @${mention.ref} ».`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Le formulaire rend déjà l'erreur sous le composer : pas de toast.
          "X-Hermes-Toast": "0",
        },
        body: JSON.stringify(
          mention ? { agentRef: mention.ref, message: mention.prompt } : { message: text },
        ),
      });
      const body = (await response.json()) as {
        threadId?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.threadId) {
        throw new Error(body.error?.message ?? "Could not create session.");
      }
      // La sidebar n'est plus remontée par la navigation : sans ce rafraîchissement,
      // la session créée manquerait de l'historique jusqu'au prochain sondage.
      if (!mention) void refreshSessions();
      router.push(mention ? `/runs/${body.threadId}` : `/chat/${body.threadId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-4 py-10">
      {/* Masqué quand le popup s'ouvre : il recouvrirait ce bloc de toute façon. */}
      <div
        className={cn(
          "mb-8 w-full max-w-xl text-center transition-opacity duration-150",
          mentionPicker.open && "opacity-0",
        )}
        aria-hidden={mentionPicker.open}
      >
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] text-xl font-bold text-primary-foreground shadow-sm">
          H
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Ready to chat</h1>
        <p className="mt-1.5 text-sm text-balance text-muted-foreground">
          Chat libre — la session est créée à l’envoi. Commencez par{" "}
          <code className="rounded bg-muted px-1">@slug</code> pour lancer un agent : une mission
          est créée à sa place.
        </p>
      </div>

      <div className="w-full max-w-xl">
        <div className="relative rounded-2xl border border-border bg-background p-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] transition-colors focus-within:border-muted-foreground/30">
          {mentionPicker.open ? (
            <AgentMentionPopup
              items={mentionPicker.items}
              activeIndex={mentionPicker.activeIndex}
              query={mentionPicker.query}
              loading={mentionPicker.loading}
              error={mentionPicker.error}
              onSelect={mentionPicker.select}
              onHover={mentionPicker.setActiveIndex}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              mentionPicker.syncFromCaret();
            }}
            onSelect={mentionPicker.syncFromCaret}
            onBlur={mentionPicker.close}
            onKeyDown={(event) => {
              if (mentionPicker.handleKeyDown(event)) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            disabled={workspaceBlocked}
            placeholder="Message… (@ pour appeler un agent)"
            role="combobox"
            aria-expanded={mentionPicker.open}
            aria-controls={mentionPicker.open ? AGENT_MENTION_LISTBOX_ID : undefined}
            aria-activedescendant={
              mentionPicker.open && mentionPicker.items.length
                ? agentMentionOptionId(mentionPicker.activeIndex)
                : undefined
            }
            className="max-h-40 min-h-[3.25rem] w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[0.6875rem] text-muted-foreground">
              Enter to send · Shift+Enter newline ·{" "}
              <span className="text-foreground/70">@</span> pour un agent
            </span>
            <button
              type="button"
              disabled={workspaceBlocked || submitting || !message.trim()}
              onClick={() => void send()}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
                (workspaceBlocked || submitting || !message.trim()) && "opacity-40",
              )}
              aria-label="Send"
            >
              {submitting ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>

        {workspaceBlocked ? (
          <p className="mt-3 text-center text-[0.75rem] text-warn-700">
            Connexion SSH valide, dossier Hermes requis.{" "}
            <Link href="/settings/runtime" className="font-medium underline underline-offset-2">
              Ouvrir les paramètres
            </Link>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            {error}
          </p>
        ) : strayMention ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            La mention doit ouvrir le message pour lancer un agent — sinon elle part en chat
            libre.
          </p>
        ) : null}
      </div>
    </div>
  );
}
