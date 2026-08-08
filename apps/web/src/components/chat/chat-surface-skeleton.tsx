/**
 * Ce qui s'affiche pendant que le chunk de la surface chat arrive.
 *
 * Les écrans de conversation sont différés (`lazy`) : ils tirent `assistant-ui`
 * et son rendu markdown, le plus gros poste du bundle. Entre le premier rendu
 * et leur arrivée, la frontière `Suspense` montrait la chaîne « Chargement… »
 * sur toute la zone — un écran de texte brut, suivi d'un écran de squelettes,
 * suivi du contenu. Trois états pour une seule attente.
 *
 * Ce composant n'est donc pas décoratif : il donne à l'attente la forme qu'elle
 * aura ensuite, pour que l'arrivée du chunk ne soit pas un changement d'écran.
 * Il est volontairement autonome — aucun import de la surface chat, sinon il
 * repartirait dans le chunk qu'il sert justement à attendre. D'où les largeurs
 * en dur (`44rem`) plutôt que la variable `--thread-max-width`, qui est posée
 * par le fil différé.
 */
import { MenuIcon, PanelLeftIcon, PlusIcon, Settings2Icon } from "lucide-react";
import type { ReactNode } from "react";

export function ChatSurfaceSkeleton({ home }: { home?: ReactNode }) {
  const showHome = home !== undefined;

  return (
    <div
      role={showHome ? undefined : "status"}
      aria-label={showHome ? undefined : "Chargement de la conversation"}
      className="oc-chat-shell flex h-full min-h-0 w-full bg-background"
    >
      {!showHome ? <span className="sr-only">Chargement</span> : null}

      <div
        role={showHome ? "status" : undefined}
        aria-label={showHome ? "Chargement des threads" : undefined}
        className="hidden h-full w-[17.5rem] shrink-0 flex-col border-r border-border bg-background md:flex"
      >
        {showHome ? <span className="sr-only">Chargement des threads</span> : null}
        {/* L'identité du produit n'attend rien du serveur : elle reste peinte. */}
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)] text-xs font-bold text-primary-foreground">
            H
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">Hermes</p>
            <p className="truncate text-[0.625rem] text-muted-foreground">Control · Chat</p>
          </div>
          <a
            href="/chat/new"
            data-slot="chat-sidebar-new"
            aria-label="New session"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PlusIcon className="size-3.5" aria-hidden />
            <span>New</span>
          </a>
        </div>

        <div className="min-h-0 flex-1 px-2 pb-3">
          <div className="mb-1 px-2 pt-2">
            <p className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Threads
            </p>
          </div>
          <ul data-slot="chat-sidebar-thread-skeleton" className="flex flex-col gap-0.5">
            {[80, 64, 72, 56, 68, 60].map((width, index) => (
              <li key={index} className="flex h-8 items-center px-2.5">
                <div
                  className="h-3.5 animate-pulse rounded bg-muted"
                  style={{ width: `${width}%` }}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {showHome ? (
          <>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3">
              <button
                type="button"
                aria-label="Open sessions"
                disabled
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground md:hidden"
              >
                <MenuIcon className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Hide sessions"
                disabled
                className="hidden size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground md:inline-flex"
              >
                <PanelLeftIcon className="size-4" />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Chat</span>
              <button
                type="button"
                aria-label="Paramètres modèles"
                disabled
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
              >
                <Settings2Icon className="size-4" />
              </button>
            </div>
            <main
              data-slot="chat-home-fallback"
              className="min-h-0 flex-1 overflow-hidden bg-background"
            >
              {home}
            </main>
          </>
        ) : (
          <ConversationSkeleton />
        )}
      </div>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <>
      <div
        data-slot="chat-conversation-skeleton"
        className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3"
      >
        <div className="size-8 shrink-0" />
        <div className="h-4 max-w-xs flex-1 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-7 w-24 shrink-0 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Mêmes gabarits que `ThreadLoadingMessages` : bulle à droite pour le
          tour utilisateur, bloc pleine largeur pour la réponse. Le squelette
          du chunk et celui du fil se succèdent alors sans rien déplacer. */}
      <div className="flex flex-1 flex-col gap-y-6 px-4 pt-4">
        {[
          { bubble: 62, lines: [86, 71, 44] },
          { bubble: 38, lines: [78, 52] },
        ].map((turn, index) => (
          <div key={index} className="flex flex-col gap-y-6">
            <div className="mx-auto flex w-full max-w-[44rem] justify-end px-2">
              <div
                className="h-9 animate-pulse rounded-xl bg-muted"
                style={{ width: `${turn.bubble}%` }}
              />
            </div>
            <div className="mx-auto w-full max-w-[44rem] px-2">
              <div className="flex flex-col gap-2.5">
                {turn.lines.map((width, line) => (
                  <div
                    key={line}
                    className="h-4 animate-pulse rounded bg-muted"
                    style={{ width: `${width}%` }}
                  />
                ))}
              </div>
              <div className="min-h-7" />
            </div>
          </div>
        ))}
      </div>

      {/* Le quai du composer occupe déjà sa hauteur, ligne de méta comprise :
          le fil ne remontera pas d'un cran au moment où il se monte. */}
      <div className="shrink-0 px-4 pt-3 pb-4 md:pb-5">
        <div className="mx-auto h-[5.25rem] w-full max-w-[44rem] rounded-[1.5rem] border border-border/60" />
        <div className="mx-auto flex w-full max-w-[44rem] items-center gap-2 px-3 pt-2">
          <span className="h-5 w-24 animate-pulse rounded-full bg-muted" />
          <span className="hidden h-3 w-32 animate-pulse rounded bg-muted sm:block" />
          <span className="ml-auto h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </>
  );
}
