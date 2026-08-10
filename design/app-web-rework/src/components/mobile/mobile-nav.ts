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

export const MOBILE_ROOT = "/menu";

/** `short` is the label used when the entry appears as a back target. */
const STACK: Record<
  string,
  { title: string; parent: string | null; short?: string }
> = {
  "/menu": { title: "Hermes Console", parent: null, short: "Menu" },
  "/inbox": { title: "File", parent: "/menu" },
  "/tasks/new": { title: "Nouvelle tâche", parent: "/inbox" },
  "/channels": { title: "Salons", parent: "/menu" },
  "/history": { title: "Historique", parent: "/menu" },
  "/members": { title: "Membres", parent: "/menu" },
  "/registry": { title: "Registre", parent: "/menu" },
  "/audit": { title: "Audit", parent: "/menu" },
  "/settings": { title: "Réglages", parent: "/menu" },
  "/account": { title: "Profil opérateur", parent: "/menu" },
  "/workspaces": { title: "Workspaces", parent: "/menu" },
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
}: {
  pathname: string;
  search: string;
  workspaceId: string;
  channelName?: string;
  itemTitle?: string;
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
    return { title: channelLabel, parent: link("/channels", "Salons") };
  }

  if (pathname.startsWith("/inbox/"))
    return { title: itemTitle ?? "Élément", parent: link("/inbox", "File") };

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
