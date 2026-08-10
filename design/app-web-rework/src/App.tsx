import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import {
  CreateChannelDialog,
  WorkspaceSidebar,
  type Workspace,
} from "./components/sidebar/workspace-sidebar";
import { Modal, ModalButton } from "./components/ui/modal";
import { MobileHeader, MobileHeaderAction } from "./components/mobile/mobile-header";
import {
  decodeChannelId,
  resolveMobileStack,
  withWorkspace,
} from "./components/mobile/mobile-nav";
import { useAppHeight } from "./components/mobile/use-app-height";
import { useMediaQuery } from "./components/mobile/use-media-query";
import { useChannelReadCounts } from "./state/channel-reads";
import {
  applyUpdate,
  isStandalone,
  onInstallAvailability,
  onUpdateReady,
  promptInstall,
} from "./pwa";
import {
  SlackChannelView,
  type SlackChannelTab,
  type SlackDraft,
} from "./components/slack";
import {
  addAudit,
  canAccessChannel,
  createDefaultChannels,
  deleteChannelMessage,
  editChannelMessage,
  sendChannelMessage,
  setMessagePinned,
  toggleChannelStar,
  toggleMessageReaction,
  updateChannelInfo,
  updateChannelMembers,
  type AuditEvent,
  type Channel,
  type ChannelAttachment,
  type ChannelMessage,
  type ConsoleState,
  type InboxItem,
  type Member,
  type WorkspaceData,
  MAX_CHANNEL_ATTACHMENTS,
  MAX_CHANNEL_ATTACHMENT_BYTES,
  MAX_CHANNEL_ATTACHMENT_NAME_LENGTH,
  MAX_CHANNEL_ATTACHMENT_TYPE_LENGTH,
  MAX_CHANNEL_MESSAGE_LENGTH,
  loadConsoleState,
  readLocalPreference,
  saveConsoleState,
  writeLocalPreference,
} from "./state/console-store";
import {
  CheckCheckIcon,
  CircleHelpIcon,
  Clock3Icon,
  FilterIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SunIcon,
  UsersRoundIcon,
  ArrowLeftIcon,
  CheckIcon,
  BookOpenIcon,
  ActivityIcon,
  AlertTriangleIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  SparklesIcon,
  XIcon,
  BellIcon,
  BookmarkIcon,
  ArchiveIcon,
  ChevronRightIcon,
  CompassIcon,
  DownloadIcon,
  FileSearchIcon,
  HashIcon,
  HistoryIcon,
  InboxIcon,
  InfoIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  RefreshCwIcon,
  Settings2Icon,
  StarIcon,
} from "lucide-react";

type Filter = "all" | "decisions" | "agents";

const QUICK_REACTIONS = ["👍", "🎉", "👀", "✅"];

type AppModel = {
  items: InboxItem[];
  dark: boolean;
  collapsed: boolean;
  notify: (message: string) => void;
  setDark: (value: boolean, origin?: HTMLElement) => void;
  setCollapsed: (value: boolean) => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  setWorkspace: (id: string) => void;
  addTask: (
    title: string,
    context: string,
    preview: string,
    agent: string,
  ) => InboxItem;
  resolveItem: (id: string) => void;
  markAllRead: () => void;
  enabledSkills: string[];
  toggleSkill: (skill: string) => void;
  members: Member[];
  selectedMember: string;
  selectMember: (name: string) => void;
  auditEvents: AuditEvent[];
  addMember: (name: string, role: string) => boolean;
  notifications: boolean;
  setNotifications: (value: boolean) => void;
  profile: { name: string; role: string };
  saveProfile: (name: string, role: string) => void;
  createWorkspace: (name: string, description: string) => Workspace | null;
  archiveWorkspace: (id: string) => void;
  restoreWorkspace: (id: string) => void;
  archivedWorkspaces: Workspace[];
  channels: Channel[];
  createChannel: (name: string) => Channel | null;
  messagesFor: (channelId: string) => ChannelMessage[];
  sendMessage: (
    channelId: string,
    body: string,
    attachments?: ChannelAttachment[],
    parentMessageId?: string,
    broadcastToChannel?: boolean,
  ) => boolean;
  toggleReaction: (channelId: string, messageId: string, emoji: string) => void;
  togglePin: (channelId: string, messageId: string) => void;
  editMessage: (channelId: string, messageId: string, body: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  toggleStar: (channelId: string) => void;
  saveChannelInfo: (
    channelId: string,
    patch: { topic?: string; description?: string; isPrivate?: boolean },
  ) => void;
};

const AppContext = createContext<AppModel | null>(null);
const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used in the application shell");
  return context;
};

const routeMeta: Record<string, { label: string; subtitle: string }> = {
  "/menu": { label: "Menu", subtitle: "Toutes les vues de la console" },
  "/inbox": { label: "File", subtitle: "Éléments à traiter" },
  "/channels": { label: "Salons", subtitle: "Discussions locales de l'espace" },
  "/tasks/new": {
    label: "Nouvelle tâche",
    subtitle: "Lancer une mission avec une intention vérifiable",
  },
  "/history": {
    label: "Historique",
    subtitle: "Exécutions et décisions récentes",
  },
  "/members": {
    label: "Membres",
    subtitle: "Équipe opérateur et agents disponibles",
  },
  "/registry": {
    label: "Registre",
    subtitle: "Compétences activées dans le runtime",
  },
  "/audit": {
    label: "Audit",
    subtitle: "Journal des décisions et changements",
  },
  "/settings": {
    label: "Réglages",
    subtitle: "Préférences locales de cette console",
  },
  "/account": {
    label: "Profil opérateur",
    subtitle: "Identité et notifications",
  },
  "/workspaces": { label: "Workspaces", subtitle: "Espaces locaux et accès" },
};

