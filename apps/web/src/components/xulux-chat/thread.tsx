"use client";

import { XuluxTooltipIconButton } from "./tooltip-icon-button";
import { cn } from "@/lib/utils";
import { ThreadPrimitive, useAuiState, useThreadViewport } from "@assistant-ui/react";
import { ArrowDownIcon, BrainIcon } from "lucide-react";
import { type FC, type ReactNode } from "react";
import { XuluxComposer } from "./composer";
import { XuluxThreadMessage } from "./messages";
import { xuluxThreadStyle } from "./tokens";
import { ComposerMetaBar } from "@/components/run/composer-meta-bar";
import type { ThreadPhase } from "@/components/run/use-live-thread";

export const XuluxThread: FC<{
  showComposer?: boolean;
  phase?: ThreadPhase;
  /** Thread existant (/runs/:id) — pas de welcome brain au refresh. */
  openingExisting?: boolean;
  modelLabel?: string;
  /**
   * Ce qui doit être vu au moment de répondre — aujourd'hui la demande
   * d'autorisation. Posé dans le dock du composer, pas en tête d'écran : une
   * décision qui bloque la mission n'a pas à être cherchée en haut d'un fil long.
   */
  beforeComposer?: ReactNode;
}> = ({
  showComposer = true,
  phase = "ready",
  openingExisting = false,
  modelLabel,
  beforeComposer,
}) => {
  const messageCount = useAuiState((s) => s.thread.messages.length);
  const threadLoading = useAuiState((s) => s.thread.isLoading);
  const hasMessages = messageCount > 0;
  /*
    Le squelette du fil ne dépend que du fil : dès qu'un message est là, il
    disparaît, même si la revalidation est encore en vol. En `warm` (en-tête
    restauré depuis le cache, transcript pas encore arrivé) il reste affiché —
    c'est le seul endroit de l'écran où l'on n'a effectivement rien à montrer.
  */
  const isResolving =
    (phase !== "ready" && !hasMessages) ||
    (openingExisting && !hasMessages) ||
    (!hasMessages && threadLoading);
  const isNew = !openingExisting && !hasMessages && !isResolving;

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container relative flex h-full min-h-0 flex-col bg-background"
      style={xuluxThreadStyle}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className={cn(
          // `overflow-y-scroll` réserve la gouttière en permanence : la barre
          // qui apparaît ne décale jamais le texte. `overscroll-contain` évite
          // que la fin de course du transcript fasse défiler le shell derrière.
          "relative min-h-0 flex-1 overflow-x-hidden overflow-y-scroll overscroll-contain scroll-smooth scroll-pt-4 px-4 pt-4 scrollbar-subtle",
          showComposer ? "pb-3" : "pb-4 md:pb-6",
          isNew && "flex flex-col justify-center",
        )}
      >
        {isNew ? <ThreadWelcome /> : null}

        {isResolving && !hasMessages ? <ThreadLoadingMessages /> : null}

        <div
          data-slot="aui_message-group"
          className={cn("flex flex-col gap-y-6", hasMessages && "mb-8")}
        >
          <ThreadPrimitive.Messages>{() => <XuluxThreadMessage />}</ThreadPrimitive.Messages>
        </div>

        {/*
          Fondus de bord. Collés au bas du scroller plutôt qu'en surcouche
          absolue sur la Root : posé au-dessus du viewport, un calque absolu
          repeindrait aussi le bouton « aller en bas ». La marge négative annule
          la hauteur qu'il occuperait dans le flux.
        */}
        {hasMessages ? (
          <div
            aria-hidden
            className="pointer-events-none sticky bottom-0 -mt-6 h-6 bg-gradient-to-t from-background to-transparent"
          />
        ) : null}

        {hasMessages ? <ThreadScrollToBottom /> : null}

        <ThreadPrimitive.ViewportFooter
          data-slot="aui_thread-viewport-footer"
          className="aui-thread-viewport-footer sticky bottom-0 z-20 mt-auto flex w-full flex-col overflow-visible bg-background"
        >
          {beforeComposer ? (
            <div className="shrink-0 pt-3">{beforeComposer}</div>
          ) : null}

          {showComposer ? (
            <div className="aui-thread-composer-dock shrink-0 bg-background pt-3 pb-4 md:pb-5">
              {/*
                Le footer appartient au viewport : assistant-ui mesure ainsi
                sa hauteur pour conserver le nouveau tour ancré en haut quand
                le placeholder de streaming se contracte en réponse courte.
              */}
              <div className="mx-auto w-full max-w-(--thread-max-width)">
                <XuluxComposer />
              </div>
              <ComposerMetaBar modelLabel={modelLabel} phase={phase} />
            </div>
          ) : null}
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>

    </ThreadPrimitive.Root>
  );
};

