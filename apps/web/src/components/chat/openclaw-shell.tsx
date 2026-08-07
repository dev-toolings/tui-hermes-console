"use client";

import { Link } from "@/lib/router";
import { usePathname, useRouter, useSelectedLayoutSegment } from "@/lib/router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ListFilterIcon,
  MenuIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@boardui/ui";
import { cn } from "@/lib/cn";
import { RUN_STATUS, type RunStatus } from "@console/core/lib/run-status";
import { ChromeIconButton } from "@/components/shell/chrome-icon-button";
import { ChatModelsSettingsButton } from "@/components/chat/chat-models-settings-button";
import {
  dropThreadSnapshotCache,
  prefetchThreadSnapshot,
  type ThreadPhase,
} from "@/components/run/use-live-thread";
import { scopedSessionStorageKey } from "@/lib/session-cache-scope";

export type ChatSessionRow = {
  id: string;
  title: string;
  agentName: string;
  updatedAt: string;
  latestRun: { status: RunStatus } | null;
};

/**
 * Dernière liste de sessions connue, conservée le temps de l'onglet.
 *
 * Sans elle, un rechargement de page repart de zéro et repeint six lignes de
 * squelette pour une liste qui, neuf fois sur dix, est identique à celle qu'on
 * avait sous les yeux. On la réaffiche donc immédiatement et on revalide en
 * fond : le sondage de 8 s corrige tout écart.
 */
const SESSIONS_STORAGE_KEY = "hermes-console:chat-sessions";

function readStoredSessions(): ChatSessionRow[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(scopedSessionStorageKey(SESSIONS_STORAGE_KEY));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as ChatSessionRow[]) : null;
  } catch {
    return null;
  }
}

function writeStoredSessions(sessions: ChatSessionRow[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(scopedSessionStorageKey(SESSIONS_STORAGE_KEY), JSON.stringify(sessions.slice(0, 40)));
  } catch {
    // Quota plein : on retombe simplement sur le squelette au prochain refresh.
  }
}

