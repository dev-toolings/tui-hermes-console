import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router";
import { Modal, ModalButton } from "../ui/modal";
import { decodeChannelId, orgPath, stripOrg } from "../mobile/mobile-nav";
import { useChannelReadCounts } from "../../state/channel-reads";
import {
  ATTENTION_LABEL,
  channelAttention,
  channelAttentionSummary,
  formatElapsed,
} from "../../state/channel-attention";
import { workspaceToneClasses } from "../shell/workspace-tone";
import {
  ChannelDialogs,
  RowMenu,
  channelMenuItems,
  type ChannelActions,
} from "../channels/channel-menu";
import type {
  Channel,
  ChannelCategory,
  Member,
} from "../../state/console-store";
import { useAuthStore } from "../../state/auth-store";
import {
  RiAddLine,
  RiCompass3Line,
  RiDashboardLine,
  RiFileSearchLine,
  RiFlowChart,
  RiFolderHistoryLine,
  RiFlaskLine,
  RiGroupLine,
  RiHashtag,
  RiLogoutBoxRLine,
  RiMenuLine,
  RiMoonLine,
  RiNotification3Line,
  RiPulseLine,
  RiSearchLine,
  RiSettings4Line,
  RiSparkling2Line,
  RiStarFill,
  RiSunLine,
  RiTaskLine,
  RiUser3Line,
  RiUserLine,
} from "@remixicon/react";

/* Exact BoardUI sidebar glyphs — inlined so the strokes and metrics match the
   reference, where the Remix set has no 1:1 equivalent. */
function ChevronUpDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <g transform="translate(4.25 2.56)">
        <path
          d="M0.75 7.43934L3.21967 9.90901C3.51256 10.2019 3.98744 10.2019 4.28033 9.90901L6.75 7.43934"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M0.75 3.43934L3.21967 0.96967C3.51256 0.676777 3.98744 0.676777 4.28033 0.96967L6.75 3.43934"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function ChevronDownSmallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M4 7L7.29289 10.2929C7.68342 10.6834 8.31658 10.6834 8.70711 10.2929L12 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ManageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M7 3V6H3V8H7V11H9V3H7ZM11 8H21V6H11V8ZM17 13V16H21V18H17V21H15V13H17ZM13 18H3V16H13V18Z" />
    </svg>
  );
}

export type Workspace = {
  id: string;
  name: string;
  short: string;
  tone: string;
  description: string;
};

type Props = {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  profile: { name: string; role: string };
  onWorkspaceChange: (id: string) => void;
  members: Member[];
  pendingCount: number;
  collapsed: boolean;
  dark: boolean;
  setDark: (value: boolean, origin?: HTMLElement) => void;
  channels: Channel[];
  channelCategories: ChannelCategory[];
  channelMessageCounts: Record<string, number>;
  createChannel: ChannelActions["createChannel"];
  channelActions: ChannelActions;
  /** "drawer" drops the desktop wrappers so the panel can fill a mobile sheet. */
  variant?: "desktop" | "drawer";
};

type NavEntry = { label: string; to: string; icon: typeof RiDashboardLine };

/** Console module: everything that owns a mission, a proof or a decision. */
const CONSOLE_NAV: NavEntry[] = [
  { label: "File", to: "/inbox", icon: RiDashboardLine },
  { label: "Activité", to: "/activity", icon: RiPulseLine },
  { label: "Missions", to: "/missions", icon: RiFlowChart },
  { label: "Hermes", to: "/hermes", icon: RiSparkling2Line },
  { label: "Historique", to: "/history", icon: RiFolderHistoryLine },
  { label: "Membres", to: "/members", icon: RiGroupLine },
];

/**
 * Mobile-only destinations: on desktop they live in the user menu and the
 * workspace switcher, which the drawer shows too but behind a popover.
 */
const MOBILE_NAV: NavEntry[] = [
  { label: "Profil opérateur", to: "/account", icon: RiUserLine },
  { label: "Workspaces", to: "/workspaces", icon: RiCompass3Line },
  { label: "Menu", to: "/menu", icon: RiMenuLine },
];

/** Pinned regardless of the active module: audit trail and settings. */
const PINNED_NAV: NavEntry[] = [
  { label: "Audit", to: "/audit", icon: RiFileSearchLine },
  { label: "Réglages", to: "/settings", icon: RiSettings4Line },
];

/** Labs module: opt-in experiments, kept out of the product vocabulary. */
const LAB_NAV: NavEntry[] = [
  { label: "Labs", to: "/labs", icon: RiFlaskLine },
];

const MODULES = [
  { id: "console", label: "Console", icon: RiCompass3Line, home: "/inbox" },
  { id: "channels", label: "Canaux", icon: RiHashtag, home: "/channels" },
  { id: "lab", label: "Labs", icon: RiFlaskLine, home: "/labs" },
] as const;

type ModuleId = (typeof MODULES)[number]["id"];