/**
 * Le bouton reste monté et se fond : le démonter faisait apparaître et
 * disparaître un disque au milieu du flux, à chaque passage de la limite du bas.
 */
const ThreadScrollToBottom: FC = () => {
  const isAtBottom = useThreadViewport((s) => s.isAtBottom);

  return (
    <div
      className={cn(
        "pointer-events-none sticky bottom-2 z-10 flex justify-center transition-opacity duration-150 motion-reduce:transition-none",
        isAtBottom ? "opacity-0" : "opacity-100",
      )}
    >
      <ThreadPrimitive.ScrollToBottom asChild>
        <XuluxTooltipIconButton
          tooltip="Aller en bas"
          className={cn(
            "aui-thread-scroll-to-bottom size-8 rounded-full border border-border bg-background shadow-sm",
            "dark:border-border dark:bg-background dark:hover:bg-accent",
            isAtBottom ? "pointer-events-none" : "pointer-events-auto",
          )}
        >
          <ArrowDownIcon />
        </XuluxTooltipIconButton>
      </ThreadPrimitive.ScrollToBottom>
    </div>
  );
};

const ThreadWelcome: FC = () => (
  <div className="aui-thread-welcome-root mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center px-4 text-center">
    <span className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
      <BrainIcon className="size-5" />
    </span>
    <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold duration-200">
      Comment puis-je vous aider ?
    </h1>
  </div>
);

/**
 * Le squelette du fil, à la forme du fil.
 *
 * Il montrait trois paragraphes alignés à gauche alors qu'une conversation
 * alterne une bulle à droite et une réponse pleine largeur : au moment où le
 * contenu arrivait, tout se réorganisait. On reprend donc les mêmes gabarits
 * que `XuluxUserMessage` et `HermesAssistantMessage` — même largeur maximale,
 * même gouttière, même rayon de bulle, même interligne — pour que l'arrivée du
 * transcript ne déplace rien.
 */
const ThreadLoadingMessages: FC = () => (
  <div
    role="status"
    aria-label="Chargement de la conversation"
    className="flex flex-col gap-y-6"
  >
    <span className="sr-only">Chargement</span>
    {[
      { bubble: 62, lines: [86, 71, 44] },
      { bubble: 38, lines: [78, 52] },
    ].map((turn, index) => (
      <div key={index} className="flex flex-col gap-y-6">
        {/* Tour utilisateur : bulle à droite, `rounded-xl px-4 py-2`. */}
        <div className="mx-auto flex w-full max-w-(--thread-max-width) justify-end px-2">
          <div
            className="h-9 animate-pulse rounded-xl bg-muted"
            style={{ width: `${turn.bubble}%` }}
          />
        </div>
        {/* Tour assistant : pleine largeur, aligné à gauche. */}
        <div className="mx-auto w-full max-w-(--thread-max-width) px-2">
          <div className="flex flex-col gap-2.5">
            {turn.lines.map((width, line) => (
              <div
                key={line}
                className="h-4 animate-pulse rounded bg-muted"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          {/* Le pied d'un message assistant réserve `min-h-7` : sans lui, le
              fil remonterait d'un cran par tour au moment du remplacement. */}
          <div className="min-h-7" />
        </div>
      </div>
    ))}
  </div>
);