function useChatSessions() {
  const [stored] = useState(readStoredSessions);
  const [sessions, setSessions] = useState<ChatSessionRow[]>(stored ?? []);
  const [loading, setLoading] = useState(!stored);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/threads?source=chat", { cache: "no-store" });
    const body = (await response.json()) as { threads?: ChatSessionRow[] };
    if (!response.ok) throw new Error("Impossible de charger les sessions.");
    const threads = body.threads ?? [];
    setSessions(threads);
    writeStoredSessions(threads);
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = () => {
      void refresh()
        // La liste précédente n'est pas effacée sur un échec de sondage : une
        // coupure d'une seconde vidait l'historique à l'écran, ce qui se lit
        // comme « vous n'avez plus de sessions ».
        .catch(() => undefined)
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 8_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { sessions, loading, refresh };
}

/** Aujourd'hui / Hier / Avant — le découpage de hermes-webui, en dates
 *  civiles locales : « il y a 20 h » peut être hier comme avant-hier. */
function dayBucket(iso: string, nowMs: number): "today" | "yesterday" | "earlier" {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const at = new Date(iso).getTime();
  if (at >= startOfToday.getTime()) return "today";
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  return at >= startOfYesterday.getTime() ? "yesterday" : "earlier";
}

const BUCKET_LABELS = {
  today: "Aujourd’hui",
  yesterday: "Hier",
  earlier: "Avant",
} as const;

function relativeTime(iso: string, nowMs: number) {
  const delta = Math.max(0, nowMs - new Date(iso).getTime());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type ChatSurfaceContextValue = {
  sessionId: string | null;
  sessions: ChatSessionRow[];
  /**
   * Recharge la liste des sessions. La sidebar n'est plus remontée à chaque
   * navigation : sans cet appel, une session tout juste créée n'apparaîtrait
   * dans l'historique qu'au sondage suivant (jusqu'à 8 s plus tard).
   */
  refreshSessions: () => Promise<void>;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  openMobileSidebar: () => void;
};

const ChatSurfaceContext = createContext<ChatSurfaceContextValue | null>(null);

export function useChatSurface() {
  const context = useContext(ChatSurfaceContext);
  if (!context) {
    throw new Error("ChatSurfaceFrame is missing above this component.");
  }
  return context;
}

/**
 * OpenClaw Control UI — coque de la surface chat.
 *
 * Montée **une seule fois** par `app/(console)/chat/layout.tsx` : passer de
 * `/chat` à `/chat/:id` ne change que `children`. La sidebar, sa liste de
 * sessions et l'état replié/déplié survivent donc à la navigation — sans quoi
 * chaque switch remontait le squelette de chargement (le « flash »).
 *
 * La session active est lue depuis le segment de route, pas depuis une prop :
 * aucune page n'a besoin de la faire remonter.
 */
export function ChatSurfaceFrame({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment("/chat");
  const sessionId = segment && segment !== "new" ? segment : null;
  const draft = segment === "new";

  const pathname = usePathname();
  const router = useRouter();
  const { sessions, loading, refresh } = useChatSessions();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * Refermer le tiroir mobile quand on change de session.
   *
   * C'était un effet : il repeignait le tiroir ouvert, puis le refermait au
   * rendu suivant. En ajustant l'état pendant le rendu, React relance avant
   * de peindre — le tiroir ne clignote pas. (react.dev, « adjusting state
   * when props change ».)
   */
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  const handleDeleted = useCallback(
    async (deletedId: string) => {
      await refresh().catch(() => undefined);
      if (deletedId === sessionId) {
        router.push("/chat");
      }
    },
    [refresh, router, sessionId],
  );

  const surface = useMemo<ChatSurfaceContextValue>(
    () => ({
      sessionId,
      sessions,
      refreshSessions: () => refresh().catch(() => undefined),
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((value) => !value),
      openMobileSidebar: () => setMobileOpen(true),
    }),
    [refresh, sessionId, sessions, sidebarCollapsed],
  );

  const sidebar = (
    <OpenClawSessionSidebar
      sessions={sessions}
      loading={loading}
      activeId={sessionId ?? (draft ? "__draft__" : "")}
      draft={draft}
      nowMs={nowMs}
      collapsed={sidebarCollapsed}
      onNavigate={() => setMobileOpen(false)}
      onDeleted={handleDeleted}
    />
  );

  return (
    <ChatSurfaceContext.Provider value={surface}>
      <div className="oc-chat-shell flex h-full min-h-0 w-full bg-[var(--oc-shell-bg,#f4f1ea)] text-foreground dark:bg-background">
        {/*
          Cette colonne vit DANS le panneau `inset`, elle doit donc en porter
          la couleur. En `dark:bg-sidebar` elle valait #171717 — exactement le
          champ sur lequel le panneau flotte : l'arête arrondie du panneau,
          pourtant bien découpée, se retrouvait avec la même teinte des deux
          côtés et disparaissait, et le rail de la Console fusionnait avec la
          liste de sessions. En prenant le fond du panneau, la silhouette
          arrondie réapparaît comme sur les autres routes.

          Le filet vers le transcript reste en `border-border` : `border-seam`
          (#404040) ne sert qu'à rattraper un bord posé SUR une surface haute,
          où `--border` se confond avec le fond. Ici on est sur `--background`
          (#121212), où `--border` (#262626) se voit déjà — le seam y tranchait
          bien trop.
        */}
        <div
          className={cn(
            "hidden h-full shrink-0 bg-[var(--oc-sidebar-bg,#efeae2)] transition-[width] duration-200 md:flex dark:bg-background",
            // Le filet est porté par la branche dépliée : en surcharge
            // (`border-r` + `border-0`) les deux règles ont la même
            // spécificité et c'est l'ordre de la feuille générée qui tranche —
            // il restait 1px collé au bord du panneau une fois replié.
            sidebarCollapsed
              ? "w-0 overflow-hidden"
              : "w-[17.5rem] border-r border-border",
          )}
        >
          {!sidebarCollapsed ? sidebar : null}
        </div>

        {/*
          Deux colonnes, plus trois. La troisième portait l'espace de travail —
          hôte d'exécution, `in/`, `out/`, tokens — sur 16 rem permanentes, et
          seulement au-dessus de 1280 px : la même information disparaissait
          purement et simplement sur un écran plus étroit. Elle vit désormais
          sous le composer (`ComposerMetaBar`), là où se porte le regard au
          moment d'agir, et son détail dans la feuille « Détails de la mission ».
        */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-neutral-950/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[17.5rem] shadow-xl">
              <div className="flex h-full flex-col bg-[var(--oc-sidebar-bg,#efeae2)] dark:bg-sidebar">
                <div className="flex h-12 items-center justify-end px-2">
                  <button
                    type="button"
                    aria-label="Close"
                    className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
                    onClick={() => setMobileOpen(false)}
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1">{sidebar}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ChatSurfaceContext.Provider>
  );
}

/**
 * Contenu d'une page chat : en-tête + bandeaux + pane. Léger par construction —
 * il remonte à chaque navigation, contrairement au `ChatSurfaceFrame`.
 */
export function ChatPane({
  title,
  phase = "ready",
  trailing,
  alerts,
  children,
}: {
  title: string;
  phase?: ThreadPhase;
  trailing?: ReactNode;
  alerts?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <ChatPaneHeader title={title} phase={phase} trailing={trailing} />
      {alerts}
      <main className="min-h-0 flex-1 overflow-hidden bg-background">{children}</main>
    </>
  );
}

function ChatPaneHeader({
  title,
  phase,
  trailing,
}: {
  title: string;
  phase: ThreadPhase;
  trailing?: ReactNode;
}) {
  const { sessionId, sessions, sidebarCollapsed, toggleSidebar, openMobileSidebar } =
    useChatSurface();

  /*
    Trois sources pour le titre, dans cet ordre : le snapshot, puis ce que la
    sidebar sait déjà de cette session, puis rien. « Rien » se rend en
    squelette — jamais en « … », qui s'affiche comme un titre à part entière et
    reste sur l'écran plusieurs centaines de millisecondes.
  */
  const known =
    title || (sessionId ? sessions.find((item) => item.id === sessionId)?.title : undefined);
  const cold = phase === "cold";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 bg-background/80 px-3 backdrop-blur-sm">
      <ChromeIconButton
        className="md:hidden"
        aria-label="Open sessions"
        onClick={openMobileSidebar}
      >
        <MenuIcon className="size-4" />
      </ChromeIconButton>
      <ChromeIconButton
        className="hidden md:inline-flex"
        aria-label={sidebarCollapsed ? "Show sessions" : "Hide sessions"}
        onClick={toggleSidebar}
      >
        <PanelLeftIcon className="size-4" />
      </ChromeIconButton>

      {known ? (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:opacity-80"
          title="Rename (soon)"
          onClick={() => undefined}
        >
          {known}
        </button>
      ) : (
        <span
          aria-hidden
          className="h-4 min-w-0 max-w-xs flex-1 animate-pulse rounded bg-muted"
        />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/*
          Le modèle n'est plus répété ici : il vit sous le composer, avec le
          reste du contexte d'exécution. L'en-tête ne garde que ce qui décrit
          la conversation elle-même — son titre et l'état de son dernier run.

          En `cold`, `trailing` est vide par construction (aucun run connu) :
          la pastille garde sa place pour que l'arrivée du vrai statut ne
          décale pas les boutons de droite.
        */}
        {cold && !trailing ? (
          <span aria-hidden className="h-7 w-24 animate-pulse rounded-full bg-muted" />
        ) : (
          trailing
        )}
        <ChatModelsSettingsButton />
      </div>
    </header>
  );
}

function SessionRow({
  session,
  active,
  deleting,
  nowMs,
  onNavigate,
  onDelete,
}: {
  session: ChatSessionRow;
  active: boolean;
  deleting: boolean;
  nowMs: number;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const status = (session.latestRun?.status ?? "pending") as RunStatus;
  const style = RUN_STATUS[status];
  const live = !style.terminal && status !== "pending";

  return (
    <li className="group/row relative">
      <div
        className={cn(
          "flex h-8 items-center gap-1 rounded-md pr-1 transition-colors",
          active
            ? "bg-muted font-medium text-foreground"
            : "text-foreground/85 hover:bg-muted/70",
          deleting && "opacity-50",
        )}
      >
        <Link
          href={`/chat/${session.id}`}
          onClick={onNavigate}
          // Le snapshot est chargé dès le survol : au clic, la session
          // s'affiche depuis le cache, sans squelette.
          onPointerEnter={() => prefetchThreadSnapshot(session.id)}
          onFocus={() => prefetchThreadSnapshot(session.id)}
          aria-current={active ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 text-sm"
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              live ? cn(style.dot, "animate-pulse") : "bg-muted-foreground/35",
            )}
          />
          <span className="min-w-0 flex-1 truncate">{session.title}</span>
          <span className="shrink-0 text-[0.625rem] text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100">
            {relativeTime(session.updatedAt, nowMs)}
          </span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions pour ${session.title}`}
            disabled={deleting}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/row:opacity-100 data-[state=open]:opacity-100 disabled:opacity-40"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontalIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuItem
              variant="destructive"
              disabled={deleting}
              onSelect={(event) => {
                event.preventDefault();
                onDelete();
              }}
            >
              <Trash2Icon />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function OpenClawSessionSidebar({
  sessions,
  loading,
  activeId,
  draft,
  nowMs,
  collapsed,
  onNavigate,
  onDeleted,
}: {
  sessions: ChatSessionRow[];
  loading: boolean;
  activeId: string;
  draft: boolean;
  nowMs: number;
  collapsed: boolean;
  onNavigate: () => void;
  onDeleted: (threadId: string) => Promise<void>;
}) {
  const recent = useMemo(() => sessions.slice(0, 40), [sessions]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Les groupes vides ne sont pas rendus : un intitulé « Hier » sans ligne en
  // dessous ferait croire à un chargement incomplet.
  const groups = useMemo(() => {
    const order = ["today", "yesterday", "earlier"] as const;
    return order
      .map((key) => ({
        key,
        sessions: recent.filter((session) => dayBucket(session.updatedAt, nowMs) === key),
      }))
      .filter((group) => group.sessions.length > 0);
  }, [recent, nowMs]);

  const deleteSession = async (session: ChatSessionRow) => {
    if (
      !window.confirm(
        `Delete « ${session.title} »?\n\nTranscript, missions, artefacts DB and workdirs will be removed. Active runs are cancelled.`,
      )
    ) {
      return;
    }
    setDeletingId(session.id);
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
        headers: { "X-Hermes-Toast": "deleted" },
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        window.alert(body.error?.message ?? "Delete failed.");
        return;
      }
      dropThreadSnapshotCache(session.id);
      onNavigate();
      await onDeleted(session.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className={cn("flex h-full w-[17.5rem] flex-col", collapsed && "pointer-events-none")}>
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)] text-xs font-bold text-primary-foreground">
          H
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">Hermes</p>
          <p className="truncate text-[0.625rem] text-muted-foreground">Control · Chat</p>
        </div>
        <Link
          href="/chat/new"
          onClick={onNavigate}
          data-slot="chat-sidebar-new"
          aria-label="New session"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PlusIcon className="size-3.5" aria-hidden />
          <span>New</span>
        </Link>
        {/*
          Pas de second bouton de repli ici : celui de l'en-tête du transcript
          fait déjà l'aller-retour, et il reste atteignable une fois la colonne
          repliée à 0 — ce qui n'était pas le cas de celui-ci.
        */}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-subtle">
        <div className="mb-1 flex items-center gap-1 px-2 pt-2">
          <p className="flex-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Threads
          </p>
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Filter"
            title="Filter (soon)"
          >
            <ListFilterIcon className="size-3.5" />
          </button>
        </div>

        {draft ? (
          <ul className="mb-2 flex flex-col gap-0.5">
            <li>
              <div className="flex h-8 items-center gap-2 rounded-md bg-muted/80 px-2.5 text-sm italic text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="min-w-0 flex-1 truncate">Nouvelle session</span>
              </div>
            </li>
          </ul>
        ) : null}

        {loading ? (
          // Même gabarit que `SessionRow` — h-8, même gouttière, même retrait —
          // pour que le passage du squelette aux lignes ne déplace rien.
          <ul
            aria-hidden
            data-slot="chat-sidebar-thread-skeleton"
            className="flex flex-col gap-0.5"
          >
            <li className="px-2.5 pt-1 pb-1">
              <div className="h-2.5 w-14 animate-pulse rounded bg-muted" />
            </li>
            {[80, 64, 72, 56, 68, 60].map((width, index) => (
              <li key={index} className="flex h-8 items-center px-2.5">
                <div
                  className="h-3.5 animate-pulse rounded bg-muted"
                  style={{ width: `${width}%` }}
                />
              </li>
            ))}
          </ul>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-2">
              <p className="px-2.5 pt-1 pb-1 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {BUCKET_LABELS[group.key]}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={session.id === activeId}
                    deleting={deletingId === session.id}
                    nowMs={nowMs}
                    onNavigate={onNavigate}
                    onDelete={() => void deleteSession(session)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {!loading && recent.length === 0 && !draft ? (
          <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            Aucune session pour l’instant
          </p>
        ) : null}
      </div>

    </aside>
  );
}