function moduleForPath(pathname: string): ModuleId {
  if (pathname.startsWith("/channels")) return "channels";
  if (pathname.startsWith("/labs")) return "lab";
  return "console";
}

function normalizeChannelName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateChannelDialog({
  open,
  trigger,
  createChannel,
  categories = [],
  defaultCategoryId,
  onClose,
  onCreated,
}: {
  open: boolean;
  trigger: React.RefObject<HTMLButtonElement | null>;
  createChannel: Props["createChannel"];
  /** Omitted or single-entry: the picker stays hidden and the first one is used. */
  categories?: ChannelCategory[];
  defaultCategoryId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const inputId = useId();
  const formId = useId();
  const selectId = useId();

  useEffect(() => {
    if (open) setCategoryId(defaultCategoryId ?? categories[0]?.id ?? "");
  }, [categories, defaultCategoryId, open]);

  const close = () => {
    setName("");
    setError("");
    onClose();
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeChannelName(name);
    if (!name.trim()) {
      setError("Saisissez un nom de canal.");
      return;
    }
    if (!normalized) {
      setError("Utilisez au moins une lettre ou un chiffre.");
      return;
    }
    const channel = createChannel(name, categoryId || undefined);
    if (!channel) {
      setError("Un canal portant ce nom existe déjà.");
      return;
    }
    setName("");
    setError("");
    onCreated(channel.id);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Créer un canal"
      description="Organisez les échanges de cet espace autour d'un sujet."
      footer={
        <>
          <ModalButton onClick={close}>Annuler</ModalButton>
          <ModalButton type="submit" variant="primary" form={formId}>
            Créer
          </ModalButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="block text-[12px] font-medium text-[var(--foreground)]">
          Nom du canal
        </label>
        <input
          id={inputId}
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError("");
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder="nom-du-canal"
          className={`mt-1.5 h-11 w-full rounded-[8px] border bg-[var(--card)] px-2.5 text-body-2-regular md:h-8 text-[var(--foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-tertiary)] focus:border-[color-mix(in_srgb,var(--ring)_55%,var(--border-control))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_14%,transparent)] ${error ? "border-[var(--state-neg-fg)]" : "border-[var(--border-control)]"}`}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-body-2-regular text-[var(--state-neg-fg)]">
            {error}
          </p>
        )}
        {categories.length > 1 && (
          <>
            <label
              htmlFor={selectId}
              className="mt-3 block text-[12px] font-medium text-[var(--foreground)]"
            >
              Section
            </label>
            <select
              id={selectId}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-[8px] border border-[var(--border-control)] bg-[var(--card)] px-2 text-body-2-regular text-[var(--foreground)] outline-none focus:border-[color-mix(in_srgb,var(--ring)_55%,var(--border-control))] md:h-8"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </>
        )}
      </form>
    </Modal>
  );
}

