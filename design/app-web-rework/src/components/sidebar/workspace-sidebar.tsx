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
import { decodeChannelId } from "../mobile/mobile-nav";
import { useChannelReadCounts } from "../../state/channel-reads";
import {
  RiAddLine,
  RiArchiveLine,
  RiArrowDownSLine,
  RiExpandUpDownLine,
  RiCompass3Line,
  RiDashboardLine,
  RiFileSearchLine,
  RiFlowChart,
  RiFolderHistoryLine,
  RiLayout4Line,
  RiGroupLine,
  RiHashtag,
  RiMoonLine,
  RiSearchLine,
  RiSettings4Line,
  RiSideBarFill,
  RiStarFill,
  RiSunLine,
  RiTaskLine,
  RiUser3Line,
} from "@remixicon/react";

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
  members: Array<{
    name: string;
    role: string;
    state: string;
    initials: string;
  }>;
  onWorkspaceChange: (id: string) => void;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  dark: boolean;
  setDark: (value: boolean, origin?: HTMLElement) => void;
  channels: Array<{
    id: string;
    name: string;
    kind: "default" | "custom";
    starred?: boolean;
  }>;
  channelMessageCounts: Record<string, number>;
  createChannel: (name: string) => { id: string } | null;
};

const navigation = [
  { label: "File", to: "/inbox", icon: RiDashboardLine },
  { label: "Missions", to: "/missions", icon: RiFlowChart },
  { label: "Layout lab", to: "/layouts", icon: RiLayout4Line },
  { label: "Nouvelle tâche", to: "/tasks/new", icon: RiTaskLine },
  { label: "Historique", to: "/history", icon: RiFolderHistoryLine },
  { label: "Membres", to: "/members", icon: RiGroupLine },
  { label: "Registre", to: "/registry", icon: RiArchiveLine },
];

