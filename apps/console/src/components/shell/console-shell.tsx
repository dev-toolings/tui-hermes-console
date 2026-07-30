"use client";

import {
  BuiContentFrame,
  BuiLayoutFrame,
  BuiSidebarProvider,
  useBui,
} from "@boardui/ui/shell/primitives";
import { Link } from "@/lib/router";
import { usePathname, useRouter } from "@/lib/router";
import {
  ActivityIcon,
  BotIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  FileBoxIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { hermesAppearance } from "@/lib/settings/appearance";
import { useRuntimeStatus } from "./use-runtime-status";
import { RunPageChromeProvider } from "@/components/run/run-page-chrome";

const PRIMARY_NAV = [
  { label: "Aperçu", href: "/", icon: LayoutDashboardIcon },
  { label: "Chat", href: "/chat", icon: MessageSquareIcon },
  { label: "Agents", href: "/agents", icon: BotIcon },
  { label: "Missions", href: "/runs", icon: ActivityIcon },
  { label: "Artefacts", href: "/artifacts", icon: FileBoxIcon },
] satisfies NavItem[];

const SECONDARY_NAV = [
  { label: "Runtime Hermes", href: "/settings/runtime", icon: ServerIcon },
  { label: "Paramètres", href: "/settings", icon: SettingsIcon },
  { label: "Aide", href: "/support", icon: CircleHelpIcon },
] satisfies NavItem[];

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

type PageMeta = {
  title: string;
  crumb: string;
  parent?: { label: string; href: string };
  centerTitle?: boolean;
};

function pageMeta(pathname: string): PageMeta {
  if (pathname === "/") return { title: "Vue d’ensemble", crumb: "Aperçu" };
  if (pathname === "/agents/new") {
    return { title: "Nouvel agent", crumb: "Créer", parent: { label: "Agents", href: "/agents" } };
  }
  if (pathname.startsWith("/agents/")) {
    return {
      title: "Configuration de l’agent",
      crumb: "Agent",
      parent: { label: "Agents", href: "/agents" },
    };
  }
  if (pathname === "/agents") return { title: "Agents", crumb: "Agents" };
  if (pathname === "/chat/new") {
    return {
      title: "New session",
      crumb: "New",
      parent: { label: "Chat", href: "/chat" },
    };
  }
  if (pathname.startsWith("/chat/") && pathname !== "/chat/new") {
    return {
      title: "Chat",
      crumb: "Session",
      parent: { label: "Chat", href: "/chat" },
    };
  }
  if (pathname === "/chat") return { title: "Chat", crumb: "Chat" };
  if (pathname === "/runs/new") {
    return {
      title: "Nouvelle mission",
      crumb: "Créer",
      parent: { label: "Missions", href: "/runs" },
    };
  }
  if (pathname.startsWith("/runs/")) {
    return {
      title: "Mission",
      crumb: "Exécution",
      parent: { label: "Missions", href: "/runs" },
    };
  }
  if (pathname === "/runs") return { title: "Missions", crumb: "Missions" };
  if (pathname === "/artifacts") return { title: "Artefacts", crumb: "Artefacts" };
  if (pathname === "/settings/runtime") {
    return {
      title: "Runtime Hermes",
      crumb: "Runtime",
      parent: { label: "Paramètres", href: "/settings" },
      centerTitle: true,
    };
  }
  if (pathname === "/settings/models") {
    return {
      title: "Modèles",
      crumb: "Modèles",
      parent: { label: "Paramètres", href: "/settings" },
    };
  }
  if (pathname === "/settings/appearance") {
    return {
      title: "Apparence",
      crumb: "Apparence",
      parent: { label: "Paramètres", href: "/settings" },
    };
  }
  if (pathname === "/settings/notifications") {
    return {
      title: "Notifications",
      crumb: "Notifications",
      parent: { label: "Paramètres", href: "/settings" },
    };
  }
  if (pathname === "/settings/retention") {
    return {
      title: "Conservation",
      crumb: "Conservation",
      parent: { label: "Paramètres", href: "/settings" },
    };
  }
  if (pathname === "/settings/connectors") {
    return {
      title: "Connecteurs",
      crumb: "Connecteurs",
      parent: { label: "Paramètres", href: "/settings" },
    };
  }
  if (pathname === "/settings") return { title: "Paramètres", crumb: "Paramètres" };
  if (pathname === "/support") return { title: "Aide et diagnostic", crumb: "Aide" };
  return { title: "Hermes Console", crumb: "Console" };
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <BuiSidebarProvider storageKey="hermes-console-layout" autoCollapseOnTabletPortrait>
      <RunPageChromeProvider>
        <ConsoleShellFrame>{children}</ConsoleShellFrame>
      </RunPageChromeProvider>
    </BuiSidebarProvider>
  );
}

function ConsoleShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { setMobileOpen, collapsed, setCollapsed } = useBui();
  const [paletteOpen, setPaletteOpen] = useState(false);
  /**
   * Rail déplié explicitement pendant qu'on est sur le chat.
   *
   * Le chat porte déjà sa propre sidebar de sessions : deux colonnes de
   * navigation mangeraient le transcript, donc le rail y est replié par
   * défaut. On le calcule au rendu plutôt que d'écrire dans le store : celui-ci
   * est persisté globalement, et le forcer imposerait un rail replié sur
   * TOUTES les pages après un simple passage par le chat.
   */
  const [chatRailOpen, setChatRailOpen] = useState(false);
  const appearance = hermesAppearance.useAppearance();
  hermesAppearance.useApplyUiScale(appearance.uiScale);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMobileOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname, setMobileOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isChatSurface = pathname === "/chat" || pathname.startsWith("/chat/");
  const immersiveView =
    isChatSurface ||
    (pathname.startsWith("/runs/") && pathname !== "/runs/new" && pathname !== "/runs");

  const railCollapsed = isChatSurface ? !chatRailOpen : collapsed;
  const toggleRail = isChatSurface
    ? () => setChatRailOpen((value) => !value)
    : () => setCollapsed(!collapsed);

  return (
    <BuiLayoutFrame
      sidebarWidth={appearance.sidebarWidth}
      layoutOptions={[
        { value: "boardui", number: "01", label: "BoardUI classique" },
        { value: "inset", number: "02", label: "BoardUI inset" },
      ]}
      labels={{
        tooltip: "Disposition",
        choose: "Choisir la disposition",
        choices: "Dispositions disponibles",
      }}
      background={{ default: "bg-background", inset: "bg-surface-sunken" }}
    >
      <ConsoleSidebar
        sidebarWidth={appearance.sidebarWidth}
        onOpenPalette={() => setPaletteOpen(true)}
        collapsed={railCollapsed}
        onToggleCollapsed={toggleRail}
      />
      <BuiContentFrame
        containerContent={
          // Le chat gère sa propre largeur (3 panneaux) : le brider à la
          // largeur de lecture des pages Console tasserait le transcript.
          isChatSurface ? "100%" : hermesAppearance.contentWidthCss(appearance.contentWidth)
        }
      >
        {immersiveView ? null : <ConsoleHeader onOpenPalette={() => setPaletteOpen(true)} />}
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            immersiveView ? "overflow-hidden" : "overflow-y-auto scrollbar-subtle",
          )}
        >
          {children}
        </main>
      </BuiContentFrame>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </BuiLayoutFrame>
  );
}

