/**
 * Table de navigation de la Console, et le peu de logique qui va avec.
 *
 * Extrait de `console-shell.tsx` : le rail (`nav-main`, `nav-secondary`), la
 * barre de titre (`site-header`) et la palette ⌘K lisent tous la même source.
 */
import {
  BotIcon,
  CircleHelpIcon,
  FileBoxIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  MilestoneIcon,
  ScrollTextIcon,
  SettingsIcon,
  SquarePenIcon,
  SparklesIcon,
  RocketIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  requiredCapability?: string;
  section?: string;
};

export const DEFAULT_CONSOLE_PATH = "/tasks/new";

export const WORK_NAV = [
  {
    label: "Nouvelle tâche",
    href: "/tasks/new",
    icon: SquarePenIcon,
    requiredCapability: "thread.create",
    section: "Travail",
  },
  {
    label: "Historique",
    href: "/sessions",
    icon: HistoryIcon,
    requiredCapability: "thread.read",
    section: "Travail",
  },
  {
    label: "Agents",
    href: "/agents",
    icon: BotIcon,
    requiredCapability: "agent.read",
    section: "Détails techniques",
  },
  {
    label: "Skills",
    href: "/skills",
    icon: SparklesIcon,
    requiredCapability: "agent.read",
    section: "Détails techniques",
  },
  {
    label: "Artefacts",
    href: "/artifacts",
    icon: FileBoxIcon,
    requiredCapability: "artifact.read",
    section: "Détails techniques",
  },
  {
    label: "Chat expert",
    href: "/chat",
    icon: MessageSquareIcon,
    requiredCapability: "thread.read",
    section: "Détails techniques",
  },
  {
    label: "Aperçu",
    href: "/overview",
    icon: LayoutDashboardIcon,
    requiredCapability: "run.read",
    section: "Administration",
  },
] satisfies NavItem[];

export const CONTROL_NAV: NavItem[] = [];

export const FOOTER_NAV = [
  {
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    requiredCapability: "installation.admin",
    section: "Administration",
  },
  {
    label: "Roadmap",
    href: "/roadmap",
    icon: MilestoneIcon,
    requiredCapability: "run.read",
    section: "Administration",
  },
  {
    label: "Mises à jour",
    href: "/updates",
    icon: RocketIcon,
    requiredCapability: "run.read",
    section: "Administration",
  },
  {
    label: "Journal",
    href: "/audit",
    icon: ScrollTextIcon,
    requiredCapability: "audit.read",
    section: "Administration",
  },
  {
    label: "Aide",
    href: "/support",
    icon: CircleHelpIcon,
    requiredCapability: "run.read",
    section: "Administration",
  },
] satisfies NavItem[];

/** Toutes les destinations, pour la palette ⌘K. */
export const ALL_NAV = [...WORK_NAV, ...CONTROL_NAV, ...FOOTER_NAV] satisfies NavItem[];

export function navForCapabilities<T extends NavItem>(
  items: readonly T[],
  capabilities: ReadonlySet<string>,
): T[] {
  return items.filter(
    (item) => !item.requiredCapability || capabilities.has(item.requiredCapability),
  );
}

export function navItemMatches(item: NavItem, pathname: string): boolean {
  // Une mission est une exécution ouverte depuis l'index Sessions. Les routes
  // historiques `/runs/*` restent stables, mais le rail garde Sessions actif.
  if (item.href === "/sessions" && (pathname === "/runs" || pathname.startsWith("/runs/"))) {
    return true;
  }
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
  if (pathname === "/tasks/new") return { title: "Nouvelle tâche", crumb: "Créer" };
  if (pathname === "/overview") return { title: "Vue d’ensemble", crumb: "Aperçu" };
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
  if (pathname === "/skills") return { title: "Skills", crumb: "Skills" };
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
  if (pathname === "/sessions") return { title: "Sessions", crumb: "Sessions" };
  if (pathname === "/runs/new") {
    return {
      title: "Nouvelle mission",
      crumb: "Créer",
      parent: { label: "Sessions", href: "/sessions?source=mission" },
    };
  }
  if (pathname.startsWith("/runs/")) {
    return {
      title: "Mission",
      crumb: "Exécution",
      parent: { label: "Sessions", href: "/sessions?source=mission" },
    };
  }
  if (pathname === "/runs") return { title: "Sessions", crumb: "Sessions" };
  if (pathname === "/artifacts") return { title: "Artefacts", crumb: "Artefacts" };
  if (pathname === "/audit") return { title: "Journal d’audit", crumb: "Journal" };
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
  if (pathname === "/roadmap") return { title: "Roadmap", crumb: "Roadmap" };
  if (pathname === "/updates") return { title: "Mises à jour Hermes", crumb: "Mises à jour" };
  if (pathname === "/settings/retention") {
    return {
      title: "Conservation",
      crumb: "Conservation",
      parent: { label: "Paramètres", href: "/settings" },
    };
  }
  if (pathname === "/settings/achievements") {
    return {
      title: "Badges",
      crumb: "Badges",
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
