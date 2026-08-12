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

/**
 * The roots that keep their own scroll position across navigations. This is a
 * scroll-restoration model, not a navigation one: the drawer owns navigation.
 */
export const MOBILE_SCROLL_ROOTS = [
  { id: "home", path: "/inbox" },
  { id: "activity", path: "/activity" },
  { id: "hermes", path: "/hermes" },
] as const;

export type MobileTabId = (typeof MOBILE_SCROLL_ROOTS)[number]["id"];

export function mobileTabForPath(pathname: string): MobileTabId | null {
  if (pathname.startsWith("/hermes/")) return "hermes";
  return MOBILE_SCROLL_ROOTS.find((entry) => entry.path === pathname)?.id ?? null;
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
  "/inbox": { title: "File", parent: null, short: "File" },
  "/activity": { title: "Activité", parent: null, short: "Activité" },
  "/hermes": { title: "Hermes", parent: null, short: "Hermes" },
  "/menu": { title: "Menu", parent: "/inbox", short: "Menu" },
  "/channels": { title: "Canaux", parent: "/menu", short: "Canaux" },
  "/missions": { title: "Missions", parent: "/activity" },
  "/labs": { title: "Labs", parent: "/menu", short: "Labs" },
  "/labs/training": { title: "Terrain d'entraînement", parent: "/labs" },
  "/labs/layout-lab": { title: "Layout lab", parent: "/labs" },
  "/tasks/new": { title: "Nouvelle tâche", parent: "/activity" },
  "/history": { title: "Historique", parent: "/activity" },
  "/members": { title: "Membres", parent: "/menu" },
  "/audit": { title: "Audit", parent: "/menu" },
  "/settings": { title: "Réglages", parent: "/menu" },
  "/account": { title: "Profil opérateur", parent: "/menu" },
  "/workspaces": { title: "Workspaces", parent: "/inbox" },
};

/** Prefix an app path with its organization slug: orgPath("acme", "/inbox") → "/acme/inbox". */
export function orgPath(org: string, path: string) {
  return `/${org}${path === "/" ? "" : path}`;
}

/**
 * Drop the leading org segment so route matching keeps its unprefixed keys:
 * stripOrg("/acme/inbox/42") → "/inbox/42". Strip exactly once, at the point
 * where a router pathname enters app logic.
 */
export function stripOrg(pathname: string) {
  const rest = pathname.replace(/^\/[^/]+/, "");
  return rest === "" ? "/" : rest;
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
  org,
  channelName,
  itemTitle,
  missionName,
}: {
  /** Org-less pathname — callers strip the org segment first. */
  pathname: string;
  search: string;
  org: string;
  channelName?: string;
  itemTitle?: string;
  missionName?: string;
}): MobileStack {
  const params = new URLSearchParams(search);
  const link = (to: string, label: string) => ({
    to: orgPath(org, to),
    label,
  });

  if (pathname.startsWith("/channels/")) {
    const channelId = decodeChannelId(pathname);
    const channelLabel = channelName ? `# ${channelName}` : "Canal";
    if (!channelId) return { title: "Canaux", parent: link("/menu", "Menu") };
    const channelPath = `/channels/${encodeURIComponent(channelId)}`;
    if (params.get("thread"))
      return { title: "Fil de discussion", parent: link(channelPath, channelLabel) };
    if (params.get("details") === "1")
      return { title: "Informations", parent: link(channelPath, channelLabel) };
    if (params.get("tab") === "files")
      return { title: "Fichiers", parent: link(channelPath, channelLabel) };
    if (params.get("tab") === "pins")
      return { title: "Épinglés", parent: link(channelPath, channelLabel) };
    return { title: channelLabel, parent: link("/channels", "Canaux") };
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
