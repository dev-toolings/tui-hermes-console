"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ComposerPrimitive,
  unstable_useMentionAdapter,
  unstable_useSlashCommandAdapter,
  useAuiState,
  type Unstable_DirectiveFormatter,
  type Unstable_TriggerItem,
} from "@assistant-ui/react";
import { BotIcon, CommandIcon } from "lucide-react";
import { getAgentsClient, type AgentOption } from "@/lib/agents/list-client";
import type { ThreadSource } from "@console/core/types/domain";

type CommandSuggestion = {
  id: string;
  label: string;
  description: string;
  template: string;
};

const COMMON_COMMANDS: CommandSuggestion[] = [
  {
    id: "agent-create",
    label: "/agent create",
    description: "Créer un agent réutilisable dans le catalogue",
    template: "/agent create Nom | instructions",
  },
  {
    id: "model",
    label: "/model",
    description: "Choisir le modèle de cette session",
    template: "/model modèle",
  },
  {
    id: "connector-status",
    label: "/connector status",
    description: "Vérifier les connecteurs requis",
    template: "/connector status",
  },
  {
    id: "help",
    label: "/help",
    description: "Afficher toutes les commandes disponibles",
    template: "/help",
  },
];

const MISSION_AGENT_COMMANDS: CommandSuggestion[] = [
  {
    id: "agent-show",
    label: "/agent show",
    description: "Afficher l’agent attaché à la mission",
    template: "/agent show",
  },
  {
    id: "agent-edit",
    label: "/agent edit",
    description: "Modifier un champ de l’agent attaché",
    template: "/agent edit instructions=",
  },
  {
    id: "agent-switch",
    label: "/agent switch",
    description: "Attacher un autre agent à cette mission",
    template: "/agent switch slug",
  },
];

export function getSessionCommandSuggestions(source: ThreadSource): CommandSuggestion[] {
  return source === "mission"
    ? [...COMMON_COMMANDS, ...MISSION_AGENT_COMMANDS]
    : COMMON_COMMANDS;
}

export const agentMentionFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) => `@${item.id}`,
  parse: plainTextSegments,
};

export const commandSuggestionFormatter: Unstable_DirectiveFormatter = {
  serialize: (item) =>
    [...COMMON_COMMANDS, ...MISSION_AGENT_COMMANDS].find((command) => command.id === item.id)
      ?.template ?? item.label,
  parse: plainTextSegments,
};

function plainTextSegments(text: string) {
  return text ? [{ kind: "text" as const, text }] : [];
}

/** Sélecteurs clavier `@` et `/` du composer assistant-ui des threads existants. */
export function XuluxComposerSuggestions({ source }: { source: ThreadSource }) {
  const composerText = useAuiState((state) => state.composer.text);
  const mentionActive = /(?:^|\s)@[\w-]*$/u.test(composerText);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const requestedForCurrentMention = useRef(false);

  useEffect(() => {
    if (!mentionActive) {
      requestedForCurrentMention.current = false;
      return;
    }
    if (requestedForCurrentMention.current) return;
    requestedForCurrentMention.current = true;
    setLoadingAgents(true);
    setAgentError(null);
    getAgentsClient({ refresh: true })
      .then(setAgents)
      .catch((reason: unknown) => {
        requestedForCurrentMention.current = false;
        setAgentError(
          reason instanceof Error ? reason.message : "Impossible de charger les agents.",
        );
      })
      .finally(() => setLoadingAgents(false));
  }, [mentionActive]);

  const mentionItems = useMemo(
    () => agents.map((agent) => ({
      id: agent.slug,
      type: "agent",
      label: agent.name,
      description: agent.description ?? `@${agent.slug}`,
    })),
    [agents],
  );
  const mention = unstable_useMentionAdapter({
    items: mentionItems,
    includeModelContextTools: false,
    formatter: agentMentionFormatter,
  });

  const commandSuggestions = getSessionCommandSuggestions(source);
  const slash = unstable_useSlashCommandAdapter({
    commands: commandSuggestions.map((command) => ({
      id: command.id,
      label: command.label,
      description: command.description,
      execute: () => undefined,
    })),
  });

  return (
    <>
      <ComposerPrimitive.Unstable_TriggerPopover
        char="@"
        adapter={mention.adapter}
        isLoading={loadingAgents}
        aria-label="Agents"
        className={popoverClass}
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Directive
          {...mention.directive}
        />
        <SuggestionItems
          icon={<BotIcon className="size-3.5" />}
          title="Agents"
          loading={loadingAgents}
          error={agentError}
          empty="Aucun agent actif."
        />
      </ComposerPrimitive.Unstable_TriggerPopover>

      <ComposerPrimitive.Unstable_TriggerPopover
        char="/"
        adapter={slash.adapter}
        aria-label="Commandes"
        className={popoverClass}
      >
        <ComposerPrimitive.Unstable_TriggerPopover.Directive
          formatter={commandSuggestionFormatter}
        />
        <SuggestionItems
          icon={<CommandIcon className="size-3.5" />}
          title="Commandes"
          loading={false}
          error={null}
          empty="Aucune commande correspondante."
        />
      </ComposerPrimitive.Unstable_TriggerPopover>
    </>
  );
}

const popoverClass =
  "absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-xl border border-seam bg-popover text-popover-foreground shadow-board-elevated";

function SuggestionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-seam/60 px-3 py-2 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
      {icon}
      {title}
    </div>
  );
}

function SuggestionItems({
  icon,
  title,
  loading,
  error,
  empty,
}: {
  icon: ReactNode;
  title: string;
  loading: boolean;
  error: string | null;
  empty: string;
}) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItems>
      {(items) => {
        return (
          <>
            <SuggestionHeader icon={icon} title={title} />
            {error ? (
              <p className="px-3 py-3 text-sm text-destructive">{error}</p>
            ) : loading && !items.length ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Chargement…</p>
            ) : !items.length ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto p-1 scrollbar-subtle">
                {items.map((item, index) => (
                  <SuggestionItem key={item.id} item={item} index={index} />
                ))}
              </div>
            )}
          </>
        );
      }}
    </ComposerPrimitive.Unstable_TriggerPopoverItems>
  );
}

function SuggestionItem({ item, index }: { item: Unstable_TriggerItem; index: number }) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverItem
      item={item}
      index={index}
      className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40 data-[highlighted]:bg-accent"
    >
      <span className="text-sm font-medium text-foreground">{item.label}</span>
      {item.description ? (
        <span className="text-xs text-muted-foreground">{item.description}</span>
      ) : null}
    </ComposerPrimitive.Unstable_TriggerPopoverItem>
  );
}
