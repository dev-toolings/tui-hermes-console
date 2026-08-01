"use client";

import { BuiSidebarProvider, useBui } from "@boardui/ui/shell/primitives";
import { SidebarInset, SidebarProvider, useSidebar } from "@boardui/ui";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "@/lib/router";
import { cn } from "@/lib/cn";
import { hermesAppearance } from "@/lib/settings/appearance";
import { RunPageChromeProvider } from "@/components/run/run-page-chrome";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { SiteHeader } from "./site-header";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";

/**
 * Coque de la Console, sur le shell shadcn (`SidebarProvider` / `Sidebar` /
 * `SidebarInset`) dans la disposition du bloc `dashboard-01`.
 *
 * `BuiSidebarProvider` reste monté au-dessus : il ne rend aucun DOM, il ne sert
 * plus qu'à porter deux états déjà persistés — la disposition (`boardui` /
 * `inset`, réglée depuis Paramètres → Apparence) et le pli du rail, avec son
 * auto-repli en tablette portrait. On branche `SidebarProvider` en mode
 * contrôlé dessus plutôt que de dupliquer ces règles.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <BuiSidebarProvider
      storageKey="hermes-console-layout"
      // Le bloc `dashboard-01` monte le rail en `variant="inset"` : panneau de
      // contenu flottant, rail posé sur le fond de page. C'est la disposition
      // de référence, donc celle par défaut ici.
      defaultLayout="inset"
      autoCollapseOnTabletPortrait
    >
      <RunPageChromeProvider>
        <ConsoleShellFrame>{children}</ConsoleShellFrame>
      </RunPageChromeProvider>
    </BuiSidebarProvider>
  );
}

function ConsoleShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { collapsed, setCollapsed, layout } = useBui();
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
  const capabilities = readPersonaCapabilities();
  hermesAppearance.useApplyUiScale(appearance.uiScale);

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

  const railOpen = isChatSurface ? chatRailOpen : !collapsed;
  const setRailOpen = isChatSurface
    ? (open: boolean) => setChatRailOpen(open)
    : (open: boolean) => setCollapsed(!open);

  return (
    <SidebarProvider
      open={railOpen}
      onOpenChange={setRailOpen}
      style={
        {
          "--sidebar-width": `${appearance.sidebarWidth}px`,
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
      className="h-dvh overflow-hidden"
    >
      <CloseMobileRailOnNavigation />
      <AppSidebar
        variant={layout === "inset" ? "inset" : "sidebar"}
        onOpenPalette={() => setPaletteOpen(true)}
        capabilities={capabilities}
      />
      <SidebarInset
        // Le chat gère sa propre largeur (3 panneaux) : le brider à la largeur
        // de lecture des pages Console tasserait le transcript.
        style={
          {
            "--container-content": isChatSurface
              ? "100%"
              : hermesAppearance.contentWidthCss(appearance.contentWidth),
          } as CSSProperties
        }
        className="min-w-0 overflow-hidden"
      >
        {immersiveView ? null : <SiteHeader onOpenPalette={() => setPaletteOpen(true)} />}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            immersiveView ? "overflow-hidden" : "overflow-y-auto scrollbar-subtle",
          )}
        >
          {children}
        </div>
      </SidebarInset>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        capabilities={capabilities}
      />
    </SidebarProvider>
  );
}

/**
 * En mobile le rail est une `Sheet` : sans ça elle resterait ouverte
 * par-dessus la page qu'on vient d'ouvrir. Composant séparé parce que
 * `useSidebar` exige d'être sous le provider.
 */
function CloseMobileRailOnNavigation() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpenMobile(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname, setOpenMobile]);

  return null;
}