export default function App() {
  const location = useLocation();
  const [consoleState, setConsoleState] =
    useState<ConsoleState>(loadConsoleState);
  const [toast, setToast] = useState("");
  const [updateReady, setUpdateReady] = useState(false);
  const [dark, setDarkState] = useState(
    () => readLocalPreference("boardui:theme") === "dark",
  );
  const [collapsed, setCollapsedState] = useState(() => {
    const stored = readLocalPreference("hermes-sidebar-collapsed");
    return (
      stored === "true" ||
      (!stored &&
        window.matchMedia("(min-width: 768px) and (max-width: 1023px)").matches)
    );
  });
  const notify = (message: string) => setToast(message);
  const requestedWorkspaceId = new URLSearchParams(location.search).get(
    "workspace",
  );
  const effectiveWorkspaceId = consoleState.workspaces.some(
    (workspace) => workspace.id === requestedWorkspaceId,
  )
    ? requestedWorkspaceId
    : consoleState.activeWorkspaceId;
  const activeWorkspace =
    consoleState.workspaces.find(
      (workspace) => workspace.id === effectiveWorkspaceId,
    ) ?? consoleState.workspaces[0];
  const workspaceData = activeWorkspace
    ? consoleState.workspaceData[activeWorkspace.id]
    : undefined;
  const updateWorkspaceData = (
    callback: (data: WorkspaceData) => WorkspaceData,
  ) =>
    setConsoleState((current) => {
      const id = activeWorkspace.id;
      const data = current.workspaceData[id];
      if (!data) return current;
      return {
        ...current,
        workspaceData: { ...current.workspaceData, [id]: callback(data) },
      };
    });
  const setDark = (value: boolean, origin?: HTMLElement) => {
    const apply = () => flushSync(() => setDarkState(value));
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const documentWithTransition = document as Document & {
      startViewTransition?: (callback: () => void) => {
        finished: Promise<void>;
      };
    };
    if (documentWithTransition.startViewTransition && !reduceMotion) {
      const rect = origin?.getBoundingClientRect();
      const x = Math.round(
        rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      );
      const y = Math.round(
        rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      );
      const radius = Math.ceil(
        Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        ),
      );
      const style = document.createElement("style");
      style.textContent = `::view-transition-old(root){animation:none;mix-blend-mode:normal}::view-transition-new(root){animation:hermes-theme-reveal 820ms cubic-bezier(.2,.8,.2,1) both;mix-blend-mode:normal}@keyframes hermes-theme-reveal{from{clip-path:circle(0 at ${x}px ${y}px)}to{clip-path:circle(${radius}px at ${x}px ${y}px)}}`;
      document.head.append(style);
      document.documentElement.classList.add("theme-transitioning");
      documentWithTransition.startViewTransition(apply).finished.finally(() => {
        style.remove();
        document.documentElement.classList.remove("theme-transitioning");
      });
    } else {
      document.documentElement.classList.add("theme-transitioning");
      apply();
      window.setTimeout(
        () => document.documentElement.classList.remove("theme-transitioning"),
        820,
      );
    }
  };
  const setCollapsed = (value: boolean) => setCollapsedState(value);
  const setWorkspace = (id: string) =>
    setConsoleState((current) =>
      current.workspaces.some((workspace) => workspace.id === id)
        ? { ...current, activeWorkspaceId: id }
        : current,
    );
  const addTask = (
    title: string,
    context: string,
    preview: string,
    agent: string,
  ) => {
    const item = {
      id: `task-${Date.now()}`,
      category: "in_progress" as const,
      gate: null,
      title,
      context,
      agent,
      age: "à l'instant",
      tone: "accent" as const,
      preview,
    };
    updateWorkspaceData((data) =>
      addAudit(
        { ...data, items: [item, ...data.items] },
        `Mission créée : ${title}`,
      ),
    );
    return item;
  };
  const resolveItem = (id: string) =>
    updateWorkspaceData((data) => {
      const target = data.items.find((item) => item.id === id);
      if (!target || (target.category === "agent_activity" && target.read))
        return data;
      return addAudit(
        {
          ...data,
          items: data.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  category: "agent_activity",
                  tone: "info",
                  gate: null,
                  context: `${item.context} · terminé`,
                  age: "traité à l'instant",
                  read: true,
                }
              : item,
          ),
        },
        "Élément marqué comme traité",
      );
    });
  const markAllRead = () =>
    updateWorkspaceData((data) =>
      addAudit(
        { ...data, items: data.items.map((item) => ({ ...item, read: true })) },
        "Tous les éléments ont été marqués comme lus",
      ),
    );
  const toggleSkill = (skill: string) =>
    updateWorkspaceData((data) => {
      const enabled = data.enabledSkills.includes(skill);
      return addAudit(
        {
          ...data,
          enabledSkills: enabled
            ? data.enabledSkills.filter((entry) => entry !== skill)
            : [...data.enabledSkills, skill],
        },
        `${skill} ${enabled ? "désactivée" : "activée"}`,
      );
    });
  const selectMember = (name: string) =>
    updateWorkspaceData((data) => ({ ...data, selectedMember: name }));
  const addMember = (name: string, role: string) => {
    const cleanedName = name.trim();
    const cleanedRole = role.trim();
    if (
      cleanedName.length < 2 ||
      cleanedRole.length < 2 ||
      workspaceData?.members.some(
        (member) =>
          member.name.toLocaleLowerCase() === cleanedName.toLocaleLowerCase(),
      )
    )
      return false;
    const member: Member = {
      name: cleanedName,
      role: cleanedRole,
      state: "Invité",
      initials: cleanedName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };
    updateWorkspaceData((data) =>
      addAudit(
        {
          ...data,
          members: [...data.members, member],
          selectedMember: member.name,
        },
        `Accès ajouté pour ${member.name}`,
      ),
    );
    return true;
  };
  const setNotifications = (value: boolean) =>
    updateWorkspaceData((data) =>
      addAudit(
        { ...data, notifications: value },
        `Notifications ${value ? "activées" : "désactivées"}`,
      ),
    );
  const saveProfile = (name: string, role: string) =>
    setConsoleState((current) => {
      const previousName = current.profile.name;
      const initials = name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const workspaceData = Object.fromEntries(
        Object.entries(current.workspaceData).map(([id, data]) => [
          id,
          {
            ...data,
            members: data.members.map((member) =>
              member.name === previousName
                ? { ...member, name, role, initials }
                : member,
            ),
            channels: data.channels.map((channel) => ({
              ...channel,
              memberNames: channel.memberNames.map((memberName) =>
                memberName === previousName ? name : memberName,
              ),
            })),
            selectedMember:
              data.selectedMember === previousName ? name : data.selectedMember,
          },
        ]),
      );
      return { ...current, profile: { name, role }, workspaceData };
    });
  const createWorkspace = (name: string, description: string) => {
    const cleanedName = name.trim();
    if (cleanedName.length < 3) return null;
    const id = `${cleanedName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    const workspace: Workspace = {
      id,
      name: cleanedName,
      description: description.trim() || "Espace local",
      short: cleanedName.slice(0, 2).toUpperCase(),
      tone: "bg-[#8b5cf6]",
    };
    setConsoleState((current) => ({
      ...current,
      activeWorkspaceId: id,
      workspaces: [...current.workspaces, workspace],
      workspaceData: {
        ...current.workspaceData,
        [id]: {
          items: [],
          members: [
            {
              name: current.profile.name,
              role: current.profile.role,
              state: "En ligne",
              initials: current.profile.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
            },
          ],
          enabledSkills: [],
          audit: [
            {
              id: `audit-${Date.now()}`,
              level: "info",
              label: "Workspace créé localement",
              time: "à l'instant",
            },
          ],
          notifications: true,
          selectedMember: current.profile.name,
          channels: createDefaultChannels([current.profile.name]),
          messages: { general: [], "équipe": [], incidents: [] },
        },
      },
    }));
    return workspace;
  };
  const archiveWorkspace = (id: string) =>
    setConsoleState((current) => {
      if (current.workspaces.length < 2) return current;
      const workspace = current.workspaces.find((entry) => entry.id === id);
      if (!workspace) return current;
      const next = current.workspaces.filter((entry) => entry.id !== id);
      if (next.length === 0) return current;
      return {
        ...current,
        workspaces: next,
        archivedWorkspaces: [...current.archivedWorkspaces, workspace],
        activeWorkspaceId:
          current.activeWorkspaceId === id
            ? next[0].id
            : current.activeWorkspaceId,
      };
    });
  const restoreWorkspace = (id: string) =>
    setConsoleState((current) => {
      const workspace = current.archivedWorkspaces.find(
        (entry) => entry.id === id,
      );
      return workspace
        ? {
            ...current,
            workspaces: [...current.workspaces, workspace],
            archivedWorkspaces: current.archivedWorkspaces.filter(
              (entry) => entry.id !== id,
            ),
          }
        : current;
    });
  const createChannel = (name: string) => {
    const normalized = name.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (
      !normalized ||
      !workspaceData ||
      workspaceData.channels.some(
        (channel) =>
          channel.id === normalized ||
          channel.name
            .toLocaleLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") === normalized,
      )
    )
      return null;
    const channel: Channel = {
      id: normalized,
      name: normalized,
      kind: "custom",
      createdAt: new Date().toISOString(),
      topic: "",
      description: "",
      starred: false,
      isPrivate: false,
      memberNames: workspaceData.members.map((member) => member.name),
      pinnedMessageIds: [],
    };
    updateWorkspaceData((data) => addAudit({ ...data, channels: [...data.channels, channel], messages: { ...data.messages, [channel.id]: [] } }, `Salon #${channel.name} créé`));
    return channel;
  };
  const sendMessage = (
    channelId: string,
    body: string,
    attachments: ChannelAttachment[] = [],
    parentMessageId?: string,
    broadcastToChannel = false,
  ) => {
    const message = body.trim();
    if (
      (!message && attachments.length === 0) ||
      message.length > MAX_CHANNEL_MESSAGE_LENGTH ||
      attachments.length > MAX_CHANNEL_ATTACHMENTS ||
      !workspaceData?.channels.some((channel) => channel.id === channelId)
    )
      return false;
    updateWorkspaceData((data) =>
      sendChannelMessage(data, {
        id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channelId,
        author: consoleState.profile.name,
        body: message,
        createdAt: new Date().toISOString(),
        reactions: [],
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(parentMessageId ? { parentMessageId, broadcastToChannel } : {}),
      }) ?? data,
    );
    return true;
  };
  const toggleReaction = (channelId: string, messageId: string, emoji: string) =>
    updateWorkspaceData(
      (data) =>
        toggleMessageReaction(
          data,
          channelId,
          messageId,
          emoji,
          consoleState.profile.name,
        ) ?? data,
    );
  const togglePin = (channelId: string, messageId: string) =>
    updateWorkspaceData((data) => {
      const channel = data.channels.find((entry) => entry.id === channelId);
      if (!channel) return data;
      return (
        setMessagePinned(
          data,
          channelId,
          messageId,
          !channel.pinnedMessageIds.includes(messageId),
        ) ?? data
      );
    });
  const editMessage = (channelId: string, messageId: string, body: string) =>
    updateWorkspaceData(
      (data) =>
        editChannelMessage(
          data,
          channelId,
          messageId,
          consoleState.profile.name,
          body,
          new Date().toISOString(),
        ) ?? data,
    );
  const deleteMessage = (channelId: string, messageId: string) =>
    updateWorkspaceData(
      (data) =>
        deleteChannelMessage(
          data,
          channelId,
          messageId,
          consoleState.profile.name,
        ) ?? data,
    );
  const toggleStar = (channelId: string) =>
    updateWorkspaceData((data) => toggleChannelStar(data, channelId) ?? data);
  const saveChannelInfo: AppModel["saveChannelInfo"] = (channelId, patch) =>
    updateWorkspaceData((data) => {
      const next = updateChannelInfo(data, channelId, patch);
      if (!next) return data;
      const channel = next.channels.find((entry) => entry.id === channelId);
      if (
        !channel?.isPrivate ||
        channel.memberNames.includes(consoleState.profile.name)
      )
        return next;
      return (
        updateChannelMembers(next, channelId, [
          ...channel.memberNames,
          consoleState.profile.name,
        ]) ?? next
      );
    });

  useEffect(() => {
    if (
      !requestedWorkspaceId ||
      requestedWorkspaceId === consoleState.activeWorkspaceId ||
      !consoleState.workspaces.some(
        (workspace) => workspace.id === requestedWorkspaceId,
      )
    )
      return;
    setConsoleState((current) => ({
      ...current,
      activeWorkspaceId: requestedWorkspaceId,
    }));
  }, [
    consoleState.activeWorkspaceId,
    consoleState.workspaces,
    requestedWorkspaceId,
  ]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    writeLocalPreference("boardui:theme", dark ? "dark" : "light");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#121212" : "#f3f3f4");
  }, [dark]);
  useEffect(() => {
    writeLocalPreference("hermes-sidebar-collapsed", String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    saveConsoleState(consoleState);
  }, [consoleState]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);

  if (!activeWorkspace || !workspaceData) return null;
  const accessibleChannels = workspaceData.channels.filter(
    (channel) => canAccessChannel(channel, consoleState.profile.name),
  );
  return (
    <AppContext.Provider
      value={{
        items: workspaceData.items,
        dark,
        collapsed,
        notify,
        setDark,
        setCollapsed,
        workspaces: consoleState.workspaces,
        activeWorkspace,
        setWorkspace,
        addTask,
        resolveItem,
        markAllRead,
        enabledSkills: workspaceData.enabledSkills,
        toggleSkill,
        members: workspaceData.members,
        selectedMember: workspaceData.selectedMember,
        selectMember,
        addMember,
        auditEvents: workspaceData.audit,
        notifications: workspaceData.notifications,
        setNotifications,
        profile: consoleState.profile,
        saveProfile,
        createWorkspace,
        archiveWorkspace,
        restoreWorkspace,
        archivedWorkspaces: consoleState.archivedWorkspaces,
        channels: accessibleChannels,
        createChannel,
        messagesFor: (channelId) => workspaceData.messages[channelId] ?? [],
        sendMessage,
        toggleReaction,
        togglePin,
        editMessage,
        deleteMessage,
        toggleStar,
        saveChannelInfo,
      }}
    >
      <Shell />
      {toast && (
        <div
          role="status"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[120] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-center text-sm text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
        >
          {toast}
        </div>
      )}
      {updateReady && (
        <div
          role="status"
          className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[140] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[var(--border-control)] bg-[var(--card)] px-4 py-3 shadow-[var(--shadow-elevated)]"
        >
          <RefreshCwIcon className="size-4 shrink-0 text-[var(--accent-600)]" />
          <span className="min-w-0 flex-1 text-body-1 text-[var(--foreground)]">
            Nouvelle version disponible
          </span>
          <button
            type="button"
            onClick={applyUpdate}
            className="inline-flex min-h-9 shrink-0 items-center rounded-[9px] bg-[image:var(--gradient-primary)] px-3 text-body-2-medium text-[var(--accent-contrast)] shadow-[var(--shadow-btn-primary)]"
          >
            Recharger
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-[var(--border-button)] bg-[var(--card)] px-1 font-sans text-[10px] font-medium text-[var(--muted-foreground)] shadow-[var(--shadow-xs)]">
      {children}
    </kbd>
  );
}

const searchSuggestions = ["/inbox", "/tasks/new", "/history"].map((to) => ({
  id: `suggestion-${to}`,
  label: routeMeta[to].label,
  to,
}));

function GlobalSearch() {
  const { activeWorkspace, channels, items, messagesFor } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const needle = query.trim().toLocaleLowerCase();
  const results = useMemo(() => {
    if (!needle) return [];
    const navigation = Object.entries(routeMeta)
      .filter(([, meta]) =>
        `${meta.label} ${meta.subtitle}`.toLocaleLowerCase().includes(needle),
      )
      .map(([to, meta]) => ({
        id: `route-${to}`,
        label: meta.label,
        detail: meta.subtitle,
        to,
        kind: "Navigation",
      }));
    const channelResults = channels
      .filter((channel) =>
        `${channel.name} ${channel.topic ?? ""} ${channel.description ?? ""}`
          .toLocaleLowerCase()
          .includes(needle),
      )
      .map((channel) => ({
        id: `channel-${channel.id}`,
        label: `# ${channel.name}`,
        detail: channel.topic || "Salon",
        to: `/channels/${encodeURIComponent(channel.id)}`,
        kind: "Salons",
      }));
    const taskResults = items
      .filter((item) =>
        `${item.title} ${item.context} ${item.preview}`
          .toLocaleLowerCase()
          .includes(needle),
      )
      .map((item) => ({
        id: `item-${item.id}`,
        label: item.title,
        detail: item.context,
        to: `/inbox/${encodeURIComponent(item.id)}`,
        kind: "File",
      }));
    const messageResults = channels.flatMap((channel) =>
      messagesFor(channel.id)
        .filter((message) =>
          `${message.author} ${message.body}`.toLocaleLowerCase().includes(needle),
        )
        .map((message) => ({
          id: `message-${message.id}`,
          label: message.body || "Pièce jointe",
          detail: `${message.author} dans #${channel.name}`,
          to: `/channels/${encodeURIComponent(channel.id)}?thread=${encodeURIComponent(message.parentMessageId || message.id)}`,
          kind: "Messages",
        })),
    );
    return [...navigation, ...channelResults, ...taskResults, ...messageResults].slice(0, 10);
  }, [channels, items, messagesFor, needle]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        triggerRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    const openChannelSearch = () => {
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setOpen(true);
    };
    window.addEventListener("hermes:open-search", openChannelSearch);
    return () =>
      window.removeEventListener("hermes:open-search", openChannelSearch);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || dialogRef.current?.contains(document.activeElement))
        return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [open]);

  const choose = (to: string) => {
    const [pathname, ownSearch] = to.split("?");
    const search = new URLSearchParams(ownSearch ?? "");
    search.set("workspace", activeWorkspace.id);
    navigate({ pathname, search: `?${search.toString()}` });
    close();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/50 md:items-center md:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Rechercher dans ${activeWorkspace.name}`}
        className="flex h-full w-full flex-col overflow-hidden border-[var(--border-control)] bg-[var(--surface)] pt-[env(safe-area-inset-top)] shadow-[var(--shadow-elevated)] md:h-auto md:max-w-xl md:rounded-2xl md:border md:pt-0"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 md:h-10">
          <SearchIcon className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          <input
            ref={inputRef}
            data-cmdk-input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const first = needle ? results[0] : searchSuggestions[0];
              if (first) choose(first.to);
            }}
            aria-label={`Rechercher dans ${activeWorkspace.name}`}
            placeholder="Rechercher une vue, un salon ou une mission…"
            className="h-full min-w-0 flex-1 bg-transparent text-body-1 text-[var(--foreground)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <button type="button" aria-label="Fermer la recherche" onClick={close} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] md:size-7">
            <XIcon className="size-5 md:size-4" />
          </button>
        </div>
        <div className="mx-2 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--card)] shadow-[var(--shadow-xs)] md:block md:flex-none">
          <div className="w-full overflow-y-auto overscroll-contain py-1 md:max-h-[min(420px,60dvh)]">
            {!needle ? (
              <>
                <p className="px-4 pt-2.5 pb-1 text-caption-1 text-[var(--muted-foreground)]">Suggestions</p>
                {searchSuggestions.map((suggestion) => (
                  <button key={suggestion.id} type="button" onClick={() => choose(suggestion.to)} className="flex h-11 w-full items-center px-3 text-left text-body-2 text-[var(--foreground)] hover:bg-[var(--surface-hover)] md:h-8">
                    {suggestion.label}
                  </button>
                ))}
              </>
            ) : results.length ? (
              <>
                <p className="px-4 pt-2.5 pb-1 text-caption-1 text-[var(--muted-foreground)]">Résultats</p>
                {results.map((result) => (
                  <button key={result.id} type="button" onClick={() => choose(result.to)} className="flex h-11 w-full items-center gap-3 px-3 text-left hover:bg-[var(--surface-hover)] md:h-8">
                    <span className="min-w-0 flex-1 truncate text-body-2 text-[var(--foreground)]">{result.label}</span>
                    <span className="shrink-0 text-caption-1 text-[var(--muted-foreground)]">{result.kind}</span>
                  </button>
                ))}
              </>
            ) : (
              <p className="px-4 py-8 text-center text-body-2 text-[var(--muted-foreground)]">Aucun résultat</p>
            )}
          </div>
        </div>
        <footer className="hidden items-center justify-between px-4 py-2.5 text-caption-1 text-[var(--muted-foreground)] md:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            naviguer
            <Kbd>↵</Kbd>
            sélectionner
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>ESC</Kbd>
            fermer
          </span>
        </footer>
      </div>
    </div>
  );
}

function Shell() {
  const {
    collapsed,
    setCollapsed,
    dark,
    setDark,
    workspaces,
    activeWorkspace,
    setWorkspace,
    profile,
    members,
    channels,
    messagesFor,
    createChannel,
    items,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  useAppHeight();
  // Below 1024px the sidebar always shows as a rail: the 284px panel would eat
  // the content column. The stored preference only rules from lg up.
  const railOnly = useMediaQuery("(max-width: 1023px)");
  const sidebarCollapsed = collapsed || railOnly;
  const pathname = location.pathname.startsWith("/inbox/")
    ? "/inbox"
    : location.pathname;
  const channelId = decodeChannelId(location.pathname);
  const channel = channels.find((entry) => entry.id === channelId);
  const detailItem = location.pathname.startsWith("/inbox/")
    ? items.find(
        (entry) => entry.id === decodeURIComponent(location.pathname.split("/")[2] ?? ""),
      )
    : undefined;
  const meta = channel ? { label: `# ${channel.name}`, subtitle: "Discussion locale de l'espace" } : routeMeta[pathname] ?? {
    label: "Introuvable",
    subtitle: "Cette vue n'existe pas",
  };
  const stack = resolveMobileStack({
    pathname: location.pathname,
    search: location.search,
    workspaceId: activeWorkspace.id,
    channelName: channel?.name,
    itemTitle: detailItem?.title,
  });
  const openSearch = () => window.dispatchEvent(new Event("hermes:open-search"));
  const openChannelDetails = () => {
    const next = new URLSearchParams(location.search);
    next.set("workspace", activeWorkspace.id);
    next.delete("tab");
    next.delete("thread");
    next.set("details", "1");
    navigate({ pathname: location.pathname, search: `?${next.toString()}` });
  };
  const params = new URLSearchParams(location.search);
  const inChannelPanel =
    Boolean(params.get("thread")) || params.get("details") === "1";
  const mobileActions =
    channel && !inChannelPanel ? (
      <>
        <MobileHeaderAction label="Rechercher" onClick={openSearch}>
          <SearchIcon className="size-4" />
        </MobileHeaderAction>
        <MobileHeaderAction label="Informations du salon" onClick={openChannelDetails}>
          <InfoIcon className="size-4" />
        </MobileHeaderAction>
      </>
    ) : pathname === "/inbox" ? (
      <>
        <MobileHeaderAction label="Rechercher" onClick={openSearch}>
          <SearchIcon className="size-4" />
        </MobileHeaderAction>
        <MobileHeaderAction
          label="Nouvelle tâche"
          onClick={() => navigate(withWorkspace("/tasks/new", activeWorkspace.id))}
        >
          <PlusIcon className="size-4" />
        </MobileHeaderAction>
      </>
    ) : null;
  useEffect(() => {
    document.title = `Hermes Console — ${meta.label}`;
  }, [meta.label]);
  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const requestedWorkspace = search.get("workspace");
    if (
      requestedWorkspace &&
      workspaces.some((workspace) => workspace.id === requestedWorkspace)
    ) {
      if (requestedWorkspace !== activeWorkspace.id)
        setWorkspace(requestedWorkspace);
      return;
    }
    search.set("workspace", activeWorkspace.id);
    navigate(
      { pathname: location.pathname, search: `?${search.toString()}` },
      { replace: true },
    );
  }, [
    activeWorkspace.id,
    location.pathname,
    location.search,
    navigate,
    setWorkspace,
    workspaces,
  ]);
  const changeWorkspace = (id: string) => {
    setWorkspace(id);
    const search = new URLSearchParams(location.search);
    search.set("workspace", id);
    navigate({
      pathname: location.pathname.startsWith("/channels/")
        ? "/channels/general"
        : location.pathname,
      search: `?${search.toString()}`,
    });
  };
  return (
    <div className="app-shell flex w-full overflow-hidden bg-[var(--surface-sunken)]">
      <GlobalSearch />
      <ProductTopbar activeWorkspace={activeWorkspace} />
      <WorkspaceSidebar
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        profile={profile}
        members={members}
        onWorkspaceChange={changeWorkspace}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setCollapsed}
        dark={dark}
        setDark={setDark}
        channels={channels}
        channelMessageCounts={Object.fromEntries(
          channels.map((entry) => [entry.id, messagesFor(entry.id).length]),
        )}
        createChannel={createChannel}
      />
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--panel)] transition-[margin,border-radius,box-shadow] duration-200 ease-out md:mt-12 md:mr-2 md:mb-2 md:overflow-hidden md:rounded-xl md:shadow-[var(--shadow-card)] ${sidebarCollapsed ? "md:ml-2" : ""}`}>
        <MobileHeader stack={stack} actions={mobileActions} />
        {!channel && (
          <header className="sticky top-0 z-30 hidden h-10 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)]/95 px-3 backdrop-blur-sm md:flex lg:px-4">
            <div className="flex min-w-0 items-center gap-2.5 text-body-2 text-[var(--muted-foreground)]">
              <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--foreground)]">
                {meta.label}
              </h1>
              <span aria-hidden className="hidden h-4 w-px bg-[var(--border)] sm:block" />
              <p className="hidden truncate text-[12px] text-[var(--muted-foreground)] sm:block">
                {activeWorkspace.name} · {meta.subtitle}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full bg-[var(--state-info)] px-2.5 py-1 text-caption-1 font-medium text-[var(--state-info-fg)] sm:inline-flex">
                  <ShieldCheckIcon className="size-3.5" /> Opérateur
                </span>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/tasks/new?workspace=${activeWorkspace.id}`)
                  }
                  className="inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-[image:var(--gradient-primary)] px-2.5 text-body-2 font-medium text-[var(--accent-contrast)] shadow-[var(--shadow-btn-primary)] hover:bg-[image:var(--gradient-primary-hover)]"
                >
                  <PlusIcon className="size-4" />
                  <span className="hidden sm:inline">Nouvelle tâche</span>
                  <span className="sm:hidden">Tâche</span>
                </button>
            </div>
          </header>
        )}
        <main
          className={`flex min-h-0 flex-1 flex-col ${channel ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
        >
          <div
            className={
              channel
                ? "flex min-h-0 flex-1 flex-col"
                : "w-full p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:p-4"
            }
          >
            <Outlet key={activeWorkspace.id} />
          </div>
        </main>
      </div>
    </div>
  );
}

function ProductTopbar({ activeWorkspace }: { activeWorkspace: Workspace }) {
  const navigate = useNavigate();
  const location = useLocation();
  const inChannels = location.pathname.startsWith("/channels/");
  const route = (path: string) => `${path}?workspace=${encodeURIComponent(activeWorkspace.id)}`;
  const moduleButton = (active: boolean) =>
    `inline-flex h-6 items-center rounded-[6px] px-2 text-[12px] font-medium transition-colors ${active ? "bg-[var(--control-active)] text-[var(--foreground)] shadow-[var(--shadow-xs)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`;
  return (
    <header className="fixed top-0 right-0 left-0 z-[70] hidden h-10 items-center gap-3 bg-[var(--surface-sunken)] px-3 md:flex lg:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          aria-label="Accueil Hermes"
          onClick={() => navigate(route("/inbox"))}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent-500)] text-[10px] font-semibold text-white shadow-[var(--shadow-xs)]"
        >
          H
        </button>
        <span className="hidden truncate text-[13px] font-semibold tracking-[-0.02em] text-[var(--foreground)] lg:inline">Hermes Console</span>
        <div className="inline-flex rounded-[8px] bg-[var(--control)] p-0.5">
          <button type="button" onClick={() => navigate(route("/inbox"))} className={moduleButton(!inChannels)}>Console</button>
          <button type="button" onClick={() => navigate(route("/channels/general"))} className={moduleButton(inChannels)}>Salons</button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("hermes:open-search"))}
        aria-label="Rechercher"
        className="flex h-7 w-56 items-center gap-2 rounded-[8px] border border-[var(--border-control)] bg-[var(--panel)] px-2.5 text-[12px] text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      >
        <SearchIcon className="size-3.5" />
        <span>Rechercher...</span>
        <kbd className="ml-auto rounded border border-[var(--border)] bg-[var(--control)] px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      <div className="flex flex-1 items-center justify-end gap-2">
        <button type="button" aria-label="Notifications" onClick={() => navigate(route("/settings"))} className="inline-flex size-7 items-center justify-center rounded-[8px] border border-[var(--border-control)] bg-[var(--panel)] text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
          <BellIcon className="size-4" />
        </button>
        <button type="button" aria-label="Éléments enregistrés" onClick={() => navigate(route("/history"))} className="inline-flex size-7 items-center justify-center rounded-[8px] border border-[var(--border-control)] bg-[var(--panel)] text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
          <BookmarkIcon className="size-4" />
        </button>
      </div>
    </header>
  );
}

