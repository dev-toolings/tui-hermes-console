"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { getAgentsClient, type AgentOption } from "@/lib/agents/list-client";
import { findMentionQuery, type MentionQuery } from "@/modules/session/mentions";

type UseAgentMention = {
  open: boolean;
  items: AgentOption[];
  /** Texte saisi après le `@`, pour surligner le filtre. */
  query: string;
  activeIndex: number;
  loading: boolean;
  error: string | null;
  /** Agents connus — vide tant qu'aucun `@` n'a été tapé. */
  agents: AgentOption[];
  setActiveIndex: (index: number) => void;
  select: (agent: AgentOption) => void;
  close: () => void;
  /** À brancher sur `onChange`, `onSelect` et `onClick` du textarea. */
  syncFromCaret: () => void;
  /** Renvoie `true` quand la touche a été consommée par le popup. */
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
};

function matches(agent: AgentOption, query: string) {
  const needle = query.toLowerCase();
  return (
    agent.slug.toLowerCase().includes(needle) || agent.name.toLowerCase().includes(needle)
  );
}

/**
 * Autocomplétion `@agent` pour un `<textarea>` contrôlé : repère le token sous
 * le curseur, charge les agents à la première mention, et remplace le token par
 * `@slug ` à la sélection.
 */
export function useAgentMention(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (next: string) => void,
): UseAgentMention {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const requested = useRef(false);

  const items = useMemo(
    () => (mention ? agents.filter((agent) => matches(agent, mention.query)) : []),
    [agents, mention],
  );
  const open = Boolean(mention) && !dismissed;
  // La liste rétrécit à la frappe : borner plutôt que synchroniser un état.
  const activeIndex = items.length ? Math.min(rawActiveIndex, items.length - 1) : 0;

  const loadAgents = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setLoading(true);
    getAgentsClient()
      .then(setAgents)
      .catch((reason: unknown) => {
        // Un échec ne doit pas bloquer la frappe : le popup affiche l'erreur.
        requested.current = false;
        setError(reason instanceof Error ? reason.message : "Impossible de charger les agents.");
      })
      .finally(() => setLoading(false));
  }, []);

  const syncFromCaret = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = findMentionQuery(textarea.value, textarea.selectionStart ?? 0);
    setMention(next);
    if (!next) {
      setDismissed(false);
      return;
    }
    setActiveIndex(0);
    loadAgents();
  }, [loadAgents, textareaRef]);

  const close = useCallback(() => setDismissed(true), []);

  const select = useCallback(
    (agent: AgentOption) => {
      if (!mention) return;
      const next = `${value.slice(0, mention.start)}@${agent.slug} ${value.slice(mention.end)}`;
      const caret = mention.start + agent.slug.length + 2;
      setValue(next);
      setMention(null);
      setDismissed(false);
      // Le textarea est contrôlé : repositionner après le rendu de `next`.
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    },
    [mention, setValue, textareaRef, value],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return false;

      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }
      if (!items.length) return false;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const agent = items[activeIndex];
        if (!agent) return false;
        event.preventDefault();
        select(agent);
        return true;
      }
      return false;
    },
    [activeIndex, close, items, open, select],
  );

  return {
    open,
    items,
    query: mention?.query ?? "",
    activeIndex,
    loading,
    error,
    agents,
    setActiveIndex,
    select,
    close,
    syncFromCaret,
    handleKeyDown,
  };
}