function ChannelsSection({
  collapsed,
  channels,
  channelCategories,
  channelMessageCounts,
  actions,
  workspaceId,
  query,
}: {
  collapsed: boolean;
  channels: Props["channels"];
  channelCategories: Props["channelCategories"];
  channelMessageCounts: Props["channelMessageCounts"];
  actions: ChannelActions;
  workspaceId: string;
  query: string;
}) {
  const [dialogCategoryId, setDialogCategoryId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Channel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [moveTarget, setMoveTarget] = useState<Channel | null>(null);
  /* Sections are not drawn here anymore, but moving a channel can still ask
     for a new one, so the creation dialog stays reachable. */
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const activeChannelId = decodeChannelId(stripOrg(location.pathname));
  const { unreadFor, markRead } = useChannelReadCounts(
    workspaceId,
    channelMessageCounts,
    activeChannelId,
  );
  const visibleChannels = [...channels]
    .filter(
      (channel) => !query || channel.name.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)));

  /* Two lines: the name, then what the channel currently asks for in words. */
  const channelInboxLink = (channel: Channel) => {
    const attention = channelAttention(channel.id, {
      hasUnread: unreadFor(channel.id) > 0,
    });
    const stateLabel = ATTENTION_LABEL[attention.state];
    const summary = channelAttentionSummary(
      attention,
      channel.topic || "Aucune mission en cours",
    );
    return (
      <NavLink
        to={orgPath(workspaceId, `/channels/${channel.id}`)}
        onClick={() => markRead(channel.id)}
        className={({ isActive }) =>
          /* `relative` anchors the sr-only state text: absolutely positioned
             against a distant ancestor, it widened the scroll container. */
          `relative flex min-w-0 flex-1 flex-col gap-0.5 rounded-[8px] px-2 py-1.5 ${isActive ? "bg-[var(--surface-hover)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"}`
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <RiHashtag className="size-4 shrink-0" />
          <span
            className={`min-w-0 truncate text-body-2-medium ${attention.state === "activity" ? "font-semibold text-[var(--foreground)]" : ""}`}
          >
            {channel.name}
          </span>
          {channel.starred && (
            <RiStarFill className="size-3 shrink-0 opacity-70" aria-label="Favori" />
          )}
          {attention.state !== "calm" && (
            <span
              aria-hidden="true"
              className={`channel-dot channel-dot--${attention.state} channel-dot--inline ml-auto`}
            />
          )}
        </span>
        <span className="min-w-0 truncate pl-6 text-caption-1 text-[var(--text-tertiary)]">
          {summary}
        </span>
        {/* Outside the truncated line: its static position sits after the
            clipped text, which would stretch the scroll container. */}
        {stateLabel ? <span className="sr-only">{stateLabel}</span> : null}
      </NavLink>
    );
  };

  const channelLink = (channel: Channel) => {
    const attention = channelAttention(channel.id, {
      hasUnread: unreadFor(channel.id) > 0,
    });
    const stateLabel = ATTENTION_LABEL[attention.state];
    return (
      <NavLink
        to={orgPath(workspaceId, `/channels/${channel.id}`)}
        onClick={() => markRead(channel.id)}
        title={
          collapsed
            ? `# ${channel.name}${stateLabel ? ` · ${stateLabel}` : ""}`
            : undefined
        }
        className={({ isActive }) =>
          collapsed
            ? `relative inline-flex size-8 items-center justify-center rounded-[8px] ${isActive ? "bg-[var(--surface-hover)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"}`
            : `flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 text-body-2-medium ${isActive ? "bg-[var(--surface-hover)] font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"}`
        }
      >
        <RiHashtag className="size-4 shrink-0" />
        {!collapsed && (
          <span
            className={`truncate ${attention.state === "activity" ? "font-semibold text-[var(--foreground)]" : ""}`}
          >
            {channel.name}
          </span>
        )}
        {!collapsed && (channel.starred || attention.state !== "calm") && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {channel.starred && (
              <RiStarFill className="size-3 opacity-70" aria-label="Favori" />
            )}
            {attention.workingAgent && attention.workingSince ? (
              <span
                title={`${attention.workingAgent} actif`}
                className="channel-pill channel-pill--working"
              >
                {formatElapsed(attention.workingSince)}
                <span className="sr-only"> · {stateLabel}</span>
              </span>
            ) : attention.state !== "calm" ? (
              <span
                title={stateLabel}
                className={`channel-dot channel-dot--${attention.state} channel-dot--inline`}
              >
                <span className="sr-only">{stateLabel}</span>
              </span>
            ) : null}
          </span>
        )}
        {collapsed && attention.state !== "calm" && (
          <span
            aria-label={stateLabel}
            className={`channel-dot channel-dot--${attention.state} channel-dot--rail`}
          />
        )}
      </NavLink>
    );
  };

  const channelRow = (channel: Channel) => (
    <RowMenu
      key={channel.id}
      className="items-center"
      label={`# ${channel.name}`}
      items={channelMenuItems({
        onRename: () => setRenameTarget(channel),
        onMove: () => setMoveTarget(channel),
        onDelete: () => setDeleteTarget(channel),
      })}
    >
      {channelInboxLink(channel)}
    </RowMenu>
  );

  const addChannelRow = (
    categoryId: string | null,
    ref?: React.RefObject<HTMLButtonElement | null>,
  ) => (
    <button
      ref={ref}
      type="button"
      onClick={() => setDialogCategoryId(categoryId ?? channelCategories[0]?.id ?? null)}
      className="flex h-8 min-w-0 items-center gap-2 rounded-[8px] px-2 text-body-2-medium text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
    >
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-[var(--surface-raised)]">
        <RiAddLine className="size-3.5" aria-hidden="true" />
      </span>
      <span className="truncate">Ajouter un canal</span>
    </button>
  );

  const createDialog = (
    <CreateChannelDialog
      open={dialogCategoryId !== null}
      trigger={createTrigger}
      createChannel={actions.createChannel}
      categories={channelCategories}
      defaultCategoryId={dialogCategoryId ?? undefined}
      onClose={() => setDialogCategoryId(null)}
      onCreated={(id) => {
        setDialogCategoryId(null);
        navigate(orgPath(workspaceId, `/channels/${id}`));
      }}
    />
  );

  if (collapsed)
    return (
      <>
        <nav aria-label="Canaux" className="flex w-full flex-col gap-1">
          {/* The 32px rail carries neither section headers nor row menus: both
              would be unreadable, and every action stays one click away in the
              expanded panel. */}
          {visibleChannels.map((channel) => (
            <div key={channel.id}>{channelLink(channel)}</div>
          ))}
          <button
            ref={createTrigger}
            type="button"
            aria-label="Ajouter un canal"
            title="Ajouter un canal"
            onClick={() => setDialogCategoryId(channelCategories[0]?.id ?? null)}
            className="relative inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          >
            <RiAddLine className="size-4" />
          </button>
        </nav>
        {createDialog}
      </>
    );

  return (
    <>
      <div className="flex w-full flex-1 flex-col gap-0.5 pb-2">
        {/* The way in sits above the list, where the eye starts. */}
        {addChannelRow(null, createTrigger)}
        <nav aria-label="Canaux" className="flex w-full flex-col gap-0.5">
          {visibleChannels.length ? (
            visibleChannels.map((channel) => channelRow(channel))
          ) : (
            <p className="px-2 py-1 text-caption-1 text-[var(--text-tertiary)]">
              {query ? "Aucun canal ne correspond" : "Aucun canal"}
            </p>
          )}
        </nav>
      </div>
      {createDialog}
      <ChannelDialogs
        actions={actions}
        categories={channelCategories}
        channelMessageCounts={channelMessageCounts}
        renameTarget={renameTarget}
        deleteTarget={deleteTarget}
        moveTarget={moveTarget}
        createSectionOpen={createSectionOpen}
        focusAfterDelete={createTrigger}
        onCloseRename={() => setRenameTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onCloseMove={() => setMoveTarget(null)}
        onCloseCreateSection={() => setCreateSectionOpen(false)}
        onRequestCreateSection={() => setCreateSectionOpen(true)}
      />
    </>
  );
}