function Status({ item }: { item: InboxItem }) {
  const state = status(item);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-caption-1 font-medium ${state.classes}`}
    >
      {state.label}
    </span>
  );
}
function status(item: InboxItem) {
  if (item.tone === "warn")
    return {
      label: "Décision",
      classes: "bg-[var(--state-warn)] text-[var(--state-warn-fg)]",
      dot: "bg-[#f0b100]",
    };
  if (item.tone === "neg")
    return {
      label: "Bloqué",
      classes: "bg-[var(--state-neg)] text-[var(--state-neg-fg)]",
      dot: "bg-[#e7000b]",
    };
  if (item.tone === "info")
    return {
      label: "Activité",
      classes: "bg-[var(--state-info)] text-[var(--state-info-fg)]",
      dot: "bg-[var(--accent-500)]",
    };
  if (item.tone === "accent")
    return {
      label: "En cours",
      classes: "bg-[var(--state-info-soft)] text-[var(--state-info-fg)]",
      dot: "bg-[var(--accent-500)]",
    };
  return {
    label: "Brouillon",
    classes: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    dot: "bg-[#a1a1a1]",
  };
}
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--card)] shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </section>
  );
}
function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "secondary" | "primary";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-body-2 font-medium shadow-[var(--shadow-xs)] disabled:cursor-not-allowed disabled:opacity-60 md:min-h-8 md:px-2 ${variant === "primary" ? "bg-[image:var(--gradient-primary)] text-[var(--accent-contrast)] shadow-[var(--shadow-btn-primary)]" : "border border-[var(--border-control)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}
    >
      {children}
    </button>
  );
}
function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { dark, setDark } = useApp();
  const next = dark ? "clair" : "sombre";
  const option = (active: boolean) =>
    `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors ${active ? "bg-[var(--theme-toggle-selected)] text-[var(--foreground)] shadow-[var(--shadow-xs)]" : ""}`;
  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label={`Activer le thème ${next}`}
      title={`Activer le thème ${next}`}
      onClick={() => setDark(!dark)}
      className={`group inline-flex min-h-11 items-center border border-[var(--border-control)] bg-[var(--theme-toggle-background)] p-1 text-body-2 text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] ${compact ? "size-11 self-center justify-center rounded-xl" : "w-full justify-between rounded-xl"}`}
    >
      {compact ? (
        <span className={option(dark)}>
          {dark ? (
            <MoonIcon className="size-4" />
          ) : (
            <SunIcon className="size-4" />
          )}
        </span>
      ) : (
        <>
          <span className={option(!dark)}>
            <SunIcon className="size-4" /> Clair
          </span>
          <span className={option(dark)}>
            <MoonIcon className="size-4" /> Sombre
          </span>
        </>
      )}
    </button>
  );
}

function MenuRow({
  icon: Icon,
  label,
  detail,
  badge,
  onClick,
}: {
  icon: typeof InboxIcon;
  label: string;
  detail?: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="mobile-row">
      <span className="mobile-row__icon">
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <span className="mobile-row__body">
        <span className="mobile-row__title">{label}</span>
        {detail ? <span className="mobile-row__detail">{detail}</span> : null}
      </span>
      {badge ? <span className="mobile-badge">{Math.min(99, badge)}</span> : null}
      <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
    </button>
  );
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mobile-group" aria-label={label}>
      <h2 className="mobile-group__label">{label}</h2>
      <div className="mobile-list">{children}</div>
    </section>
  );
}

/** Root of the mobile stack: every module hangs off this screen. */
export function MenuPage() {
  const {
    activeWorkspace,
    profile,
    items,
    channels,
    messagesFor,
    dark,
    setDark,
    notify,
  } = useApp();
  const navigate = useNavigate();
  const [installable, setInstallable] = useState(false);
  const go = (to: string) => navigate(withWorkspace(to, activeWorkspace.id));
  const messageCounts = Object.fromEntries(
    channels.map((channel) => [channel.id, messagesFor(channel.id).length]),
  );
  const { unreadFor } = useChannelReadCounts(
    activeWorkspace.id,
    messageCounts,
    null,
  );
  const unreadChannels = channels.reduce(
    (total, channel) => total + unreadFor(channel.id),
    0,
  );
  const pending = items.filter((item) => !item.read).length;

  useEffect(() => onInstallAvailability(setInstallable), []);

  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      <section className="mobile-list">
        <button
          type="button"
          onClick={() => go("/workspaces")}
          className="mobile-row"
        >
          <span
            className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${activeWorkspace.tone} text-[9px] font-semibold text-white`}
          >
            {activeWorkspace.short}
          </span>
          <span className="mobile-row__body">
            <span className="mobile-row__title">{activeWorkspace.name}</span>
            <span className="mobile-row__detail">
              {activeWorkspace.description}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
        </button>
        <MenuRow
          icon={SearchIcon}
          label="Rechercher"
          detail="Vues, salons, missions et messages"
          onClick={() => window.dispatchEvent(new Event("hermes:open-search"))}
        />
      </section>

      <MenuGroup label="Travail">
        <MenuRow
          icon={InboxIcon}
          label="File"
          detail="Éléments à traiter"
          badge={pending}
          onClick={() => go("/inbox")}
        />
        <MenuRow
          icon={ListChecksIcon}
          label="Nouvelle tâche"
          detail="Lancer une mission vérifiable"
          onClick={() => go("/tasks/new")}
        />
        <MenuRow
          icon={HistoryIcon}
          label="Historique"
          detail="Exécutions et décisions récentes"
          onClick={() => go("/history")}
        />
      </MenuGroup>

      <MenuGroup label="Collaboration">
        <MenuRow
          icon={MessagesSquareIcon}
          label="Salons"
          detail={`${channels.length} salon${channels.length > 1 ? "s" : ""} dans cet espace`}
          badge={unreadChannels}
          onClick={() => go("/channels")}
        />
        <MenuRow
          icon={UsersRoundIcon}
          label="Membres"
          detail="Équipe opérateur et agents"
          onClick={() => go("/members")}
        />
      </MenuGroup>

      <MenuGroup label="Console">
        <MenuRow
          icon={ArchiveIcon}
          label="Registre"
          detail="Compétences activées"
          onClick={() => go("/registry")}
        />
        <MenuRow
          icon={FileSearchIcon}
          label="Journal d'audit"
          detail="Décisions et changements"
          onClick={() => go("/audit")}
        />
        <MenuRow
          icon={Settings2Icon}
          label="Réglages"
          detail="Préférences locales"
          onClick={() => go("/settings")}
        />
      </MenuGroup>

      <MenuGroup label="Personnel">
        <MenuRow
          icon={UserRoundIcon}
          label="Profil opérateur"
          detail={`${profile.name} · ${profile.role}`}
          onClick={() => go("/account")}
        />
        <MenuRow
          icon={CompassIcon}
          label="Gérer les workspaces"
          detail="Espaces locaux et accès"
          onClick={() => go("/workspaces")}
        />
        <div className="mobile-row">
          <span className="mobile-row__icon">
            {dark ? (
              <MoonIcon className="size-4" strokeWidth={1.9} />
            ) : (
              <SunIcon className="size-4" strokeWidth={1.9} />
            )}
          </span>
          <span className="mobile-row__body">
            <span className="mobile-row__title">Apparence</span>
            <span className="mobile-row__detail">
              Thème {dark ? "sombre" : "clair"}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Activer le thème sombre"
            onClick={(event) => setDark(!dark, event.currentTarget)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${dark ? "bg-[var(--accent-600)]" : "bg-[var(--input)]"}`}
          >
            <span
              className={`absolute top-1/2 left-1 size-6 -translate-y-1/2 rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform ${dark ? "translate-x-6" : "translate-x-0"}`}
            />
          </button>
        </div>
      </MenuGroup>

      {installable || isStandalone() ? (
        <MenuGroup label="Application">
          {installable ? (
            <MenuRow
              icon={DownloadIcon}
              label="Installer l'application"
              detail="Ajouter Hermes à l'écran d'accueil"
              onClick={async () => {
                const outcome = await promptInstall();
                if (outcome === "accepted") notify("Hermes Console installée");
                else if (outcome === "dismissed") notify("Installation annulée");
              }}
            />
          ) : (
            <div className="mobile-row">
              <span className="mobile-row__icon">
                <CheckIcon className="size-4" strokeWidth={1.9} />
              </span>
              <span className="mobile-row__body">
                <span className="mobile-row__title">Application installée</span>
                <span className="mobile-row__detail">
                  Lancée en mode autonome sur cet appareil
                </span>
              </span>
            </div>
          )}
        </MenuGroup>
      ) : null}

      <p className="pb-1 text-center text-caption-1 text-[var(--text-tertiary)]">
        Hermes Console · v0.0.1 · données locales à ce navigateur
      </p>
    </div>
  );
}

/** Channel directory: the mobile replacement for the sidebar channel list. */
export function ChannelsPage() {
  const { channels, messagesFor, activeWorkspace, createChannel } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const messageCounts = Object.fromEntries(
    channels.map((channel) => [channel.id, messagesFor(channel.id).length]),
  );
  const { unreadFor, markRead } = useChannelReadCounts(
    activeWorkspace.id,
    messageCounts,
    null,
  );
  const needle = query.trim().toLocaleLowerCase();
  const visible = [...channels]
    .filter((channel) =>
      !needle ||
      `${channel.name} ${channel.topic ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    )
    .sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)));

  const open = (channelId: string) => {
    markRead(channelId);
    navigate(
      withWorkspace(`/channels/${encodeURIComponent(channelId)}`, activeWorkspace.id),
    );
  };

  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      <label className="flex h-11 items-center gap-2 rounded-[8px] border border-[var(--border-control)] bg-[var(--card)] px-2 text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] focus-within:border-[var(--ring)] md:h-8">
        <SearchIcon className="size-4 shrink-0" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Rechercher un salon"
          placeholder="Rechercher un salon"
          className="min-w-0 flex-1 bg-transparent text-body-1 text-[var(--foreground)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </label>

      <section className="mobile-list" aria-label="Salons">
        {visible.map((channel) => {
          const messages = messagesFor(channel.id);
          const last = messages[messages.length - 1];
          const unread = unreadFor(channel.id);
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => open(channel.id)}
              className="mobile-row"
            >
              <span className="mobile-row__icon">
                <HashIcon className="size-4" strokeWidth={1.9} />
              </span>
              <span className="mobile-row__body">
                <span className="mobile-row__title">
                  {channel.name}
                  {channel.starred ? (
                    <StarIcon
                      aria-label="Favori"
                      className="ml-1.5 inline size-3 align-[-1px] text-[var(--text-tertiary)]"
                      fill="currentColor"
                    />
                  ) : null}
                </span>
                <span className="mobile-row__detail">
                  {last
                    ? `${last.author} : ${last.body || "pièce jointe"}`
                    : channel.topic || "Aucun message"}
                </span>
              </span>
              {unread > 0 ? (
                <span className="mobile-badge">{Math.min(99, unread)}</span>
              ) : null}
              <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
            </button>
          );
        })}
        {!visible.length && (
          <p className="px-4 py-8 text-center text-body-1 text-[var(--muted-foreground)]">
            Aucun salon ne correspond à cette recherche.
          </p>
        )}
      </section>

      <section className="mobile-list">
        <button
          ref={createTrigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          onClick={() => setDialogOpen(true)}
          className="mobile-row"
        >
          <span className="mobile-row__icon">
            <PlusIcon className="size-4" strokeWidth={1.9} />
          </span>
          <span className="mobile-row__body">
            <span className="mobile-row__title">Créer un salon</span>
            <span className="mobile-row__detail">
              Organiser les échanges autour d'un sujet
            </span>
          </span>
        </button>
      </section>

      <CreateChannelDialog
        open={dialogOpen}
        trigger={createTrigger}
        createChannel={createChannel}
        onClose={() => setDialogOpen(false)}
        onCreated={(id) => {
          setDialogOpen(false);
          navigate(withWorkspace(`/channels/${id}`, activeWorkspace.id));
        }}
      />
    </div>
  );
}