function Collapsible({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out ${collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-40 opacity-100 blur-0"}`}
    >
      {children}
    </span>
  );
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
  onClose,
  onCreated,
}: {
  open: boolean;
  trigger: React.RefObject<HTMLButtonElement | null>;
  createChannel: Props["createChannel"];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  const formId = useId();

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
      setError("Saisissez un nom de salon.");
      return;
    }
    if (!normalized) {
      setError("Utilisez au moins une lettre ou un chiffre.");
      return;
    }
    const channel = createChannel(name);
    if (!channel) {
      setError("Un salon portant ce nom existe déjà.");
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
      title="Créer un salon"
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
          Nom du salon
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
          placeholder="nom-du-salon"
          className={`mt-1.5 h-11 w-full rounded-[8px] border bg-[var(--card)] px-2.5 text-body-2-regular md:h-8 text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring)_25%,transparent)] ${error ? "border-[var(--state-neg-fg)]" : "border-[var(--border-control)]"}`}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-body-2-regular text-[var(--state-neg-fg)]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function ChannelsSection({
  collapsed,
  channels,
  channelMessageCounts,
  createChannel,
  workspaceId,
  query,
}: {
  collapsed: boolean;
  channels: Props["channels"];
  channelMessageCounts: Props["channelMessageCounts"];
  createChannel: Props["createChannel"];
  workspaceId: string;
  query: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(
        `hermes-channels-collapsed:${workspaceId}`,
      ) === "true";
    } catch {
      return false;
    }
  });
  const createTrigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const activeChannelId = decodeChannelId(location.pathname);
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
  const channelLinks = visibleChannels.map((channel) => {
    const unreadCount = unreadFor(channel.id);
    return (
      <NavLink
        key={channel.id}
        to={`/channels/${channel.id}?workspace=${workspaceId}`}
        onClick={() => markRead(channel.id)}
        title={collapsed ? `# ${channel.name}` : undefined}
        className={({ isActive }) =>
          collapsed
            ? `relative inline-flex size-8 items-center justify-center rounded-[8px] ${isActive ? "bg-[var(--surface-hover)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"}`
            : `flex h-8 items-center gap-2 rounded-[8px] px-2 text-body-2-medium ${isActive ? "bg-[var(--surface-hover)] font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"}`
        }
      >
        <RiHashtag className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{channel.name}</span>}
        {!collapsed && (channel.starred || unreadCount > 0) && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {channel.starred && (
              <RiStarFill className="size-3 opacity-70" aria-label="Favori" />
            )}
            {unreadCount > 0 && (
              <span
                aria-label={`${unreadCount} message(s) non lu(s)`}
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--surface-raised-hover)] px-1.5 text-[10px] font-semibold text-[var(--foreground)]"
              >
                {Math.min(99, unreadCount)}
              </span>
            )}
          </span>
        )}
        {collapsed && unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} message(s) non lu(s)`}
            className="absolute right-0.5 top-0.5 size-2 rounded-full bg-[var(--accent-400)] ring-2 ring-[var(--sidebar)]"
          />
        )}
      </NavLink>
    );
  });

  return (
    <>
      {collapsed ? (
        <nav aria-label="Salons" className="flex w-full flex-col gap-1">
          {channelLinks}
        </nav>
      ) : (
        <section className="group/channels flex w-full flex-col gap-0.5 pb-2" aria-label="Salons">
          <div className="flex h-6 items-center justify-between px-2">
            <button
              type="button"
              aria-expanded={!sectionCollapsed}
              onClick={() => {
                const next = !sectionCollapsed;
                setSectionCollapsed(next);
                try {
                  window.localStorage.setItem(
                    `hermes-channels-collapsed:${workspaceId}`,
                    String(next),
                  );
                } catch {
                  /* The section still collapses for the current session. */
                }
              }}
              className="flex min-w-0 items-center gap-1 rounded-md text-caption-1 font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <RiArrowDownSLine
                className={`size-3.5 transition-transform duration-200 ${sectionCollapsed ? "-rotate-90" : "rotate-0"}`}
              />
              <span>Salons</span>
            </button>
            <button
              ref={createTrigger}
              type="button"
              aria-label="Créer un salon"
              aria-haspopup="dialog"
              aria-expanded={dialogOpen}
              onClick={() => setDialogOpen(true)}
              className="inline-flex size-6 items-center justify-center rounded-[6px] text-[var(--muted-foreground)] opacity-100 transition-[opacity,background-color,color] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:opacity-0 md:group-hover/channels:opacity-100 md:focus-visible:opacity-100"
            >
              <RiAddLine className="size-3.5" />
            </button>
          </div>
          {!sectionCollapsed && channelLinks}
        </section>
      )}
      <CreateChannelDialog
        open={dialogOpen}
        trigger={createTrigger}
        createChannel={createChannel}
        onClose={() => setDialogOpen(false)}
        onCreated={(id) => {
          setDialogOpen(false);
          navigate(`/channels/${id}?workspace=${workspaceId}`);
        }}
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
      // Keep in sync with the popover's own w-[264px].
      const width = 264;
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
      className="boardui-popover fixed z-[130] w-[264px] max-w-[calc(100vw-32px)] overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--popover-line)] bg-[var(--popover)] p-2 shadow-[var(--shadow-dropdown)]"
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
      <button
        type="button"
        aria-pressed={dark}
        aria-label={`Activer le thème ${dark ? "clair" : "sombre"}`}
        title={`Activer le thème ${dark ? "clair" : "sombre"}`}
        onClick={(event) => setDark(!dark, event.currentTarget)}
        className="inline-flex size-8 self-center items-center justify-center rounded-[8px] bg-transparent text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      >
        {dark ? (
          <RiSunLine className="size-4" />
        ) : (
          <RiMoonLine className="size-4" />
        )}
      </button>
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

function WorkspaceMenu({
  workspace,
  workspaces,
  onWorkspaceChange,
  collapsed,
  navigate,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  onWorkspaceChange: (id: string) => void;
  collapsed: boolean;
  navigate: (to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const row = (label: string, Icon: typeof RiSettings4Line, to: string) => (
    <button
      type="button"
      key={label}
      onClick={() => {
        setOpen(false);
        navigate(to);
      }}
      className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
    >
      <Icon className="size-4 shrink-0 text-[var(--popover-muted)]" />
      <span className="min-w-0 flex-1 truncate text-body-2-regular text-[var(--foreground)]">
        {label}
      </span>
    </button>
  );
  const group = (
    label: string | undefined,
    rows: Array<[string, typeof RiSettings4Line, string]>,
    divider = false,
  ) => (
    <>
      {divider && (
        <div className="my-2.5 h-px w-full bg-[var(--popover-line)]" />
      )}
      <div className="flex w-full flex-col">
        {label && (
          <span className="px-2 pb-1 text-[12px] font-medium text-[var(--popover-muted)]">
            {label}
          </span>
        )}
        {rows.map(([label, Icon, to]) => row(label, Icon, to))}
      </div>
    </>
  );
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={`Espace ${workspace.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center overflow-hidden border-2 border-transparent outline-none transition-[width,background-color,border-color,padding] duration-300 ease-in-out hover:border-[var(--border-control)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 ${collapsed ? "size-8 justify-start rounded-full bg-transparent p-0" : "h-11 w-full justify-between rounded-[10px] bg-[var(--surface-hover)] py-1.5 pr-3 pl-2"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${workspace.tone} text-[10px] font-semibold text-white`}
          >
            {workspace.short}
          </span>
          <Collapsible collapsed={collapsed}>
            <span className="flex min-w-0 flex-col items-start justify-center">
              <span className="text-body-2-medium whitespace-nowrap text-[var(--foreground)]">
                {workspace.name}
              </span>
              <span className="whitespace-nowrap text-[11px] leading-[15px] text-[var(--muted-foreground)]">
                {workspace.description}
              </span>
            </span>
          </Collapsible>
        </span>
        <Collapsible collapsed={collapsed}>
          <RiExpandUpDownLine className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
        </Collapsible>
      </button>
      <PortalMenu
        open={open}
        anchor={anchor}
        close={() => setOpen(false)}
        align="top"
      >
        <div className="flex max-h-[min(560px,calc(100dvh-16px))] w-full flex-col">
          <div className="flex w-full items-center gap-2 px-2 pt-1">
            <span
              className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${workspace.tone} text-[10px] font-semibold text-white`}
            >
              {workspace.short}
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-start justify-center">
              <span className="w-full truncate text-body-2-medium text-[var(--foreground)]">
                {workspace.name}
              </span>
              <span className="w-full truncate text-[11px] leading-[15px] text-[var(--popover-muted)]">
                {workspace.description}
              </span>
            </div>
          </div>
          <div className="-mx-2 my-2.5 h-px bg-[var(--popover-line)]" />
          <div className="max-h-[min(420px,60vh)] w-full overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-color:var(--popover-line)_transparent] [scrollbar-width:thin]">
            {workspaces.length > 1 ? (
              <div className="flex w-full flex-col">
                <span className="px-2 pb-1 text-[12px] font-medium text-[var(--popover-muted)]">
                  Espaces
                </span>
                {workspaces.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={candidate.id === workspace.id}
                    onClick={() => {
                      setOpen(false);
                      onWorkspaceChange(candidate.id);
                    }}
                    className={`flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] ${candidate.id === workspace.id ? "bg-[var(--surface-hover)]" : ""}`}
                  >
                    <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${candidate.tone} text-[9px] font-semibold text-white`}>
                      {candidate.short}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body-2-regular text-[var(--foreground)]">{candidate.name}</span>
                    {candidate.id === workspace.id ? (
                      <span className="rounded-[4px] bg-[var(--popover-line)] px-1 py-px text-[10px] leading-4 font-semibold text-[var(--popover-muted)]">Actif</span>
                    ) : null}
                  </button>
                ))}
                <div className="my-2.5 h-px w-full bg-[var(--popover-line)]" />
              </div>
            ) : null}
            {group(undefined, [
              ["Profil de l'espace", RiDashboardLine, "/inbox"],
              ["Historique", RiFolderHistoryLine, "/history"],
              ["Nouvelles tâches", RiTaskLine, "/tasks/new"],
              ["Membres", RiGroupLine, "/members"],
            ])}
            {group(
              "Console",
              [
                ["Registre", RiArchiveLine, "/registry"],
                ["Journal d'audit", RiFileSearchLine, "/audit"],
                ["Paramètres", RiSettings4Line, "/settings"],
              ],
              true,
            )}
            {group(
              "Personnel",
              [
                ["Notifications", RiSettings4Line, "/settings"],
                ["Profil opérateur", RiUser3Line, "/account"],
                ["Gérer les workspaces", RiCompass3Line, "/workspaces"],
              ],
              true,
            )}
          </div>
          <div className="-mx-2 my-2.5 h-px bg-[var(--popover-line)]" />
          <div className="flex w-full items-center justify-between px-2 pb-1">
            <span className="text-[11px] whitespace-nowrap text-[var(--text-tertiary)]">
              Hermes Console
            </span>
            <span className="inline-flex items-center justify-center rounded-[4px] bg-[var(--popover-line)] px-1 py-px text-[10px] leading-[14px] font-medium whitespace-nowrap text-[var(--text-tertiary)]">
              v0.0.1
            </span>
          </div>
        </div>
      </PortalMenu>
    </>
  );
}

function UserMenu({
  collapsed,
  navigate,
  profile,
  members,
}: {
  collapsed: boolean;
  navigate: (to: string) => void;
  profile: Props["profile"];
  members: Props["members"];
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const initials =
    profile.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "H";
  const tones = [
    "bg-[var(--accent-300)] text-[var(--accent-700)]",
    "bg-[#d9f99d] text-[#3c6300]",
    "bg-[#fbcfe8] text-[#9d174d]",
  ];
  const users = members.slice(0, 3);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={profile.name}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`relative flex min-w-0 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 before:pointer-events-none before:absolute before:-inset-x-1.5 before:-inset-y-[5px] before:rounded-full before:border-2 before:border-transparent before:transition-colors before:duration-150 hover:before:border-[var(--border-control)] ${collapsed ? "pl-0.5" : ""}`}
      >
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-300)] text-[10px] font-semibold text-[var(--accent-700)]">
          {initials}
        </span>
        <Collapsible collapsed={collapsed}>
          <span className="flex items-center gap-0.5">
            <span className="text-body-2-medium whitespace-nowrap text-[var(--foreground)]">
              {profile.name}
            </span>
            <RiArrowDownSLine className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
          </span>
        </Collapsible>
      </button>
      <PortalMenu
        open={open}
        anchor={anchor}
        close={() => setOpen(false)}
        align="top"
      >
        <div className="flex w-full flex-col">
          <div className="flex w-full flex-col gap-1.5 pt-[5px]">
            <span className="px-2 text-[12px] font-medium text-[var(--muted-foreground)]">
              Utilisateurs avec accès
            </span>
            <div className="flex w-full flex-col gap-1">
              {users.map((user, index) => (
                <button
                  key={user.name}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(user.name === profile.name ? "/account" : "/members");
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]"
                >
                  <span
                    className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold ${tones[index]}`}
                  >
                    {user.initials}
                  </span>
                  <span className="truncate text-body-2-medium text-[var(--foreground)]">
                    {user.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="-mx-2 my-3.5 h-px bg-[var(--border-control)]" />
          <div className="flex w-full items-center gap-3 px-2 pb-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/members#add-member");
              }}
              className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-[8px] border border-[var(--border-control)] text-body-2-medium hover:bg-[var(--surface-hover)]"
            >
              <RiAddLine className="size-3.5" /> Ajouter
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/settings");
              }}
              className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-[8px] border border-[var(--border-control)] text-body-2-medium hover:bg-[var(--surface-hover)]"
            >
              <RiSettings4Line className="size-3.5" /> Gérer
            </button>
          </div>
        </div>
      </PortalMenu>
    </>
  );
}