function PortalMenu({
  open,
  anchor,
  close,
  children,
  align = "bottom",
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  close: () => void;
  children: ReactNode;
  align?: "top" | "bottom";
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      // Keep in sync with the popover's own w-[265px].
      const width = 265;
      const left = Math.max(
        8,
        Math.min(rect.right + 8, window.innerWidth - width - 8),
      );
      const gap = 8;
      if (align === "top") {
        // Keep in sync with the popover's own max-h-[min(560px,calc(100dvh-16px))].
        const maxMenuHeight = Math.min(560, window.innerHeight - 16);
        setPosition({
          left,
          top: Math.max(
            8,
            Math.min(rect.top, window.innerHeight - 8 - maxMenuHeight),
          ),
        });
      } else
        setPosition({
          left,
          bottom: Math.max(
            8,
            Math.min(
              window.innerHeight - rect.bottom,
              window.innerHeight - 220 - gap,
            ),
          ),
        });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [align, anchor, open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!menu.current?.contains(node) && !anchor.current?.contains(node))
        close();
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor, close, open]);
  if (!open || !position) return null;
  return createPortal(
    <div
      ref={menu}
      role="dialog"
      className="boardui-popover fixed z-[130] w-[265px] max-w-[calc(100vw-32px)] overflow-x-hidden overflow-y-auto rounded-2xl border border-[var(--popover-line)] bg-[var(--popover)] p-2.5 shadow-[var(--shadow-dropdown)]"
      style={position}
    >
      {children}
    </div>,
    document.body,
  );
}