export function InboxPage() {
  const { items, notify, markAllRead, activeWorkspace } = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const allRead = items.length > 0 && items.every((item) => item.read);
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === "all" ||
            (filter === "decisions" &&
              (item.category === "needs_action" ||
                item.category === "failure")) ||
            (filter === "agents" && item.category === "agent_activity")) &&
          `${item.title} ${item.context} ${item.agent ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, filter, query],
  );
  const stats = [
    [
      "À décider",
      items.filter((item) => item.tone === "warn").length,
      CircleHelpIcon,
      "text-[var(--state-warn-fg)]",
    ],
    [
      "Bloqués",
      items.filter((item) => item.tone === "neg").length,
      ShieldCheckIcon,
      "text-[var(--state-neg-fg)]",
    ],
    [
      "En cours",
      items.filter((item) => item.tone === "accent").length,
      Clock3Icon,
      "text-[var(--state-info-fg)]",
    ],
    [
      "Activité agents",
      items.filter((item) => item.tone === "info").length,
      UsersRoundIcon,
      "text-[var(--foreground)]",
    ],
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Résumé de la file"
        className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4"
      >
        {stats.map(([label, value, Icon, color]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-[10px] bg-[var(--surface)] p-2.5"
          >
            <Icon className={`size-4 ${color}`} strokeWidth={1.75} />
            <p className="text-body-2 text-[var(--muted-foreground)]">{label}</p>
            <p className="text-headline-semibold tracking-tight tabular-nums text-[var(--foreground)]">
              {value}
            </p>
          </div>
        ))}
      </section>
      <Card>
        <div className="flex flex-col gap-2 border-b border-[var(--border)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--foreground)]">
              Éléments de la file
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {visible.length} sur {items.length} éléments affichés
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-[var(--input)] bg-[var(--card)] px-2 text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] focus-within:border-[var(--ring)] sm:h-8 sm:flex-none">
              <SearchIcon className="size-4 shrink-0" />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher"
                aria-label="Rechercher dans la file"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)] sm:w-44 sm:flex-none"
              />
            </label>
            <Button
              disabled={items.length === 0 || allRead}
              onClick={() => {
                markAllRead();
                notify(`${items.length} éléments marqués comme lus`);
              }}
            >
              <CheckCheckIcon className="size-4" />
              {items.length === 0 ? "File vide" : allRead ? "Tout est lu" : "Tout marquer comme lu"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Filtres de la file"
            className="inline-grid grid-cols-3 rounded-[10px] bg-[var(--control)] p-0.5"
          >
            {(
              [
                ["all", "Tout"],
                ["decisions", "Décisions"],
                ["agents", "Fil agents"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs ${filter === key ? "bg-[var(--control-active)] font-medium text-[var(--foreground)] shadow-[var(--shadow-xs)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <FilterIcon className="size-3.5" /> Filtre actif :{" "}
            {filter === "all"
              ? "tous"
              : filter === "decisions"
                ? "décisions"
                : "agents"}
          </span>
        </div>
        {/* Phones get cards: a 720px-wide table would force a sideways scroll. */}
        <div className="md:hidden">
          {visible.map((item) => {
            const state = status(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  navigate(`/inbox/${item.id}?workspace=${activeWorkspace.id}`)
                }
                className="mobile-card"
              >
                <span className={`mobile-card__dot ${state.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="mobile-card__title block">{item.title}</span>
                  <span className="mobile-card__context block">
                    {item.context}
                  </span>
                  <span className="mobile-card__footer">
                    <Status item={item} />
                    <span className="text-caption-1 text-[var(--muted-foreground)]">
                      {item.agent ? `@${item.agent}` : "Non assigné"}
                    </span>
                    <span className="text-caption-1 text-[var(--text-tertiary)]">
                      {item.age}
                    </span>
                  </span>
                </span>
                <ChevronRightIcon className="mt-1 size-4 shrink-0 text-[var(--text-tertiary)]" />
              </button>
            );
          })}
        </div>
        {/* `relative` keeps the sr-only cell inside this scroller: absolutely
            positioned children escape an unpositioned overflow container and
            would stretch the document sideways. */}
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2.5">Élément</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Assigné à</th>
                <th className="px-3 py-2.5">Âge</th>
                <th className="w-10 px-3 py-2.5">
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.map((item) => {
                const state = status(item);
                return (
                  <tr
                    key={item.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--accent)]"
                    onClick={() =>
                      navigate(
                        `/inbox/${item.id}?workspace=${activeWorkspace.id}`,
                      )
                    }
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`size-2 shrink-0 rounded-full ${state.dot}`}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="max-w-[31rem] truncate font-medium text-[var(--foreground)]">
                            {item.title}
                          </span>
                          <span className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                            {item.context}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Status item={item} />
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted-foreground)]">
                      {item.agent ? `@${item.agent}` : "Non assigné"}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted-foreground)]">
                      {item.age}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        aria-label={`Ouvrir ${item.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(
                            `/inbox/${item.id}?workspace=${activeWorkspace.id}`,
                          );
                        }}
                        className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
            Aucun élément ne correspond à cette recherche.
          </p>
        )}
      </Card>
    </div>
  );
}

export function InboxDetailPage() {
  const { itemId } = useParams();
  const { items, resolveItem, notify, activeWorkspace } = useApp();
  const navigate = useNavigate();
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return <NotFound />;
  const resolved = item.category === "agent_activity" && item.read;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(
        `${item.title}\n${item.context}\n${item.preview}`,
      );
      notify("Contexte copié dans le presse-papiers");
    } catch {
      notify("Contexte prêt à être copié");
    }
  };
  return (
    <div className="mx-auto max-w-4xl">
      <Button
        onClick={() => navigate(`/inbox?workspace=${activeWorkspace.id}`)}
      >
        <ArrowLeftIcon className="size-4" /> Retour à la file
      </Button>
      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Status item={item} />
            <h2 className="mt-2.5 text-[14px] font-semibold tracking-tight text-[var(--foreground)]">
              {item.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              {item.preview}
            </p>
          </div>
          <ActivityIcon className="mt-1 size-5 shrink-0 text-[var(--accent-500)]" />
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="rounded-full bg-[var(--muted)] px-2.5 py-1">
            {item.context}
          </span>
          <span className="rounded-full bg-[var(--muted)] px-2.5 py-1">
            {item.age}
          </span>
          {item.gate && (
            <span className="rounded-full bg-[var(--state-warn)] px-2.5 py-1 text-[var(--state-warn-fg)]">
              Porte {item.gate}
            </span>
          )}
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={resolved}
            onClick={() => {
              resolveItem(item.id);
              notify("Élément marqué comme traité");
            }}
          >
            <CheckIcon className="size-4" /> {resolved ? "Traité" : "Marquer traité"}
          </Button>
          <Button onClick={copy}>Copier le contexte</Button>
        </div>
      </Card>
    </div>
  );
}

export function TaskPage() {
  const { addTask, notify, activeWorkspace } = useApp();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [context, setContext] = useState(
    activeWorkspace.name.toLocaleLowerCase(),
  );
  const [preview, setPreview] = useState("");
  const [agent, setAgent] = useState("hermes");
  const [error, setError] = useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 4 || preview.trim().length < 12) {
      setError(
        "Donne un titre de 4 caractères et une intention de 12 caractères minimum.",
      );
      return;
    }
    const item = addTask(
      title.trim(),
      context.trim() || "sans contexte",
      preview.trim(),
      agent,
    );
    notify("Mission ajoutée à la file");
    navigate(`/inbox/${item.id}?workspace=${activeWorkspace.id}`);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <form onSubmit={submit} className="grid gap-5 p-5 sm:p-6">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
              Définir une nouvelle mission
            </h2>
            <p className="mt-1 text-body-1 text-[var(--muted-foreground)]">
              L'élément est ajouté à la file puis ouvre sa vue de suivi.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--state-neg)] px-3 py-2 text-body-1 text-[var(--state-neg-fg)]"
            >
              {error}
            </p>
          )}
          <Field label="Titre">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="next"
              placeholder="Ex. Vérifier la migration des factures"
              className="control"
            />
          </Field>
          <Field label="Contexte">
            <input
              value={context}
              onChange={(event) => setContext(event.target.value)}
              className="control"
            />
          </Field>
          <Field label="Agent">
            <select
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
              className="control"
            >
              <option value="hermes">hermes</option>
              <option value="obiwan">obiwan</option>
              <option value="padawan">padawan</option>
            </select>
          </Field>
          <Field label="Intention et résultat attendu">
            <textarea
              value={preview}
              onChange={(event) => setPreview(event.target.value)}
              rows={5}
              placeholder="Décris ce qui doit être vérifié, produit ou décidé…"
              className="control resize-y"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => navigate(`/inbox?workspace=${activeWorkspace.id}`)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              <PlusIcon className="size-4" /> Créer la mission
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-[12px] font-medium text-[var(--foreground)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ChannelPage() {
  const { channelId } = useParams();
  const {
    channels,
    messagesFor,
    sendMessage,
    toggleReaction,
    togglePin,
    editMessage,
    deleteMessage,
    toggleStar,
    saveChannelInfo,
    activeWorkspace,
    profile,
    notify,
    collapsed,
    setCollapsed,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const channel = channels.find((entry) => entry.id === channelId);
  const messages = channel ? messagesFor(channel.id) : [];
  const search = new URLSearchParams(location.search);
  const requestedTab = search.get("tab");
  const activeTab: SlackChannelTab =
    requestedTab === "files" || requestedTab === "pins"
      ? requestedTab
      : "messages";
  const activeThreadId = search.get("thread");
  const showDetails = !activeThreadId && search.get("details") === "1";
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actionTriggerRef = useRef<HTMLElement | null>(null);
  const actionMessage = messages.find(
    (message) => message.id === actionMessageId,
  );
  const closeActions = () => {
    setActionMessageId(null);
    setConfirmDelete(false);
    requestAnimationFrame(() => actionTriggerRef.current?.focus());
  };

  useEffect(() => {
    setActionMessageId(null);
    setConfirmDelete(false);
  }, [channelId]);

  const updateQuery = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(location.search);
    next.set("workspace", activeWorkspace.id);
    mutate(next);
    navigate({ pathname: location.pathname, search: `?${next.toString()}` });
  };

  const toAttachments = (files: File[]): ChannelAttachment[] => {
    const accepted = files
      .filter(
        (file) =>
          file.size <= MAX_CHANNEL_ATTACHMENT_BYTES &&
          file.name.length <= MAX_CHANNEL_ATTACHMENT_NAME_LENGTH &&
          file.type.length <= MAX_CHANNEL_ATTACHMENT_TYPE_LENGTH,
      )
      .slice(0, MAX_CHANNEL_ATTACHMENTS);
    if (accepted.length !== files.length) {
      notify(
        `Maximum ${MAX_CHANNEL_ATTACHMENTS} pièces jointes de 25 Mo chacune`,
      );
    }
    return accepted.map((file, index) => ({
      id: `attachment-${Date.now()}-${index}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified,
    }));
  };

  const publish = (
    draft: SlackDraft,
    parentMessageId?: string,
    broadcastToChannel = false,
  ) => {
    if (!channel) return;
    const attachments = toAttachments(draft.attachments);
    if (
      !sendMessage(
        channel.id,
        draft.body,
        attachments,
        parentMessageId,
        broadcastToChannel,
      )
    ) {
      notify("Écris un message ou ajoute une pièce jointe valide");
    }
  };

  if (!channel)
    return (
      <div className="p-4 lg:p-6">
        <Card className="p-6">
          <h2 className="font-semibold">Salon introuvable</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Ce salon n'existe pas dans {activeWorkspace.name}.
          </p>
          <div className="mt-4">
            <Button
              onClick={() =>
                navigate(`/inbox?workspace=${activeWorkspace.id}`)
              }
            >
              Retour à la file
            </Button>
          </div>
        </Card>
      </div>
    );

  const openActions = (messageId: string) => {
    const message = messages.find((entry) => entry.id === messageId);
    if (!message) return;
    setEditBody(message.body);
    setConfirmDelete(false);
    actionTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setActionMessageId(messageId);
  };

  return (
    <>
      <SlackChannelView
        channel={channel}
        embedded
        messages={messages}
        activeTab={activeTab}
        activeThreadId={activeThreadId}
        showDetails={showDetails}
        profileName={profile.name}
        onToggleSidebar={() => setCollapsed(!collapsed)}
        composer={{
          onAttach: () => undefined,
        }}
        onSendMessage={(draft) => publish(draft)}
        onSendThreadMessage={(parentId, draft, broadcast) =>
          publish(draft, parentId, broadcast)
        }
        onTabChange={(tab) =>
          updateQuery((next) => {
            if (tab === "messages") next.delete("tab");
            else next.set("tab", tab);
            next.delete("thread");
            next.delete("details");
          })
        }
        onToggleStar={() => toggleStar(channel.id)}
        onShowMembers={() =>
          navigate(`/members?workspace=${activeWorkspace.id}`)
        }
        onSearch={() => window.dispatchEvent(new Event("hermes:open-search"))}
        onOpenDetails={() =>
          updateQuery((next) => {
            next.delete("tab");
            next.delete("thread");
            next.set("details", "1");
          })
        }
        onUpdateDetails={(patch) => {
          saveChannelInfo(channel.id, patch);
          notify("Informations du salon enregistrées");
        }}
        onClosePanel={() =>
          updateQuery((next) => {
            next.delete("thread");
            next.delete("details");
          })
        }
        onOpenThread={(messageId) =>
          updateQuery((next) => {
            next.delete("tab");
            next.delete("details");
            next.set("thread", messageId);
          })
        }
        onToggleReaction={(messageId, emoji) =>
          toggleReaction(channel.id, messageId, emoji)
        }
        onTogglePin={(messageId) => togglePin(channel.id, messageId)}
        onMoreMessageActions={openActions}
      />
      {actionMessage && (
        <Modal
          open
          onClose={closeActions}
          title="Actions du message"
          description={`Message de ${actionMessage.author}`}
          maxWidth="max-w-lg"
          footer={
            confirmDelete ? (
              <>
                <ModalButton onClick={() => setConfirmDelete(false)}>Annuler</ModalButton>
                <ModalButton
                  variant="danger"
                  onClick={() => {
                    deleteMessage(channel.id, actionMessage.id);
                    if (activeThreadId === actionMessage.id) {
                      updateQuery((next) => next.delete("thread"));
                    }
                    closeActions();
                    notify("Message supprimé");
                  }}
                >
                  Supprimer
                </ModalButton>
              </>
            ) : (
              <>
                <ModalButton
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(actionMessage.body);
                      notify("Message copié");
                    } catch {
                      notify("Impossible de copier ce message");
                    }
                  }}
                >
                  Copier
                </ModalButton>
                <ModalButton
                  onClick={() => {
                    togglePin(channel.id, actionMessage.id);
                    closeActions();
                  }}
                >
                  {channel.pinnedMessageIds.includes(actionMessage.id)
                    ? "Désépingler"
                    : "Épingler"}
                </ModalButton>
                {actionMessage.author === profile.name && (
                  <>
                    <ModalButton onClick={() => setConfirmDelete(true)}>
                      Supprimer
                    </ModalButton>
                    <ModalButton
                      variant="primary"
                      onClick={() => {
                        if (!editBody.trim()) {
                          notify("Le message ne peut pas être vide");
                          return;
                        }
                        editMessage(channel.id, actionMessage.id, editBody);
                        closeActions();
                        notify("Message modifié");
                      }}
                    >
                      Enregistrer
                    </ModalButton>
                  </>
                )}
              </>
            )
          }
        >
          {confirmDelete ? (
            <div className="rounded-xl bg-[var(--state-neg)] p-4">
              <p className="text-body-medium text-[var(--state-neg-fg)]">
                Supprimer ce message et les réponses de son fil ?
              </p>
            </div>
          ) : (
            /* Touch collapses the hover toolbar into this sheet, so reacting and
               replying have to be reachable from here too. */
            <div className="grid gap-4">
              <div className="grid gap-2">
                <span className="text-body-medium">Réagir</span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`Réagir avec ${emoji}`}
                      onClick={() => {
                        toggleReaction(channel.id, actionMessage.id, emoji);
                        closeActions();
                      }}
                      className="inline-flex size-11 items-center justify-center rounded-[10px] border border-[var(--border-control)] bg-[var(--card)] text-[16px] transition-colors hover:bg-[var(--surface-hover)] md:size-8"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const threadId =
                    actionMessage.parentMessageId ?? actionMessage.id;
                  closeActions();
                  updateQuery((next) => {
                    next.delete("tab");
                    next.delete("details");
                    next.set("thread", threadId);
                  });
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--border-control)] bg-[var(--card)] px-3 text-body-2-medium transition-colors hover:bg-[var(--surface-hover)] md:min-h-8"
              >
                <MessageSquareTextIcon className="size-4" /> Répondre dans le fil
              </button>
              {actionMessage.author === profile.name && (
                <label className="grid gap-2 text-body-medium">
                  Modifier le message
                  <textarea
                    data-composer-input
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    maxLength={MAX_CHANNEL_MESSAGE_LENGTH}
                    rows={4}
                    className="control resize-y"
                  />
                </label>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

export function HistoryPage() {
  const { items } = useApp();
  const [query, setQuery] = useState("");
  const [onlyDone, setOnlyDone] = useState(false);
  const rows = items.filter(
    (item) =>
      (!onlyDone || item.context.includes("terminé")) &&
      `${item.title} ${item.context}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">Historique des missions</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Filtrable localement, sans rechargement.
            </p>
          </div>
          <div className="flex gap-2">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-[var(--input)] px-2 focus-within:border-[var(--ring)] sm:h-8 sm:flex-none">
              <SearchIcon className="size-4 shrink-0 text-[var(--muted-foreground)]" />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Rechercher dans l'historique"
                placeholder="Rechercher"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none sm:w-36 sm:flex-none"
              />
            </label>
            <Button onClick={() => setOnlyDone(!onlyDone)}>
              {onlyDone ? "Tous" : "Terminés"}
            </Button>
          </div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {rows.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 px-4 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--foreground)]">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {item.context} · {item.age}
                </p>
              </div>
              <Status item={item} />
            </div>
          ))}
          {!rows.length && (
            <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              Aucune mission trouvée.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export function MembersPage() {
  const { members, selectedMember, selectMember, addMember, notify } = useApp();
  const location = useLocation();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const selected =
    members.find((member) => member.name === selectedMember) ?? members[0];
  useEffect(() => {
    if (location.hash === "#add-member") document.getElementById("add-member")?.scrollIntoView({ block: "center" });
  }, [location.hash]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!addMember(name, role)) {
      setError("Indique un nom et un rôle uniques d'au moins 2 caractères.");
      return;
    }
    notify(`Accès ajouté pour ${name.trim()}`);
    setName(""); setRole(""); setError("");
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <h2 className="font-medium">Membres de l'espace</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Sélectionne un membre pour consulter son rôle.
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {members.map((member) => (
            <button
              type="button"
              key={member.name}
              onClick={() => selectMember(member.name)}
              className={`flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-[var(--accent)] ${selected?.name === member.name ? "bg-[var(--state-info-soft)]" : ""}`}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--accent-200)] text-[10px] font-semibold text-[var(--accent-700)]">
                {member.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--foreground)]">
                  {member.name}
                </span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {member.role}
                </span>
              </span>
              <span className="text-xs text-[var(--state-info-fg)]">
                {member.state}
              </span>
            </button>
          ))}
          {!members.length && (
            <p className="p-6 text-sm text-[var(--muted-foreground)]">
              Aucun membre dans cet espace.
            </p>
          )}
        </div>
      </Card>
      <div className="grid h-fit gap-4">
        <Card className="p-4">
          <UserRoundIcon className="size-5 text-[var(--accent-500)]" />
          <h2 className="mt-3 font-medium">{selected?.name ?? "Aucun membre"}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            {selected
              ? `Rôle : ${selected.role}. État : ${selected.state}.`
              : "Ajoute ou restaure un workspace pour afficher ses accès."}
          </p>
        </Card>
        <Card className="p-4">
          <form id="add-member" onSubmit={submit} className="grid gap-3">
            <div><h2 className="font-medium">Ajouter un accès</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">Le membre reste isolé dans ce workspace.</p></div>
            {error && <p role="alert" className="rounded-lg bg-[var(--state-neg)] p-2 text-xs text-[var(--state-neg-fg)]">{error}</p>}
            <Field label="Nom"><input value={name} onChange={(event) => setName(event.target.value)} className="control" /></Field>
            <Field label="Rôle"><input value={role} onChange={(event) => setRole(event.target.value)} className="control" /></Field>
            <Button type="submit" variant="primary"><PlusIcon className="size-4" /> Ajouter</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

const skills = [
  {
    id: "pdf-report",
    label: "pdf-report",
    desc: "Produit un rapport PDF avec gabarit maison.",
  },
  {
    id: "workspace-audit",
    label: "workspace-audit",
    desc: "Analyse un espace de travail avant modification.",
  },
  {
    id: "postgres-readonly",
    label: "postgres-readonly",
    desc: "Lit les données sans autoriser d'écriture.",
  },
  {
    id: "notion-sync",
    label: "notion-sync",
    desc: "Synchronise un espace Notion après autorisation.",
  },
];
export function RegistryPage() {
  const { enabledSkills, toggleSkill } = useApp();
  const [query, setQuery] = useState("");
  const entries = skills.filter((skill) =>
    `${skill.label} ${skill.desc}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">Registre des compétences</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {enabledSkills.length} compétence(s) activée(s).
            </p>
          </div>
          <label className="flex h-11 items-center gap-2 rounded-[8px] border border-[var(--input)] px-2 focus-within:border-[var(--ring)] sm:h-8">
            <SearchIcon className="size-4 shrink-0 text-[var(--muted-foreground)]" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Rechercher une compétence"
              placeholder="Rechercher"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none sm:w-36 sm:flex-none"
            />
          </label>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {entries.map((skill) => {
            const enabled = enabledSkills.includes(skill.id);
            return (
              <div key={skill.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <BookOpenIcon className="size-5 shrink-0 text-[var(--accent-500)]" />
                <div className="min-w-[12rem] flex-1">
                  <p className="font-medium text-[var(--foreground)]">
                    {skill.label}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {skill.desc}
                  </p>
                </div>
                <Button onClick={() => toggleSkill(skill.id)}>
                  {enabled ? "Désactiver" : "Activer"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function AuditPage() {
  const { auditEvents } = useApp();
  const [level, setLevel] = useState<"all" | "attention">("all");
  const shown = auditEvents.filter(
    (event) => level === "all" || event.level === level,
  );
  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <div>
            <h2 className="font-medium">Journal d'audit</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Événements persistés pour cet espace.
            </p>
          </div>
          <Button
            onClick={() => setLevel(level === "all" ? "attention" : "all")}
          >
            <SlidersHorizontalIcon className="size-4" />{" "}
            {level === "all" ? "Attention" : "Tous"}
          </Button>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {shown.map((event) => (
            <div key={event.id} className="flex items-center gap-3 p-4">
              <span
                className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${event.level === "attention" ? "bg-[var(--state-warn)] text-[var(--state-warn-fg)]" : "bg-[var(--state-info)] text-[var(--state-info-fg)]"}`}
              >
                {event.level === "attention" ? (
                  <AlertTriangleIcon className="size-4" />
                ) : (
                  <ActivityIcon className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-sm text-[var(--foreground)]">
                {event.label}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {event.time}
              </span>
            </div>
          ))}
          {!shown.length && (
            <p className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              Aucun événement pour ce filtre.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { collapsed, setCollapsed, notify, notifications, setNotifications } =
    useApp();
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <div className="divide-y divide-[var(--border)]">
          <Setting
            label="Apparence"
            description="Le choix est conservé sur cet appareil."
          >
            <ThemeToggle />
          </Setting>
          <Setting
            label="Barre latérale"
            description="Conserve l'état réduit dans le navigateur."
            className="hidden lg:flex"
          >
            <Button onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? "Développer" : "Réduire"}
            </Button>
          </Setting>
          <Setting
            label="Notifications"
            description="Affiche les retours de mission dans la console."
          >
            <button
              type="button"
              aria-pressed={notifications}
              onClick={() => {
                setNotifications(!notifications);
                notify(
                  notifications
                    ? "Notifications désactivées"
                    : "Notifications activées",
                );
              }}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors md:h-7 md:w-12 ${notifications ? "bg-[var(--accent-500)]" : "bg-[var(--input)]"}`}
            >
              <span
                className={`absolute top-1/2 left-1 size-6 -translate-y-1/2 rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform md:size-5 ${notifications ? "translate-x-6 md:translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </Setting>
        </div>
      </Card>
    </div>
  );
}
function Setting({
  label,
  description,
  children,
  className = "flex",
}: {
  label: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5`}>
      <div className="min-w-0">
        <h2 className="font-medium text-[var(--foreground)]">{label}</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 sm:justify-end">{children}</div>
    </div>
  );
}

export function AccountPage() {
  const { notify, profile, saveProfile } = useApp();
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState(profile.role);
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--accent-200)] text-[12px] font-semibold text-[var(--accent-700)]">
              {name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <h2 className="font-semibold">Profil opérateur</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Informations affichées dans la navigation.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            <Field label="Nom affiché">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                className="control"
              />
            </Field>
            <Field label="Rôle">
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                autoComplete="organization-title"
                enterKeyHint="done"
                className="control"
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              variant="primary"
              onClick={() => {
                if (name.trim().length < 2 || role.trim().length < 2) {
                  notify(
                    "Le nom et le rôle doivent contenir 2 caractères minimum",
                  );
                  return;
                }
                saveProfile(name.trim(), role.trim());
                notify("Profil enregistré localement");
              }}
            >
              <CheckIcon className="size-4" /> Enregistrer
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function WorkspacesPage() {
  const {
    workspaces,
    archivedWorkspaces,
    activeWorkspace,
    createWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    setWorkspace,
    notify,
  } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    const workspace = createWorkspace(name, description);
    if (!workspace) {
      setError("Donne un nom d'au moins 3 caractères.");
      return;
    }
    notify(`Workspace ${workspace.name} créé`);
    navigate(`/inbox?workspace=${workspace.id}`);
  };
  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <h2 className="font-medium">Espaces actifs</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Les données restent isolées et persistées localement.
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {workspaces.map((workspace) => (
            <div key={workspace.id} className="flex flex-wrap items-center gap-x-3 gap-y-3 p-4">
              <span
                className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${workspace.tone} text-[10px] font-semibold text-white`}
              >
                {workspace.short}
              </span>
              <div className="min-w-[10rem] flex-1">
                <p className="font-medium text-[var(--foreground)]">
                  {workspace.name}
                  {workspace.id === activeWorkspace.id && (
                    <span className="ml-2 text-xs text-[var(--accent-600)]">
                      actif
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {workspace.description}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  onClick={() => {
                    setWorkspace(workspace.id);
                    navigate(`/inbox?workspace=${workspace.id}`);
                  }}
                >
                  Ouvrir
                </Button>
                <Button
                  disabled={workspaces.length < 2}
                  onClick={() => {
                    archiveWorkspace(workspace.id);
                    notify(`${workspace.name} archivé`);
                  }}
                >
                  Archiver
                </Button>
              </div>
            </div>
          ))}
          {!workspaces.length && (
            <p className="p-6 text-sm text-[var(--muted-foreground)]">
              Aucun workspace actif.
            </p>
          )}
        </div>
        {archivedWorkspaces.length > 0 && (
          <div className="border-t border-[var(--border)] p-4">
            <p className="mb-2 text-sm font-medium">Archivés</p>
            {archivedWorkspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-[var(--muted-foreground)]">
                  {workspace.name}
                </span>
                <Button
                  onClick={() => {
                    restoreWorkspace(workspace.id);
                    notify(`${workspace.name} restauré`);
                  }}
                >
                  Restaurer
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="h-fit">
        <form onSubmit={create} className="grid gap-4 p-5">
          <div>
            <h2 className="font-medium">Créer un workspace</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Aucune API : le mock est enregistré dans ce navigateur.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-[var(--state-neg)] p-2 text-sm text-[var(--state-neg-fg)]"
            >
              {error}
            </p>
          )}
          <Field label="Nom">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="control"
              placeholder="Ex. Studio design"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="control resize-y"
              rows={3}
              placeholder="Usage de cet espace"
            />
          </Field>
          <Button type="submit" variant="primary">
            <PlusIcon className="size-4" /> Créer
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function NotFound() {
  const navigate = useNavigate();
  const { activeWorkspace } = useApp();
  return (
    <div className="mx-auto flex min-h-[48dvh] max-w-xl flex-col items-center justify-center text-center">
      <SparklesIcon className="size-8 text-[var(--accent-500)]" />
      <h2 className="mt-3 text-[14px] font-semibold">Vue introuvable</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Le lien demandé n'existe pas ou a été déplacé.
      </p>
      <div className="mt-5">
        <Button
          variant="primary"
          onClick={() =>
            navigate(`/inbox?workspace=${activeWorkspace.id}`, {
              replace: true,
            })
          }
        >
          Retour à la file
        </Button>
      </div>
    </div>
  );
}