function ConsoleSidebar({
  sidebarWidth,
  onOpenPalette,
  collapsed,
  onToggleCollapsed,
}: {
  sidebarWidth: number;
  onOpenPalette: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { mobileOpen, setMobileOpen, layout } = useBui();
  const pathname = usePathname();
  const shortcut = useShortcutLabel();
  const runtime = useRuntimeStatus();

  return (
    <>
      <button
        type="button"
        aria-label="Fermer la navigation"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-neutral-950/50 transition-opacity md:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        style={
          {
            ...(mobileOpen || !collapsed ? { width: sidebarWidth } : {}),
            "--sidebar-expanded-width": `${sidebarWidth}px`,
          } as React.CSSProperties
        }
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width,transform,padding] duration-300 md:relative md:z-20 md:self-stretch",
          layout === "boardui" && "md:border-r md:border-sidebar-border",
          collapsed ? "md:px-2" : "md:px-3",
          mobileOpen ? "translate-x-0 px-3" : "-translate-x-full px-3 md:translate-x-0",
          collapsed ? "md:w-[72px]" : "md:w-[var(--sidebar-expanded-width)]",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            collapsed ? "h-auto flex-col py-3 md:py-3" : "h-[68px]",
          )}
        >
          <Link
            href="/"
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-[10px] p-2 transition-colors hover:bg-muted",
              collapsed ? "md:justify-center" : "min-w-0 flex-1",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[image:var(--gradient-primary)] text-sm font-bold text-primary-foreground shadow-[var(--shadow-xs)]">
              H
            </span>
            <span className={cn("min-w-0", collapsed && "md:hidden")}>
              <span className="block truncate text-sm font-semibold">Hermes Console</span>
              <span className="block truncate text-[0.6875rem] text-muted-foreground">
                Runtime operations
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}
            aria-pressed={collapsed}
            className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex"
          >
            {collapsed ? (
              <PanelLeftOpenIcon className="size-4" />
            ) : (
              <PanelLeftCloseIcon className="size-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer la navigation"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          title={collapsed ? "Recherche rapide" : undefined}
          className={cn(
            "mb-3 flex h-9 shrink-0 items-center rounded-[10px] border border-input bg-card text-muted-foreground shadow-board-xs transition-colors hover:bg-muted hover:text-foreground",
            collapsed ? "justify-center px-0" : "gap-2 px-2.5",
          )}
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className={cn("flex-1 text-start text-[0.8125rem]", collapsed && "md:hidden")}>
            Recherche rapide
          </span>
          <kbd
            className={cn(
              "rounded border border-input bg-muted px-1.5 py-0.5 font-sans text-[0.625rem]",
              collapsed && "md:hidden",
            )}
          >
            {shortcut}
          </kbd>
        </button>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 scrollbar-subtle">
          <NavGroup items={PRIMARY_NAV} pathname={pathname} collapsed={collapsed} />
        </nav>

        <div className="shrink-0">
          <div className="mb-3 h-px bg-border" />
          <NavGroup items={SECONDARY_NAV} pathname={pathname} collapsed={collapsed} />
          <Link
            href="/settings/runtime"
            className={cn(
              "mt-3 block overflow-hidden rounded-2xl bg-surface-sunken p-1 transition-colors hover:bg-muted",
              collapsed && "md:hidden",
            )}
          >
            <div className="rounded-xl bg-card p-3 shadow-board-card">
              <div className="flex items-center gap-2">
                <span className="relative flex size-7 items-center justify-center rounded-lg bg-info-soft text-info-700">
                  <ServerIcon className="size-3.5" />
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-card",
                      runtime.dotClass,
                    )}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.75rem] font-medium">{runtime.title}</span>
                  <span className="block truncate text-[0.6875rem] text-muted-foreground">
                    {runtime.detail}
                  </span>
                </span>
              </div>
            </div>
          </Link>
        </div>

        <div
          className={cn(
            "mb-3 flex min-h-12 items-center rounded-[10px] p-2 transition-colors hover:bg-muted",
            collapsed ? "justify-center" : "gap-2.5",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ai-tertiary text-xs font-semibold">
            A
          </span>
          <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
            <span className="block truncate text-[0.8125rem] font-medium">Administrateur</span>
            <span className="block truncate text-[0.6875rem] text-muted-foreground">
              Console locale
            </span>
          </span>
        </div>
      </aside>
    </>
  );
}

function navItemMatches(item: NavItem, pathname: string): boolean {
  return item.href === "/"
    ? pathname === "/"
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function activeNavHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (!navItemMatches(item, pathname)) continue;
    if (!best || item.href.length > best.length) best = item.href;
  }
  return best;
}