export function WorkspaceSidebar({
  workspaces,
  activeWorkspace,
  profile,
  members,
  onWorkspaceChange,
  collapsed,
  onCollapsedChange,
  dark,
  setDark,
  channels,
  channelMessageCounts,
  createChannel,
}: Props) {
  const isCollapsed = collapsed;
  const navigate = useNavigate();
  const workspaceRoute = (to: string) => {
    const [path, hash] = to.split("#");
    return `${path}?workspace=${encodeURIComponent(activeWorkspace.id)}${hash ? `#${hash}` : ""}`;
  };
  const navRow = (label: string, to: string, Icon: typeof RiDashboardLine) =>
    (
      <NavLink
        key={to}
        to={workspaceRoute(to)}
        end={to === "/inbox"}
        title={isCollapsed ? label : undefined}
        className={({ isActive }) =>
          `flex h-8 items-center justify-between overflow-hidden rounded-[8px] px-2 transition-[width,background-color] duration-300 ease-in-out ${isCollapsed ? "w-8" : "w-full"} ${isActive ? "bg-[image:var(--gradient-primary)] text-[var(--accent-contrast)] shadow-[var(--shadow-nav-selected)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"}`
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0" />
          <Collapsible collapsed={isCollapsed}>
            <span className="text-body-2-medium whitespace-nowrap">{label}</span>
          </Collapsible>
        </span>
      </NavLink>
    );
  return (
    <>
      <aside
        aria-label="Navigation workspace"
        className={`relative z-50 hidden h-full shrink-0 md:sticky md:top-0 md:block md:h-full md:px-3 md:pt-12 md:pb-3 ${isCollapsed ? "md:w-[84px]" : "md:w-[284px]"}`}
      >
        <div
          className={`workspace-sidebar-panel flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl border border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-[var(--shadow-sidebar)] transition-[width,padding] duration-300 ease-in-out ${isCollapsed ? "px-[11px] py-3" : "p-3"}`}
        >
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <div
              className={`flex w-full transition-[gap] duration-300 ease-in-out ${isCollapsed ? "flex-col-reverse items-start justify-center gap-2.5" : "items-center justify-between"}`}
            >
              <UserMenu
                collapsed={isCollapsed}
                profile={profile}
                members={members}
                navigate={(to) => navigate(workspaceRoute(to))}
              />
              <button
                type="button"
                aria-label={isCollapsed ? "Développer la sidebar" : "Réduire la sidebar"}
                aria-expanded={!isCollapsed}
                title={isCollapsed ? "Développer la sidebar" : "Réduire la sidebar"}
                onClick={() => onCollapsedChange(!collapsed)}
                className={`hidden cursor-pointer text-[var(--muted-foreground)] transition-transform duration-300 ease-in-out hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] lg:inline-flex ${isCollapsed ? "size-8 items-center justify-center" : ""}`}
              >
                <RiSideBarFill
                  className={`size-4 transition-transform duration-300 ease-in-out ${!isCollapsed ? "-scale-x-100" : ""}`}
                />
              </button>
            </div>
            <button
              type="button"
              aria-label={`Rechercher dans ${activeWorkspace.name}`}
              title={isCollapsed ? "Quick Search" : undefined}
              onClick={() => window.dispatchEvent(new Event("hermes:open-search"))}
              className={`mt-2.5 flex h-8 items-center gap-2 rounded-full bg-[var(--control)] px-2 text-[var(--muted-foreground)] transition-[width,border-radius,background-color] duration-300 ease-in-out hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] ${isCollapsed ? "w-8" : "w-full"}`}
            >
              <span className={`flex min-w-0 items-center gap-2 ${!isCollapsed ? "flex-1" : ""}`}>
                <RiSearchLine className="size-4 shrink-0" />
                <Collapsible collapsed={isCollapsed}>
                  <span className="whitespace-nowrap text-body-2-medium">Quick Search</span>
                </Collapsible>
              </span>
              {!isCollapsed && (
                <kbd className="rounded-[4px] bg-[var(--surface-raised-hover)] px-1 text-caption-1 font-medium text-[var(--text-tertiary)]">
                  ⌘L
                </kbd>
              )}
            </button>
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-3 overscroll-contain">
              <nav className="flex w-full flex-col gap-1 pb-2">
                {navRow(navigation[0].label, navigation[0].to, navigation[0].icon)}
              </nav>
              <section className="flex w-full flex-col gap-1 pb-2" aria-label="Console">
                {!isCollapsed && <span className="flex h-6 items-center px-2 text-caption-1 font-medium text-[var(--muted-foreground)]">Console</span>}
                <nav className="flex w-full flex-col gap-1">
                  {navigation.slice(1).map((item) =>
                    navRow(item.label, item.to, item.icon),
                  )}
                </nav>
              </section>
              <ChannelsSection key={activeWorkspace.id} collapsed={isCollapsed} channels={channels} channelMessageCounts={channelMessageCounts} createChannel={createChannel} workspaceId={activeWorkspace.id} query="" />
            </div>
          </div>
          <div className="flex w-full flex-col gap-3">
            <ThemeToggle
              collapsed={isCollapsed}
              dark={dark}
              setDark={setDark}
            />
            <nav className="flex w-full flex-col gap-1">
              {navRow("Audit", "/audit", RiFileSearchLine)}
              {navRow("Réglages", "/settings", RiSettings4Line)}
            </nav>
            <WorkspaceMenu
              workspace={activeWorkspace}
              workspaces={workspaces}
              onWorkspaceChange={onWorkspaceChange}
              collapsed={isCollapsed}
              navigate={(to) => navigate(workspaceRoute(to))}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
