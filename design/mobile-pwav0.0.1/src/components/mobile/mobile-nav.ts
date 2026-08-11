/**
 * Mobile navigation is a hierarchical stack: every screen knows its parent, and
 * the back button walks that hierarchy instead of replaying browser history.
 * A deep link therefore lands with a coherent back target, which history.back()
 * cannot guarantee.
 */

export type MobileStack = {
  title: string;
  parent: { to: string; label: string } | null;
};

export const MOBILE_TAB_ENTRIES = [
  { id: "home", path: "/channels", label: "Accueil" },
  { id: "activity", path: "/activity", label: "Activité" },
  { id: "hermes", path: "/hermes", label: "Hermes" },
  { id: "search", path: "", label: "Recherche" },
] as const;

export type MobileTabId = (typeof MOBILE_TAB_ENTRIES)[number]["id"];

export function mobileTabForPath(pathname: string): MobileTabId | null {
  if (pathname.startsWith("/hermes/")) return "hermes";
  return (
    MOBILE_TAB_ENTRIES.find(
      (entry) => entry.path.length > 0 && entry.path === pathname,
    )?.id ?? null
  );
}

const MOBILE_TAB_SCROLL_PREFIX = "hermes-mobile-tab-scroll";

export function restoreMobileTabScroll(workspaceId: string, tab: MobileTabId) {
  try {
    const value = window.sessionStorage.getItem(
      `${MOBILE_TAB_SCROLL_PREFIX}:${workspaceId}:${tab}`,
    );
    return value ? Number.parseInt(value, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function persistMobileTabScroll(
  workspaceId: string,
  tab: MobileTabId | null,
  scrollTop: number,
) {
  if (!tab) return;
  try {
    window.sessionStorage.setItem(
      `${MOBILE_TAB_SCROLL_PREFIX}:${workspaceId}:${tab}`,
      String(Math.max(0, Math.round(scrollTop))),
    );
  } catch {
    // Private browsing can disable session storage. Navigation must still work.
  }
}

/** `short` is the label used when the entry appears as a back target. */
const STACK: Record<
  string,
  { title: string; parent: string | null; short?: string }
> = {
  "/channels": { title: "Accueil", parent: null, short: "Accueil" },
  "/activity": { title: "Activité", parent: null, short: "Activité" },
  "/hermes": { title: "Hermes", parent: null, short: "Hermes" },
  "/menu": { title: "Menu", parent: "/channels", short: "Menu" },
  "/inbox": { title: "File", parent: "/activity" },
  "/missions": { title: "Missions", parent: "/activity" },
  "/layouts": { title: "Layout lab", parent: "/menu" },
  "/tasks/new": { title: "Nouvelle tâche", parent: "/activity" },
  "/history": { title: "Historique", parent: "/activity" },
  "/members": { title: "Membres", parent: "/menu" },
  "/registry": { title: "Registre", parent: "/menu" },
  "/audit": { title: "Audit", parent: "/menu" },
  "/settings": { title: "Réglages", parent: "/menu" },
  "/account": { title: "Profil opérateur", parent: "/menu" },
  "/workspaces": { title: "Workspaces", parent: "/channels" },
};

export function withWorkspace(path: string, workspaceId: string) {
  const [pathname, hash] = path.split("#");
  const [base, ownSearch] = pathname.split("?");
  const search = new URLSearchParams(ownSearch ?? "");
  search.set("workspace", workspaceId);
  return `${base}?${search.toString()}${hash ? `#${hash}` : ""}`;
}

export function decodeChannelId(pathname: string) {
  if (!pathname.startsWith("/channels/")) return null;
  const encoded = pathname.split("/")[2] ?? "";
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export function resolveMobileStack({
  pathname,
  search,
  workspaceId,
  channelName,
  itemTitle,
  missionName,
}: {
  pathname: string;
  search: string;
  workspaceId: string;
  channelName?: string;
  itemTitle?: string;
  missionName?: string;
}): MobileStack {
  const params = new URLSearchParams(search);
  const link = (to: string, label: string) => ({
    to: withWorkspace(to, workspaceId),
    label,
  });

  if (pathname.startsWith("/channels/")) {
    const channelId = decodeChannelId(pathname);
    const channelLabel = channelName ? `# ${channelName}` : "Salon";
    if (!channelId) return { title: "Salons", parent: link("/menu", "Menu") };
    const channelPath = `/channels/${encodeURIComponent(channelId)}`;
    if (params.get("thread"))
      return { title: "Fil de discussion", parent: link(channelPath, channelLabel) };
    if (params.get("details") === "1")
      return { title: "Informations", parent: link(channelPath, channelLabel) };
    if (params.get("tab") === "files")
      return { title: "Fichiers", parent: link(channelPath, channelLabel) };
    if (params.get("tab") === "pins")
      return { title: "Épinglés", parent: link(channelPath, channelLabel) };
    return { title: channelLabel, parent: link("/channels", "Accueil") };
  }

  if (pathname.startsWith("/inbox/"))
    return { title: itemTitle ?? "Élément", parent: link("/inbox", "File") };

  if (pathname.startsWith("/missions/"))
    return {
      title: missionName ?? "Mission",
      parent: link("/missions", "Missions"),
    };

  if (pathname.startsWith("/hermes/"))
    return { title: "Conversation", parent: link("/hermes", "Hermes") };

  const entry = STACK[pathname];
  if (!entry) return { title: "Introuvable", parent: link("/menu", "Menu") };
  const parent = entry.parent ? STACK[entry.parent] : null;
  return {
    title: entry.title,
    parent:
      entry.parent && parent
        ? link(entry.parent, parent.short ?? parent.title)
        : null,
  };
}
