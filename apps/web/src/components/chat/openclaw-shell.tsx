"use client";

import Link from "next/link";
import { usePathname, useRouter, useSelectedLayoutSegment } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  LayoutDashboardIcon,
  ListFilterIcon,
  MenuIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PlusIcon,
  ActivityIcon,
  SettingsIcon,
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
import { RUN_STATUS, type RunStatus } from "@/lib/run-status";
import { ChatModelsSettingsButton } from "@/components/chat/chat-models-settings-button";
import {
  dropThreadSnapshotCache,
  prefetchThreadSnapshot,
} from "@/components/run/use-live-thread";

export type ChatSessionRow = {
  id: string;
  title: string;
  agentName: string;
  updatedAt: string;
  latestRun: { status: RunStatus } | null;
};

function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/threads?source=chat", { cache: "no-store" });
    const body = (await response.json()) as { threads?: ChatSessionRow[] };
    if (!response.ok) throw new Error("Impossible de charger les sessions.");
    setSessions(body.threads ?? []);
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = () => {
      void refresh()
        .catch(() => {
          if (!disposed) setSessions([]);
        })
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
  const segment = useSelectedLayoutSegment();
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      onCollapse={() => setSidebarCollapsed(true)}
      onNavigate={() => setMobileOpen(false)}
      onDeleted={handleDeleted}
    />
  );

  return (
    <ChatSurfaceContext.Provider value={surface}>
      <div className="oc-chat-shell flex h-full min-h-0 w-full bg-[var(--oc-shell-bg,#f4f1ea)] text-foreground dark:bg-background">
        <div
          className={cn(
            "hidden h-full shrink-0 border-r border-border/70 bg-[var(--oc-sidebar-bg,#efeae2)] transition-[width] duration-200 dark:bg-sidebar md:flex",
            sidebarCollapsed ? "w-0 overflow-hidden border-0" : "w-[17.5rem]",
          )}
        >
          {!sidebarCollapsed ? sidebar : null}
        </div>

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
  modelLabel,
  loading = false,
  trailing,
  alerts,
  children,
}: {
  title: string;
  modelLabel?: string;
  loading?: boolean;
  trailing?: ReactNode;
  alerts?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <ChatPaneHeader
        title={title}
        modelLabel={modelLabel}
        loading={loading}
        trailing={trailing}
      />
      {alerts}
      <main className="min-h-0 flex-1 overflow-hidden bg-background">{children}</main>
    </>
  );
}

function ChatPaneHeader({
  title,
  modelLabel,
  loading,
  trailing,
}: {
  title: string;
  modelLabel?: string;
  loading: boolean;
  trailing?: ReactNode;
}) {
  const { sessionId, sessions, sidebarCollapsed, toggleSidebar, openMobileSidebar } =
    useChatSurface();

  // Le titre du thread arrive après un fetch : afficher celui déjà connu de la
  // sidebar évite un « … » clignotant à l'ouverture d'une session.
  const cached = sessionId ? sessions.find((item) => item.id === sessionId)?.title : undefined;
  const label = loading ? (cached ?? title) : title;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-sm">
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
        aria-label="Open sessions"
        onClick={openMobileSidebar}
      >
        <MenuIcon className="size-4" />
      </button>
      <button
        type="button"
        className="hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:inline-flex"
        aria-label={sidebarCollapsed ? "Show sessions" : "Hide sessions"}
        onClick={toggleSidebar}
      >
        <PanelLeftIcon className="size-4" />
      </button>

      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:opacity-80"
        title="Rename (soon)"
        onClick={() => undefined}
      >
        {label}
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {modelLabel ? (
          <span className="hidden h-7 max-w-[10rem] items-center truncate rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground sm:inline-flex">
            {modelLabel}
          </span>
        ) : null}
        {trailing}
        <ChatModelsSettingsButton />
      </div>
    </header>
  );
}

function OpenClawSessionSidebar({
  sessions,
  loading,
  activeId,
  draft,
  nowMs,
  collapsed,
  onCollapse,
  onNavigate,
  onDeleted,
}: {
  sessions: ChatSessionRow[];
  loading: boolean;
  activeId: string;
  draft: boolean;
  nowMs: number;
  collapsed: boolean;
  onCollapse: () => void;
  onNavigate: () => void;
  onDeleted: (threadId: string) => Promise<void>;
}) {
  const recent = useMemo(() => sessions.slice(0, 40), [sessions]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        <button
          type="button"
          className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:inline-flex"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <PanelLeftIcon className="size-3.5" />
        </button>
      </div>

      <div className="px-2 pb-2">
        <Link
          href="/chat/new"
          onClick={onNavigate}
          className="flex h-9 items-center gap-2 rounded-lg bg-background/70 px-2.5 text-sm font-medium shadow-sm ring-1 ring-border/60 transition-colors hover:bg-background"
        >
          <PlusIcon className="size-4" />
          New session
        </Link>
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
          <Link
            href="/chat/new"
            onClick={onNavigate}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="New session"
          >
            <PlusIcon className="size-3.5" />
          </Link>
        </div>

        <ul className="flex flex-col gap-0.5">
          {draft ? (
            <li>
              <div className="flex h-8 items-center gap-2 rounded-md bg-muted/80 px-2.5 text-sm italic text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="min-w-0 flex-1 truncate">Draft session</span>
              </div>
            </li>
          ) : null}

          {loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <li key={index} className="px-2.5 py-2">
                  <div className="h-3.5 animate-pulse rounded bg-muted" />
                </li>
              ))
            : recent.map((session) => {
                const active = session.id === activeId;
                const status = (session.latestRun?.status ?? "pending") as RunStatus;
                const style = RUN_STATUS[status];
                const live = !style.terminal && status !== "pending";
                const deleting = deletingId === session.id;
                return (
                  <li key={session.id} className="group/row relative">
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
                        // Le snapshot est chargé dès le survol : au clic, la
                        // session s'affiche depuis le cache, sans squelette.
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
                          aria-label={`Actions for ${session.title}`}
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
                              void deleteSession(session);
                            }}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}

          {!loading && recent.length === 0 && !draft ? (
            <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">
              No sessions yet
            </li>
          ) : null}
        </ul>
      </div>

      <div className="shrink-0 border-t border-border/60 p-2">
        <p className="mb-1 px-2 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Console
        </p>
        <nav className="flex flex-col gap-0.5">
          <ConsoleLink href="/" icon={LayoutDashboardIcon} label="Overview" onNavigate={onNavigate} />
          <ConsoleLink href="/runs" icon={ActivityIcon} label="Missions" onNavigate={onNavigate} />
          <ConsoleLink
            href="/settings"
            icon={SettingsIcon}
            label="Settings"
            onNavigate={onNavigate}
          />
        </nav>
      </div>
    </aside>
  );
}

function ConsoleLink({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}
