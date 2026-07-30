"use client";

import { useEffect, useRef } from "react";
import { SearchXIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentOption } from "@/lib/agents/list-client";

export const AGENT_MENTION_LISTBOX_ID = "agent-mention-listbox";

export function agentMentionOptionId(index: number) {
  return `${AGENT_MENTION_LISTBOX_ID}-option-${index}`;
}

/** Liste des agents proposés au-dessus du composer pendant la saisie d'un `@`. */
export function AgentMentionPopup({
  items,
  activeIndex,
  query,
  loading,
  error,
  onSelect,
  onHover,
}: {
  items: AgentOption[];
  activeIndex: number;
  query: string;
  loading: boolean;
  error: string | null;
  onSelect: (agent: AgentOption) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div className="fade-in slide-in-from-bottom-1 animate-in absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-seam bg-popover text-popover-foreground shadow-board-elevated duration-150">
      <div className="flex items-center justify-between border-b border-seam/60 px-3 py-1.5">
        <span className="text-[0.625rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Agents
        </span>
        {items.length ? (
          <span className="text-[0.625rem] text-muted-foreground tabular-nums">
            {items.length}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="px-3 py-3 text-sm text-destructive">{error}</p>
      ) : loading && !items.length ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Chargement des agents…</p>
      ) : !items.length ? (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
          <SearchXIcon className="size-4 shrink-0" />
          <span>
            Aucun agent pour <span className="font-medium text-foreground">@{query}</span>
          </span>
        </div>
      ) : (
        <ul
          id={AGENT_MENTION_LISTBOX_ID}
          role="listbox"
          aria-label="Agents"
          className="max-h-64 overflow-y-auto p-1 scrollbar-subtle"
        >
          {items.map((agent, index) => (
            <AgentMentionOption
              key={agent.id}
              agent={agent}
              index={index}
              query={query}
              active={index === activeIndex}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </ul>
      )}

      {/* Rien à naviguer sans résultat : ne garder que la sortie. */}
      <div className="flex items-center gap-3 border-t border-seam/60 px-3 py-1.5 text-[0.6875rem] text-muted-foreground">
        {items.length ? (
          <>
            <span className="flex items-center gap-1">
              <MentionKbd>↑↓</MentionKbd> naviguer
            </span>
            <span className="flex items-center gap-1">
              <MentionKbd>⏎</MentionKbd> choisir
            </span>
          </>
        ) : null}
        <span className="flex items-center gap-1">
          <MentionKbd>esc</MentionKbd> fermer
        </span>
      </div>
    </div>
  );
}

function AgentMentionOption({
  agent,
  index,
  query,
  active,
  onSelect,
  onHover,
}: {
  agent: AgentOption;
  index: number;
  query: string;
  active: boolean;
  onSelect: (agent: AgentOption) => void;
  onHover: (index: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        id={agentMentionOptionId(index)}
        role="option"
        aria-selected={active}
        // `mousedown` : le blur du textarea ne doit pas fermer avant le clic.
        onMouseDown={(event) => {
          event.preventDefault();
          onSelect(agent);
        }}
        onMouseEnter={() => onHover(index)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold uppercase transition-colors",
            active
              ? "bg-[image:var(--gradient-primary)] text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {agent.slug.slice(0, 1)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">
              @<HighlightedSlug slug={agent.slug} query={query} />
            </span>
            <span className="truncate text-xs text-muted-foreground">{agent.name}</span>
          </span>
          {agent.description ? (
            <span className="truncate text-xs text-muted-foreground/80">{agent.description}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Souligne la portion de slug déjà saisie — rend le filtrage lisible. */
function HighlightedSlug({ slug, query }: { slug: string; query: string }) {
  const at = query ? slug.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{slug}</>;

  return (
    <>
      {slug.slice(0, at)}
      <span className="text-primary">{slug.slice(at, at + query.length)}</span>
      {slug.slice(at + query.length)}
    </>
  );
}

function MentionKbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-seam/70 bg-muted px-1 font-sans text-[0.625rem] leading-4 text-muted-foreground">
      {children}
    </kbd>
  );
}