function ThemeToggle({
  collapsed,
  dark,
  setDark,
}: {
  collapsed: boolean;
  dark: boolean;
  setDark: (value: boolean, origin?: HTMLElement) => void;
}) {
  if (collapsed)
    return (
      <div className="group relative self-center">
        <button
          type="button"
          aria-pressed={dark}
          aria-label={`Activer le thème ${dark ? "clair" : "sombre"}`}
          onClick={(event) => setDark(!dark, event.currentTarget)}
          className="inline-flex size-11 items-center justify-center rounded-[10px] bg-transparent text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] lg:size-10"
        >
          {dark ? (
            <RiSunLine className="size-4" />
          ) : (
            <RiMoonLine className="size-4" />
          )}
        </button>
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-[var(--popover)] px-2 py-1 text-caption-1 font-medium text-[var(--foreground)] opacity-0 shadow-[var(--shadow-dropdown)] transition-opacity duration-100 group-hover:opacity-100">
          {`Activer le thème ${dark ? "clair" : "sombre"}`}
        </span>
      </div>
    );
  return (
    <div
      className="flex h-8 w-full items-center justify-between rounded-[8px] px-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
    >
      <span className="text-body-2-medium">Apparence</span>
      <div
        role="group"
        aria-label="Thème"
        className="relative inline-flex h-6 w-[52px] items-center gap-1 rounded-full bg-[var(--theme-toggle-background)] p-0.5"
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-[var(--theme-toggle-selected)] shadow-[var(--shadow-xs)] transition-transform duration-200 ease ${dark ? "translate-x-6" : "translate-x-0"}`}
        />
        <button
          type="button"
          aria-pressed={!dark}
          aria-label="Activer le thème clair"
          title="Thème clair"
          onClick={(event) => setDark(false, event.currentTarget)}
          className={`relative z-10 inline-flex size-5 items-center justify-center rounded-full transition-colors ${!dark ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
        >
          <RiSunLine className="size-3.5" />
        </button>
        <button
          type="button"
          aria-pressed={dark}
          aria-label="Activer le thème sombre"
          title="Thème sombre"
          onClick={(event) => setDark(true, event.currentTarget)}
          className={`relative z-10 inline-flex size-5 items-center justify-center rounded-full transition-colors ${dark ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
        >
          <RiMoonLine className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The popover has no trigger of its own: the user row at the sidebar foot opens it. */
/* BoardUI team menu: header, plain rows, labelled sections, hairline
   separators bleeding into the popover padding, version footer. */
function TeamMenu({
  workspace,
  workspaces,
  onWorkspaceChange,
  navigate,
  membersCount,
  open,
  anchor,
  close,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  onWorkspaceChange: (id: string) => void;
  navigate: (to: string) => void;
  membersCount: number;
  open: boolean;
  anchor: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
}) {
  const row = (
    label: string,
    Icon: typeof RiSettings4Line,
    to: string,
    badge?: number,
  ) => (
    <button
      type="button"
      key={label}
      onClick={() => {
        close();
        navigate(to);
      }}
      className="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="size-5 shrink-0 text-[var(--popover-muted)]" />
        <span className="truncate text-[14px] leading-5 font-medium text-[var(--foreground)]">
          {label}
        </span>
      </span>
      {badge !== undefined ? (
        <span className="inline-flex items-center justify-center rounded-[4px] bg-[var(--popover-line)] px-1 py-px text-[12px] leading-4 font-semibold whitespace-nowrap text-[var(--popover-muted)]">
          {badge}
        </span>
      ) : null}
    </button>
  );
  const divider = <div className="-mx-2.5 my-2.5 h-px bg-[var(--popover-line)]" />;
  const section = (
    label: string,
    rows: Array<[string, typeof RiSettings4Line, string]>,
  ) => (
    <div className="flex w-full flex-col gap-1.5 pt-1">
      <span className="px-2 text-[14px] leading-5 font-medium text-[var(--popover-muted)]">
        {label}
      </span>
      <div className="flex w-full flex-col gap-1">
        {rows.map(([label, Icon, to]) => row(label, Icon, to))}
      </div>
    </div>
  );
  return (
    <PortalMenu open={open} anchor={anchor} close={close}>
      <div className="flex max-h-[min(700px,calc(100dvh-16px))] w-full flex-col gap-[7px]">
        <div className="flex w-full items-center gap-2 px-2 pt-1">
          <span
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${workspaceToneClasses(workspace.tone)}`}
          >
            {workspace.short}
          </span>
          <div className="flex min-w-0 flex-col items-start justify-center">
            <span className="w-full truncate text-[14px] leading-5 font-medium text-[var(--foreground)]">
              {workspace.name}
            </span>
            <span className="w-full truncate text-[14px] leading-5 text-[var(--popover-muted)]">
              {workspace.description}
            </span>
          </div>
        </div>
        <div className="min-h-0 w-full overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-color:var(--popover-line)_transparent] [scrollbar-width:thin]">
          <div className="flex w-full flex-col gap-1">
            {row("Profil de l'espace", RiDashboardLine, "/inbox")}
            {row("Historique", RiFolderHistoryLine, "/history")}
            {row("Nouvelles tâches", RiTaskLine, "/tasks/new")}
            {row("Membres", RiGroupLine, "/members", membersCount)}
          </div>
          {workspaces.length > 1 ? (
            <>
              {divider}
              <div className="flex w-full flex-col gap-1.5 pt-1">
                <span className="px-2 text-[14px] leading-5 font-medium text-[var(--popover-muted)]">
                  Espaces
                </span>
                <div className="flex w-full flex-col gap-1">
                  {workspaces.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-pressed={candidate.id === workspace.id}
                      onClick={() => {
                        close();
                        onWorkspaceChange(candidate.id);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] ${candidate.id === workspace.id ? "bg-[var(--surface-hover)]" : ""}`}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] leading-[15px] font-semibold ${workspaceToneClasses(candidate.tone)}`}>
                          {candidate.short}
                        </span>
                        <span className="truncate text-[14px] leading-5 font-medium text-[var(--foreground)]">
                          {candidate.name}
                        </span>
                      </span>
                      {candidate.id === workspace.id ? (
                        <span className="inline-flex items-center justify-center rounded-[4px] bg-[var(--popover-line)] px-1 py-px text-[12px] leading-4 font-semibold whitespace-nowrap text-[var(--popover-muted)]">
                          Actif
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {divider}
          {section("Console", [
            ["Journal d'audit", RiFileSearchLine, "/audit"],
            ["Paramètres", RiSettings4Line, "/settings"],
          ])}
          {divider}
          {section("Personnel", [
            ["Notifications", RiNotification3Line, "/settings"],
            ["Profil opérateur", RiUser3Line, "/account"],
            ["Gérer les workspaces", RiCompass3Line, "/workspaces"],
          ])}
        </div>
        <div className="-mx-2.5 mt-1 h-px bg-[var(--popover-line)]" />
        <div className="flex w-full items-center justify-between px-2 pb-1 pt-1">
          <span className="text-[12px] leading-4 whitespace-nowrap text-[var(--text-tertiary)]">
            Hermes Console
          </span>
          <span className="inline-flex items-center justify-center rounded-[4px] bg-[var(--popover-line)] px-1 py-px text-[12px] leading-4 font-semibold whitespace-nowrap text-[var(--popover-muted)]">
            v0.0.1
          </span>
        </div>
      </div>
    </PortalMenu>
  );
}

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "H";

/* BoardUI avatar palette for the access list: neutral, then lime, then pink. */
const MEMBER_AVATAR_TONES = [
  "bg-[var(--surface-raised-hover)] text-[var(--muted-foreground)]",
  "bg-lime-200 text-lime-700",
  "bg-pink-200 text-pink-500",
];

/* BoardUI user menu: profile trigger up top, "users with access" popover. */
function UserMenu({
  profile,
  members,
  navigate,
}: {
  profile: Props["profile"];
  members: Member[];
  navigate: (to: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const routerNavigate = useNavigate();
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={profile.name}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex min-w-0 cursor-pointer items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 before:pointer-events-none before:absolute before:-inset-x-1.5 before:-inset-y-[5px] before:rounded-full before:border-2 before:border-transparent before:transition-colors before:duration-150 hover:before:border-[var(--surface-raised-hover)]"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-raised-hover)] text-center text-[16px] font-semibold text-[var(--muted-foreground)]">
          {initialsOf(profile.name)}
        </span>
        <span className="flex min-w-0 items-center overflow-hidden">
          <span className="flex items-center gap-0.5">
            <span className="truncate text-[14px] leading-5 font-medium whitespace-nowrap text-[var(--foreground)]">
              {profile.name}
            </span>
            <ChevronUpDownIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
          </span>
        </span>
      </button>
      <PortalMenu open={open} anchor={buttonRef} close={() => setOpen(false)} align="top">
        <div className="flex w-full flex-col gap-1.5 pt-[5px]">
          <span className="px-2 text-[14px] leading-5 font-medium text-[var(--popover-muted)]">
            Utilisateurs avec accès
          </span>
          <div className="flex w-full flex-col gap-1">
            {members.map((member, index) => (
              <button
                key={member.name}
                type="button"
                onClick={() => go("/members")}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
              >
                <span
                  className={`inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-center text-[10px] leading-[15px] font-semibold ${MEMBER_AVATAR_TONES[index % MEMBER_AVATAR_TONES.length]}`}
                >
                  {member.initials || initialsOf(member.name)}
                </span>
                <span className="truncate text-[14px] leading-5 font-medium text-[var(--foreground)]">
                  {member.name}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-2.5 my-3.5 h-px bg-[var(--popover-line)]" />
        <div className="flex w-full items-center gap-3 px-2 pb-2">
          <button
            type="button"
            onClick={() => go("/members")}
            className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-[var(--popover-line)] bg-[var(--card)] px-2 py-1.5 text-[14px] leading-5 font-medium whitespace-nowrap text-[var(--foreground)] shadow-[var(--shadow-xs)] transition-colors select-none hover:bg-[var(--surface-hover)] hover:border-[var(--surface-raised-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] outline-none"
          >
            <RiAddLine className="size-[18px] shrink-0" />
            <span className="inline-flex shrink-0 items-center justify-center px-0.5">
              Ajouter
            </span>
          </button>
          <button
            type="button"
            onClick={() => go("/members")}
            className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-[var(--popover-line)] bg-[var(--card)] px-2 py-1.5 text-[14px] leading-5 font-medium whitespace-nowrap text-[var(--foreground)] shadow-[var(--shadow-xs)] transition-colors select-none hover:bg-[var(--surface-hover)] hover:border-[var(--surface-raised-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] outline-none"
          >
            <ManageIcon className="size-[18px] shrink-0" />
            <span className="inline-flex shrink-0 items-center justify-center px-0.5">
              Gérer
            </span>
          </button>
        </div>
        <div className="-mx-2.5 mb-2 h-px bg-[var(--popover-line)]" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            useAuthStore.getState().logout();
            routerNavigate("/login", { replace: true });
          }}
          className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[14px] leading-5 font-medium text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
        >
          <RiLogoutBoxRLine className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          Se déconnecter
        </button>
      </PortalMenu>
    </>
  );
}

/* BoardUI theme toggle: pill track, sliding white knob, sun/moon pair. */
function ThemeSwitch({
  dark,
  setDark,
}: {
  dark: boolean;
  setDark: (value: boolean, origin?: HTMLElement) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Thème"
      className="relative inline-flex w-fit items-center gap-1 rounded-full bg-[var(--theme-toggle-background)] p-1"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1 left-1 size-8 rounded-full bg-[var(--theme-toggle-selected)] shadow-[var(--shadow-xs)] transition-transform duration-200 ${dark ? "translate-x-9" : "translate-x-0"}`}
      />
      <button
        type="button"
        aria-label="Activer le thème clair"
        aria-pressed={!dark}
        title="Thème clair"
        onClick={(event) => setDark(false, event.currentTarget)}
        className={`relative z-10 grid size-8 cursor-pointer place-items-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${dark ? "text-[var(--muted-foreground)] hover:text-[var(--foreground)]" : "text-[var(--foreground)]"}`}
      >
        <RiSunLine className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Activer le thème sombre"
        aria-pressed={dark}
        title="Thème sombre"
        onClick={(event) => setDark(true, event.currentTarget)}
        className={`relative z-10 grid size-8 cursor-pointer place-items-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${dark ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
      >
        <RiMoonLine className="size-4" />
      </button>
    </div>
  );
}

export function WorkspaceSidebar({
  workspaces,
  activeWorkspace,
  profile,
  onWorkspaceChange,
  members,
  pendingCount,
  collapsed,
  dark,
  setDark,
  channels,
  channelCategories,
  channelMessageCounts,
  channelActions,
  variant = "desktop",
}: Props) {
  const drawer = variant === "drawer";
  // A drawer is already narrow: collapsing the panel would only hide the labels.
  const railCollapsed = drawer ? false : collapsed;
  const navigate = useNavigate();
  const location = useLocation();
  const teamTriggerRef = useRef<HTMLButtonElement>(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const activeModule = moduleForPath(stripOrg(location.pathname));
  const workspaceRoute = (to: string) => orgPath(activeWorkspace.id, to);
  /* Live counters surfaced as BoardUI nav badges. */
  const navBadges: Record<string, number | undefined> = {
    "/inbox": pendingCount > 0 ? pendingCount : undefined,
  };
  const navRow = ({ label, to, icon: Icon }: NavEntry) => {
    const badge = navBadges[to];
    return (
      <NavLink
        key={to}
        to={workspaceRoute(to)}
        end={to === "/inbox"}
        className={({ isActive }) =>
          `flex w-full items-center justify-between overflow-hidden rounded-[10px] p-2 transition-colors ${isActive ? "bg-[image:var(--gradient-primary)] shadow-[var(--shadow-nav-selected)]" : "hover:bg-[var(--surface-hover)]"}`
        }
      >
        {({ isActive }) => (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <Icon
                className={`size-5 shrink-0 ${isActive ? "text-white" : "text-[var(--muted-foreground)]"}`}
              />
              <span
                className={`truncate text-[14px] leading-5 font-medium whitespace-nowrap ${isActive ? "text-white" : "text-[var(--muted-foreground)]"}`}
              >
                {label}
              </span>
            </span>
            {badge !== undefined ? (
              <span
                className={`inline-flex items-center justify-center rounded-[4px] px-1 py-px text-[12px] leading-4 font-semibold whitespace-nowrap ${isActive ? "bg-[var(--accent-400)] text-white" : "bg-[var(--surface-raised)] text-[var(--muted-foreground)]"}`}
              >
                {badge}
              </span>
            ) : null}
          </>
        )}
      </NavLink>
    );
  };
  const panel = (
    <div
      className={`workspace-sidebar-panel flex h-full bg-[var(--sidebar)] ${drawer ? "w-full" : ""}`}
    >
          <nav
            aria-label="Modules"
            className="flex w-12 shrink-0 flex-col items-center justify-between"
          >
            <div className="flex flex-col items-center gap-1">
              {MODULES.map((module) => {
                const active = module.id === activeModule;
                return (
                  <div key={module.id} className="group relative">
                    <button
                      type="button"
                      aria-label={module.label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => navigate(workspaceRoute(module.home))}
                      className={`inline-flex size-11 items-center justify-center rounded-[10px] transition-colors lg:size-10 ${active ? "bg-[var(--surface-raised)] text-[var(--foreground)] shadow-[var(--shadow-xs)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"}`}
                    >
                      <module.icon className="size-[18px]" />
                    </button>
                    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-[var(--popover)] px-2 py-1 text-caption-1 font-medium text-[var(--foreground)] opacity-0 shadow-[var(--shadow-dropdown)] transition-opacity duration-100 group-hover:opacity-100">
                      {module.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col items-center gap-2 pb-1">
              {/* The panel owns the theme switch when expanded; the rail keeps
                  one only while collapsed so the control never disappears. */}
              {railCollapsed ? (
                <ThemeToggle collapsed dark={dark} setDark={setDark} />
              ) : null}
            </div>
          </nav>

          <span
            aria-hidden
            className={`-my-2 shrink-0 self-stretch bg-[var(--border)] transition-[width,margin,opacity] duration-200 ${railCollapsed ? "mx-0 w-0 opacity-0" : "mx-2 w-px opacity-100"}`}
          />

          <div
            className={`overflow-hidden transition-[width] duration-200 ease-linear ${drawer ? "min-w-0 flex-1" : railCollapsed ? "w-0" : "w-60"}`}
          >
            <div
              className={`flex h-full flex-col justify-between py-2 pr-2 pl-2 ${drawer ? "w-full" : "w-60"}`}
            >
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex h-10 w-full shrink-0 items-center">
                  <UserMenu
                    profile={profile}
                    members={members}
                    navigate={(to) => navigate(workspaceRoute(to))}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Rechercher dans ${activeWorkspace.name}`}
                  onClick={() => window.dispatchEvent(new Event("hermes:open-search"))}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-full bg-[var(--surface-raised)] p-2 transition-colors hover:bg-[color-mix(in_srgb,var(--surface-raised-hover)_55%,transparent)]"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <RiSearchLine className="size-5 shrink-0 text-[var(--muted-foreground)]" />
                    <span className="truncate text-[14px] leading-5 font-medium whitespace-nowrap text-[var(--muted-foreground)]">
                      Rechercher
                    </span>
                  </span>
                  <kbd className="inline-flex items-center justify-center rounded-full bg-[var(--surface-raised-hover)] px-1 py-0.5 font-sans text-[12px] leading-4 font-semibold tracking-normal whitespace-nowrap text-[var(--muted-foreground)]">
                    ⌘L
                  </kbd>
                </button>
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  {activeModule === "console" && (
                    <nav className="flex w-full flex-col gap-1 pb-2">
                      {CONSOLE_NAV.map(navRow)}
                    </nav>
                  )}
                  {activeModule === "channels" && (
                    <ChannelsSection
                      key={activeWorkspace.id}
                      collapsed={false}
                      channels={channels}
                      channelCategories={channelCategories}
                      channelMessageCounts={channelMessageCounts}
                      actions={channelActions}
                      workspaceId={activeWorkspace.id}
                      query=""
                    />
                  )}
                  {activeModule === "lab" && (
                    <nav className="flex w-full flex-col gap-1 pb-2">
                      {LAB_NAV.map(navRow)}
                    </nav>
                  )}
                </div>
              </div>
              <div className="flex w-full flex-col gap-3 pt-3">
                <ThemeSwitch dark={dark} setDark={setDark} />
                <nav className="flex w-full flex-col gap-1">
                  {(drawer ? [...PINNED_NAV, ...MOBILE_NAV] : PINNED_NAV).map(
                    navRow,
                  )}
                </nav>
                <button
                  ref={teamTriggerRef}
                  type="button"
                  aria-label={`Espace ${activeWorkspace.name}`}
                  aria-haspopup="dialog"
                  aria-expanded={teamMenuOpen}
                  onClick={() => setTeamMenuOpen((value) => !value)}
                  className="flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-xl border-2 border-transparent bg-[var(--surface-raised)] py-2 pr-4 pl-2.5 text-left outline-none transition-colors hover:border-[var(--surface-raised-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-center text-[13px] font-semibold ${workspaceToneClasses(activeWorkspace.tone)}`}
                    >
                      {activeWorkspace.short}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col items-start justify-center">
                      <span className="w-full truncate text-[14px] leading-5 font-medium text-[var(--foreground)]">
                        {activeWorkspace.name}
                      </span>
                      <span className="w-full truncate text-[14px] leading-5 text-[var(--muted-foreground)]">
                        {activeWorkspace.description}
                      </span>
                    </span>
                  </span>
                  <span className="ml-2 flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--surface-raised-hover)]">
                    <ChevronDownSmallIcon
                      className={`size-4 text-[var(--muted-foreground)] transition-transform duration-200 ${teamMenuOpen ? "-scale-y-100" : ""}`}
                    />
                  </span>
                </button>
                <TeamMenu
                  workspace={activeWorkspace}
                  workspaces={workspaces}
                  onWorkspaceChange={onWorkspaceChange}
                  navigate={(to) => navigate(workspaceRoute(to))}
                  membersCount={members.length}
                  open={teamMenuOpen}
                  anchor={teamTriggerRef}
                  close={() => setTeamMenuOpen(false)}
                />
              </div>
            </div>
          </div>
    </div>
  );

  if (drawer) return panel;

  return (
    <>
      {/* Spacer: holds the content column in flow. The rail never leaves, only
          the 240px panel collapses, so the floor is 64px and not zero. */}
      <div
        aria-hidden
        className={`hidden shrink-0 transition-[width] duration-200 ease-linear lg:block ${railCollapsed ? "lg:w-16" : "lg:w-[321px]"}`}
      />
      <aside
        aria-label="Navigation workspace"
        className="fixed inset-y-0 left-0 z-50 hidden p-2 lg:flex"
      >
        {panel}
      </aside>
    </>
  );
}
