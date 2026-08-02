/**
 * Table de navigation de la Console, et le peu de logique qui va avec.
 *
 * Extrait de `console-shell.tsx` : le rail (`nav-main`, `nav-secondary`), la
 * barre de titre (`site-header`) et la palette ⌘K lisent tous la même source.
 */
import {
  ActivityIcon,
  BotIcon,
  CircleHelpIcon,
  FileBoxIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  requiredCapability?: string;
};

export const PRIMARY_NAV = [
  { label: "Aperçu", href: "/", icon: LayoutDashboardIcon, requiredCapability: "run.read" },
  { label: "Chat", href: "/chat", icon: MessageSquareIcon, requiredCapability: "thread.read" },
  { label: "Agents", href: "/agents", icon: BotIcon, requiredCapability: "agent.read" },
  { label: "Missions", href: "/runs", icon: ActivityIcon, requiredCapability: "run.read" },
] satisfies NavItem[];

/**
 * Groupe libellé du milieu — le « Documents » du bloc. Les artefacts sont les
 * seuls livrables persistés par la Console, ils y vont seuls plutôt que d'être
 * accompagnés d'entrées inventées.
 */
export const DOCUMENTS_NAV = [
  { label: "Artefacts", href: "/artifacts", icon: FileBoxIcon, requiredCapability: "artifact.read" },
] satisfies NavItem[];

export const SECONDARY_NAV = [
  // Les paramètres racine chargent encore des endpoints installation-global
  // (runtime/chiffrement) que les rôles site ne peuvent pas appeler. Ne pas
  // afficher ce lien tant qu'un capability installation-admin n'est pas livré.
  { label: "Paramètres", href: "/settings", icon: SettingsIcon, requiredCapability: "installation.admin" },
  { label: "Aide", href: "/support", icon: CircleHelpIcon, requiredCapability: "run.read" },
] satisfies NavItem[];

/** Toutes les destinations, pour la palette ⌘K. */
export const ALL_NAV = [...PRIMARY_NAV, ...DOCUMENTS_NAV, ...SECONDARY_NAV] satisfies NavItem[];

export function navForCapabilities<T extends NavItem>(
  items: readonly T[],
  capabilities: ReadonlySet<string>,
): T[] {
  return items.filter(
    (item) => !item.requiredCapability || capabilities.has(item.requiredCapability),
  );
}

export function navItemMatches(item: NavItem, pathname: string): boolean {
  return item.href === "/"
    ? pathname === "/"
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** L'item le plus spécifique qui correspond — `/settings/runtime` bat `/settings`. */
export function activeNavHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (!navItemMatches(item, pathname)) continue;
    if (!best || item.href.length > best.length) best = item.href;
  }
  return best;
}

export type PageMeta = {
  title: string;
  crumb: string;
  parent?: { label: string; href: string };
};

export function pageMeta(pathname: string): PageMeta {
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
