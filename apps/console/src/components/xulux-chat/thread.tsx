"use client";

import { XuluxTooltipIconButton } from "./tooltip-icon-button";
import { cn } from "@/lib/utils";
import { ThreadPrimitive, useAuiState, useThreadViewport } from "@assistant-ui/react";
import { ArrowDownIcon, BrainIcon } from "lucide-react";
import { type FC } from "react";
import { XuluxComposer } from "./composer";
import { XuluxThreadMessage } from "./messages";
import { xuluxThreadStyle } from "./tokens";

export const XuluxThread: FC<{
  showComposer?: boolean;
  loading?: boolean;
  /** Thread existant (/runs/:id) — pas de welcome brain au refresh. */
  openingExisting?: boolean;
  modelLabel?: string;
}> = ({ showComposer = true, loading = false, openingExisting = false, modelLabel }) => {
  const messageCount = useAuiState((s) => s.thread.messages.length);
  const threadLoading = useAuiState((s) => s.thread.isLoading);
  const hasMessages = messageCount > 0;
  const isResolving =
    loading || (openingExisting && !hasMessages) || (!hasMessages && threadLoading);
  const isNew = !openingExisting && !hasMessages && !isResolving;

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container relative flex h-full min-h-0 flex-col bg-background"
      style={xuluxThreadStyle}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        autoScroll
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
      </ThreadPrimitive.Viewport>

      {hasMessages ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-background to-transparent"
        />
      ) : null}

      {showComposer ? (
        <div className="aui-thread-composer-dock shrink-0 bg-background px-4 pt-3 pb-4 md:pb-5">
          <div className="mx-auto w-full max-w-(--thread-max-width)">
            <XuluxComposer modelLabel={modelLabel} />
          </div>
        </div>
      ) : null}
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

const ThreadLoadingMessages: FC = () => (
  <div
    role="status"
    aria-label="Chargement de la conversation"
    className="mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-5 px-2 pt-6"
  >
    <span className="sr-only">Chargement</span>
    {Array.from({ length: 3 }, (_, index) => (
      <div key={index} className="flex flex-col gap-2">
        <div
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${index === 1 ? 88 : 72}%` }}
        />
        <div
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${index === 0 ? 56 : 64}%` }}
        />
      </div>
    ))}
  </div>
);