function NavGroup({
  items,
  pathname,
  collapsed,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  const activeHref = activeNavHref(items, pathname);

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const active = activeHref === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/nav flex min-h-9 items-center rounded-[10px] text-[0.8125rem] transition-colors",
              collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={cn("min-w-0 flex-1 truncate", collapsed && "md:hidden")}>
              {item.label}
            </span>
            {item.badge ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full bg-ai-tertiary px-1.5 text-[0.625rem] font-semibold",
                  collapsed && "md:hidden",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function ConsoleHeader({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const meta = pageMeta(pathname);
  const { setMobileOpen } = useBui();

  return (
    <header className="sticky top-0 z-30 flex shrink-0 flex-col gap-3 bg-panel/90 px-4 pt-3 pb-3 backdrop-blur-sm lg:px-6">
      <div className="flex w-full items-center justify-between gap-3 text-[0.8125rem]">
        <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir la navigation"
            className="mr-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
          >
            <MenuIcon className="size-4" />
          </button>
          <span className="inline-flex size-4 items-center justify-center rounded-[4px] bg-info-soft text-[0.625rem] font-semibold text-info-700">
            H
          </span>
          <span className="hidden text-muted-foreground sm:inline">Hermes</span>
          <ChevronRightIcon className="size-3.5 shrink-0 text-ai-icon-tertiary" />
          {meta.parent ? (
            <>
              <Link href={meta.parent.href} className="text-muted-foreground hover:text-foreground">
                {meta.parent.label}
              </Link>
              <ChevronRightIcon className="size-3.5 shrink-0 text-ai-icon-tertiary" />
            </>
          ) : null}
          <span className="max-w-[40vw] truncate font-medium">{meta.crumb}</span>
        </nav>

        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Ouvrir la recherche rapide"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
        >
          <SearchIcon className="size-4" />
        </button>
      </div>

      <div className={cn("w-full", meta.centerTitle && "mx-auto max-w-5xl")}>
        <div
          className={cn(
            "flex w-full items-center gap-3",
            meta.centerTitle ? "justify-center" : "justify-between",
          )}
        >
          <h1
            className={cn(
              "min-w-0 truncate text-xl font-semibold tracking-tight sm:text-2xl",
              meta.centerTitle && "text-center",
            )}
          >
            {meta.title}
          </h1>
        </div>
      </div>
    </header>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(() => [...PRIMARY_NAV, ...SECONDARY_NAV], []);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return normalized
      ? items.filter((item) => item.label.toLocaleLowerCase("fr").includes(normalized))
      : items;
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;

  const select = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide"
        onMouseDown={(event) => event.stopPropagation()}
        className="grid max-h-[calc(100dvh-4rem)] w-full max-w-xl gap-3 overflow-hidden rounded-2xl border border-border bg-surface-sunken p-1 shadow-board-elevated"
      >
        <div className="flex h-12 items-center px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter" && filtered[active]) {
                event.preventDefault();
                select(filtered[active].href);
              }
            }}
            placeholder="Rechercher une page ou une action…"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setQuery("")}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>

        <div
          role="listbox"
          className="max-h-80 overflow-y-auto rounded-xl bg-card p-1 shadow-board-xs scrollbar-subtle"
        >
          {filtered.length ? (
            <>
              <p className="px-2 py-1.5 text-[0.6875rem] font-medium text-muted-foreground">
                Navigation Hermes Console
              </p>
              {filtered.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => select(item.href)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start text-[0.8125rem] transition-colors",
                      active === index ? "bg-muted text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRightIcon className="size-3.5 opacity-50" />
                  </button>
                );
              })}
            </>
          ) : (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-muted-foreground">
              Aucun résultat.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between px-3 pb-2 text-[0.625rem] text-muted-foreground">
          <span>↑ ↓ naviguer · ↵ ouvrir</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  );
}

function useShortcutLabel() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const platform = navigator.platform || navigator.userAgent;
      setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return isMac ? "⌘K" : "Ctrl K";
}
