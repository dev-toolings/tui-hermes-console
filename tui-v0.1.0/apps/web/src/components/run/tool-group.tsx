"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Collapsible } from "radix-ui";
import { useAuiState, useScrollLock } from "@assistant-ui/react";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const ANIMATION_DURATION = 200;

/**
 * En-tête d'une série d'appels d'outils consécutifs.
 *
 * Cinq `browser_navigate` empilés poussaient la réponse de l'agent hors de
 * l'écran : ils tiennent désormais sur une ligne repliable. La règle
 * d'ouverture suit ce qu'on a besoin de voir — ouvert pendant l'exécution
 * (c'est là que la progression compte), replié une fois terminé — sauf si
 * l'utilisateur a lui-même actionné le bouton, ou si un appel a échoué : un
 * échec ne doit jamais se refermer tout seul.
 */
export function HermesToolGroup({
  indices,
  running,
  children,
}: {
  indices: readonly number[];
  running: boolean;
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const failures = useAuiState((state) => countFailures(state.message.content, indices));

  // Fige la position de scroll le temps de l'animation de hauteur : sans ça,
  // replier un groupe situé au-dessus de la vue déplace tout le transcript.
  const lockScroll = useScrollLock(rootRef, ANIMATION_DURATION);

  const open = userOpen ?? (running || failures > 0);
  const count = indices.length;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      lockScroll();
      setUserOpen(next);
    },
    [lockScroll],
  );

  const label = count > 1 ? `${count} appels d’outils` : "1 appel d’outil";

  return (
    <Collapsible.Root
      ref={rootRef}
      open={open}
      onOpenChange={handleOpenChange}
      className="my-1"
      style={{ "--animation-duration": `${ANIMATION_DURATION}ms` } as React.CSSProperties}
    >
      <Collapsible.Trigger
        className={cn(
          "group/tool-trigger flex min-h-7 items-center gap-1.5 rounded-md px-1 text-[0.8125rem]",
          "text-muted-foreground transition-colors hover:text-foreground",
        )}
      >
        {running ? (
          <LoaderIcon className="size-3 shrink-0 animate-spin [animation-duration:0.6s]" />
        ) : null}
        <span className={cn(running && "ai-chat-shimmer-text")}>{label}</span>
        {failures > 0 ? (
          <span className="text-destructive">
            · {failures > 1 ? `${failures} échecs` : "1 échec"}
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 -rotate-90 transition-transform motion-reduce:transition-none",
            "duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)]",
            "group-data-[state=open]/tool-trigger:rotate-0",
          )}
        />
      </Collapsible.Trigger>

      <Collapsible.Content
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
        )}
      >
        <div
          className={cn(
            "mt-0.5 flex flex-col gap-0.5",
            // révélation échelonnée : les lignes arrivent dans l'ordre où
            // l'agent les a appelées, pas toutes d'un bloc
            "[&>*]:animate-in [&>*]:fade-in-0 [&>*]:slide-in-from-top-1",
            "[&>*]:duration-(--animation-duration) [&>*]:ease-[cubic-bezier(0.32,0.72,0,1)]",
            "[&>*]:motion-reduce:animate-none",
            "[&>*:nth-child(2)]:[animation-delay:40ms]",
            "[&>*:nth-child(3)]:[animation-delay:80ms]",
            "[&>*:nth-child(4)]:[animation-delay:120ms]",
            "[&>*:nth-child(n+5)]:[animation-delay:160ms]",
          )}
        >
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function countFailures(content: readonly unknown[], indices: readonly number[]): number {
  let failures = 0;
  for (const index of indices) {
    const part = content[index] as { result?: { error?: boolean } } | undefined;
    if (part?.result?.error === true) failures += 1;
  }
  return failures;
}
