import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import {
  CreateChannelDialog,
  WorkspaceSidebar,
  type Workspace,
} from "./components/sidebar/workspace-sidebar";
import { Modal, ModalButton } from "./components/ui/modal";
import { MembersDialog } from "./components/members/members-dialog";
import { MobileHeader, MobileHeaderAction } from "./components/mobile/mobile-header";
import { MobileBottomNav } from "./components/mobile/mobile-bottom-nav";
import {
  decodeChannelId,
  mobileTabForPath,
  orgPath,
  persistMobileTabScroll,
  restoreMobileTabScroll,
  resolveMobileStack,
  stripOrg,
} from "./components/mobile/mobile-nav";
import { useAppHeight } from "./components/mobile/use-app-height";
import { useAuthStore } from "./state/auth-store";
import { SidebarTrigger } from "./components/shell/sidebar-trigger";
import { workspaceToneClasses } from "./components/shell/workspace-tone";
import {
  dropChannelReadCount,
  useChannelReadCounts,
} from "./state/channel-reads";
import {
  ATTENTION_LABEL,
  channelAttention,
  formatElapsed,
  ATTENTION_ORDER,
} from "./state/channel-attention";
import {
  ChannelDialogs,
  RowMenu,
  channelMenuItems,
  sectionMenuItems,
  type ChannelActions,
} from "./components/channels/channel-menu";
import {
  eventsForMission,
  missionById,
  MISSIONS,
  pendingGates,
} from "./state/mission-events";
import {
  SlackChannelView,
  type SlackChannelTab,
  type SlackDraft,
} from "./components/slack";
import {
  addAudit,
  canAccessChannel,
  createChannelCategory as createCategoryInData,
  createDefaultChannelCategories,
  createDefaultChannels,
  deleteChannel as deleteChannelInData,
  deleteChannelCategory as deleteCategoryInData,
  deleteChannelMessage,
  editChannelMessage,
  moveChannelCategory as moveCategoryInData,
  moveChannelToCategory as moveChannelInData,
  renameChannel as renameChannelInData,
  renameChannelCategory as renameCategoryInData,
  sendChannelMessage,
  setMessagePinned,
  toggleChannelStar,
  toggleMessageReaction,
  updateChannelInfo,
  updateChannelMembers,
  type AuditEvent,
  type Channel,
  type ChannelAttachment,
  type ChannelCategory,
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
  DEFAULT_CATEGORY_ID,
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
  ActivityIcon,
  AlertTriangleIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  SparklesIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CompassIcon,
  FileSearchIcon,
  FlaskConicalIcon,
  HashIcon,
  HistoryIcon,
  InboxIcon,
  InfoIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  Settings2Icon,
  ShieldAlertIcon,
  StarIcon,
  CopyIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  members: Member[];
  selectedMember: string;
  selectMember: (name: string) => void;
  auditEvents: AuditEvent[];
  logAudit: (label: string, level?: AuditEvent["level"]) => void;
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
  channelCategories: ChannelCategory[];
  createChannel: (name: string, categoryId?: string) => Channel | null;
  /** False when the store refused the new label: blank, or already taken. */
  renameChannel: (channelId: string, name: string) => boolean;
  deleteChannel: (channelId: string) => void;
  moveChannelToCategory: (channelId: string, categoryId: string) => void;
  createCategory: (name: string) => boolean;
  renameCategory: (categoryId: string, name: string) => boolean;
  deleteCategory: (categoryId: string) => void;
  moveCategory: (categoryId: string, offset: -1 | 1) => void;
  messagesFor: (channelId: string) => ChannelMessage[];
  sendMessage: (
    channelId: string,
    body: string,
    attachments?: ChannelAttachment[],
    parentMessageId?: string,
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
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used in the application shell");
  return context;
};

const routeMeta: Record<string, { label: string; subtitle: string }> = {
  "/menu": { label: "Menu", subtitle: "Toutes les vues de la console" },
  "/inbox": { label: "File", subtitle: "Éléments à traiter" },
  "/activity": {
    label: "Activité",
    subtitle: "File et missions en cours",
  },
  "/hermes": {
    label: "Hermes",
    subtitle: "Assistant local de l'espace",
  },
  "/channels": { label: "Canaux", subtitle: "Discussions locales de l'espace" },
  "/missions": {
    label: "Missions",
    subtitle: "Une timeline par mission, décisions en tête",
  },
  "/labs": {
    label: "Labs",
    subtitle: "Expériences opt-in de la console",
  },
  "/labs/training": {
    label: "Terrain d'entraînement",
    subtitle: "Apprendre à trancher des gates sur une mission fictive",
  },
  "/labs/layout-lab": {
    label: "Layout lab",
    subtitle: "Dix compositions de la surface mission, à comparer",
  },
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
  const navigate = useNavigate();
  const [consoleState, setConsoleState] =
    useState<ConsoleState>(loadConsoleState);
  const [toast, setToast] = useState("");
  const [dark, setDarkState] = useState(
    () => readLocalPreference("boardui:theme") === "dark",
  );
  const [collapsed, setCollapsedState] = useState(() => {
    const stored = readLocalPreference("hermes-sidebar-collapsed");
    return stored === "true";
  });
  const notify = (message: string) => setToast(message);
  // The org URL segment is the route authority for the active workspace.
  const { org } = useParams();
  const orgIsKnown = consoleState.workspaces.some(
    (workspace) => workspace.id === org,
  );
  const effectiveWorkspaceId = orgIsKnown
    ? org
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
  const logAudit = (label: string, level: AuditEvent["level"] = "info") =>
    updateWorkspaceData((data) => addAudit(data, label, level));
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
              /* Renaming onto a name that is already a member would otherwise
                 duplicate it, and `isChannel` rejects duplicate memberNames —
                 which makes the whole persisted state unreadable, so the next
                 load silently replaces it with the seed. */
              memberNames: [
                ...new Set(
                  channel.memberNames.map((memberName) =>
                    memberName === previousName ? name : memberName,
                  ),
                ),
              ],
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
          channelCategories: createDefaultChannelCategories(),
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
  const createChannel = (name: string, categoryId?: string) => {
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
    /* An unknown section would leave the channel unreachable in the sidebar, so
       it falls back to the first one rather than trusting the caller. */
    const targetCategoryId =
      categoryId &&
      workspaceData.channelCategories.some((entry) => entry.id === categoryId)
        ? categoryId
        : workspaceData.channelCategories[0]?.id ?? DEFAULT_CATEGORY_ID;
    const channel: Channel = {
      id: normalized,
      name: normalized,
      categoryId: targetCategoryId,
      createdAt: new Date().toISOString(),
      topic: "",
      description: "",
      starred: false,
      isPrivate: false,
      memberNames: workspaceData.members.map((member) => member.name),
      pinnedMessageIds: [],
    };
    updateWorkspaceData((data) => addAudit({ ...data, channels: [...data.channels, channel], messages: { ...data.messages, [channel.id]: [] } }, `Canal #${channel.name} créé`));
    return channel;
  };
  const renameChannel = (channelId: string, name: string) => {
    const channel = workspaceData?.channels.find((entry) => entry.id === channelId);
    if (!channel || !workspaceData) return false;
    const preview = renameChannelInData(workspaceData, channelId, name);
    if (!preview) return false;
    const renamed = preview.channels.find((entry) => entry.id === channelId);
    updateWorkspaceData((data) => {
      const next = renameChannelInData(data, channelId, name);
      return next
        ? addAudit(
            next,
            `Canal #${channel.name} renommé en #${renamed?.name} · identifiant ${channelId} conservé`,
          )
        : data;
    });
    return true;
  };
  const deleteChannel = (channelId: string) => {
    const channel = workspaceData?.channels.find((entry) => entry.id === channelId);
    if (!channel || !workspaceData) return;
    const messageCount = (workspaceData.messages[channelId] ?? []).length;
    updateWorkspaceData((data) => {
      const next = deleteChannelInData(data, channelId);
      return next
        ? addAudit(
            next,
            `Canal #${channel.name} supprimé · ${messageCount} ${messageCount > 1 ? "messages" : "message"}`,
            "attention",
          )
        : data;
    });
    dropChannelReadCount(activeWorkspace.id, channelId);
    /* Standing on a channel that no longer exists would render the "introuvable"
       card, so the route steps back to a surviving channel or to the index. */
    if (decodeChannelId(stripOrg(location.pathname)) === channelId) {
      const fallback = workspaceData.channels.find(
        (entry) => entry.id !== channelId,
      );
      navigate(
        orgPath(
          activeWorkspace.id,
          fallback ? `/channels/${encodeURIComponent(fallback.id)}` : "/channels",
        ),
        { replace: true },
      );
    }
  };
  const moveChannelToCategory = (channelId: string, categoryId: string) => {
    const channel = workspaceData?.channels.find((entry) => entry.id === channelId);
    const category = workspaceData?.channelCategories.find(
      (entry) => entry.id === categoryId,
    );
    if (!channel || !category) return;
    updateWorkspaceData((data) => {
      const next = moveChannelInData(data, channelId, categoryId);
      return next
        ? addAudit(next, `Canal #${channel.name} déplacé vers « ${category.name} »`)
        : data;
    });
  };
  const createCategory = (name: string) => {
    if (!workspaceData) return false;
    /* Section ids are technical and never displayed, so a timestamp beats a
       slug: it can never normalize to something the id pattern rejects. */
    const id = `section-${Date.now().toString(36)}`;
    if (!createCategoryInData(workspaceData, id, name)) return false;
    updateWorkspaceData((data) => {
      const next = createCategoryInData(data, id, name);
      return next ? addAudit(next, `Section « ${name.trim()} » créée`) : data;
    });
    return true;
  };
  const renameCategory = (categoryId: string, name: string) => {
    const category = workspaceData?.channelCategories.find(
      (entry) => entry.id === categoryId,
    );
    if (!category || !workspaceData) return false;
    if (!renameCategoryInData(workspaceData, categoryId, name)) return false;
    updateWorkspaceData((data) => {
      const next = renameCategoryInData(data, categoryId, name);
      return next
        ? addAudit(
            next,
            `Section « ${category.name} » renommée en « ${name.trim()} »`,
          )
        : data;
    });
    return true;
  };
  const deleteCategory = (categoryId: string) => {
    if (!workspaceData) return;
    const category = workspaceData.channelCategories.find(
      (entry) => entry.id === categoryId,
    );
    const survivor = workspaceData.channelCategories.find(
      (entry) => entry.id !== categoryId,
    );
    if (!category || !survivor) return;
    const moved = workspaceData.channels.filter(
      (channel) => channel.categoryId === categoryId,
    ).length;
    updateWorkspaceData((data) => {
      const next = deleteCategoryInData(data, categoryId);
      return next
        ? addAudit(
            next,
            `Section « ${category.name} » supprimée · ${moved} ${moved > 1 ? "canaux rendus" : "canal rendu"} à « ${survivor.name} »`,
          )
        : data;
    });
  };
  const moveCategory = (categoryId: string, offset: -1 | 1) =>
    updateWorkspaceData(
      (data) => moveCategoryInData(data, categoryId, offset) ?? data,
    );
  const sendMessage = (
    channelId: string,
    body: string,
    attachments: ChannelAttachment[] = [],
    parentMessageId?: string,
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
        ...(parentMessageId ? { parentMessageId } : {}),
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

  // URL → store: the visited org becomes the remembered one (used by "/").
  useEffect(() => {
    if (!orgIsKnown || !org || org === consoleState.activeWorkspaceId) return;
    setConsoleState((current) => ({
      ...current,
      activeWorkspaceId: org,
    }));
  }, [consoleState.activeWorkspaceId, org, orgIsKnown]);

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
  if (!activeWorkspace || !workspaceData) return null;
  // An unknown slug falls back to the remembered org on the same sub-path.
  if (!orgIsKnown)
    return (
      <Navigate
        to={orgPath(
          activeWorkspace.id,
          `${stripOrg(location.pathname)}${location.search}`,
        )}
        replace
      />
    );
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
        members: workspaceData.members,
        selectedMember: workspaceData.selectedMember,
        selectMember,
        addMember,
        auditEvents: workspaceData.audit,
        logAudit,
        notifications: workspaceData.notifications,
        setNotifications,
        profile: consoleState.profile,
        saveProfile,
        createWorkspace,
        archiveWorkspace,
        restoreWorkspace,
        archivedWorkspaces: consoleState.archivedWorkspaces,
        channels: accessibleChannels,
        channelCategories: workspaceData.channelCategories,
        createChannel,
        renameChannel,
        deleteChannel,
        moveChannelToCategory,
        createCategory,
        renameCategory,
        deleteCategory,
        moveCategory,
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
        detail: channel.topic || "Canal",
        to: `/channels/${encodeURIComponent(channel.id)}`,
        kind: "Canaux",
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
      requestAnimationFrame(() => inputRef.current?.focus());
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
    navigate(orgPath(activeWorkspace.id, to));
    close();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/50 lg:items-center lg:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Rechercher dans ${activeWorkspace.name}`}
        className="flex h-full w-full flex-col overflow-hidden border-[var(--border-control)] bg-[var(--surface)] pt-[env(safe-area-inset-top)] shadow-[var(--shadow-elevated)] lg:h-auto lg:max-w-xl lg:rounded-2xl lg:border lg:pt-0"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 lg:h-10">
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
            placeholder="Rechercher une vue, un canal ou une mission…"
            className="h-full min-w-0 flex-1 bg-transparent text-body-1 text-[var(--foreground)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <button type="button" aria-label="Fermer la recherche" onClick={close} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] lg:size-7">
            <XIcon className="size-5 lg:size-4" />
          </button>
        </div>
        <div className="mx-2 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--card)] shadow-[var(--shadow-xs)] lg:block lg:flex-none">
          <div className="w-full overflow-y-auto overscroll-contain py-1 lg:max-h-[min(420px,60dvh)]">
            {!needle ? (
              <>
                <p className="px-4 pt-2.5 pb-1 text-caption-1 text-[var(--muted-foreground)]">Suggestions</p>
                {searchSuggestions.map((suggestion) => (
                  <button key={suggestion.id} type="button" onClick={() => choose(suggestion.to)} className="flex h-11 w-full items-center px-3 text-left text-body-2 text-[var(--foreground)] hover:bg-[var(--surface-hover)] lg:h-8">
                    {suggestion.label}
                  </button>
                ))}
              </>
            ) : results.length ? (
              <>
                <p className="px-4 pt-2.5 pb-1 text-caption-1 text-[var(--muted-foreground)]">Résultats</p>
                {results.map((result) => (
                  <button key={result.id} type="button" onClick={() => choose(result.to)} className="flex h-11 w-full items-center gap-3 px-3 text-left hover:bg-[var(--surface-hover)] lg:h-8">
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
        <footer className="hidden items-center justify-between px-4 py-2.5 text-caption-1 text-[var(--muted-foreground)] lg:flex">
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

/**
 * The channel mutators as one object, so the desktop sidebar and the mobile
 * index are wired from the same source and cannot drift apart.
 */
function useChannelActions(): ChannelActions {
  const {
    createChannel,
    renameChannel,
    deleteChannel,
    moveChannelToCategory,
    createCategory,
    renameCategory,
    deleteCategory,
    moveCategory,
  } = useApp();
  return {
    createChannel,
    renameChannel,
    deleteChannel,
    moveChannelToCategory,
    createCategory,
    renameCategory,
    deleteCategory,
    moveCategory,
  };
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
    channels,
    channelCategories,
    messagesFor,
    createChannel,
    items,
    members,
  } = useApp();
  const channelActions = useChannelActions();
  const location = useLocation();
  const navigate = useNavigate();
  const mainScrollRef = useRef<HTMLElement>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  useAppHeight();
  // Offcanvas from 1024px up, exactly like shadcn `dashboard-01`: the panel is
  // either present at full width or slid out. Below 1024px the mobile stack owns
  // navigation and the panel never renders.
  const sidebarCollapsed = collapsed;
  const barePath = stripOrg(location.pathname);
  const pathname = barePath.startsWith("/inbox/")
    ? "/inbox"
    : barePath.startsWith("/missions/")
      ? "/missions"
      : barePath.startsWith("/hermes/")
        ? "/hermes"
      : barePath;
  const channelId = decodeChannelId(barePath);
  const channel = channels.find((entry) => entry.id === channelId);
  const channelMessageCounts = Object.fromEntries(
    channels.map((entry) => [entry.id, messagesFor(entry.id).length]),
  );
  // Keeps the read watermark of the open channel up to date as messages land.
  useChannelReadCounts(activeWorkspace.id, channelMessageCounts, channelId);
  const detailItem = barePath.startsWith("/inbox/")
    ? items.find(
        (entry) => entry.id === decodeURIComponent(barePath.split("/")[2] ?? ""),
      )
    : undefined;
  const meta = channel ? { label: `# ${channel.name}`, subtitle: "Discussion locale de l'espace" } : routeMeta[pathname] ?? {
    label: "Introuvable",
    subtitle: "Cette vue n'existe pas",
  };
  const stack = resolveMobileStack({
    pathname: barePath,
    search: location.search,
    org: activeWorkspace.id,
    channelName: channel?.name,
    itemTitle: detailItem?.title,
    missionName: barePath.startsWith("/missions/")
      ? missionById(decodeURIComponent(barePath.split("/")[2] ?? ""))?.name
      : undefined,
  });
  const openSearch = () => window.dispatchEvent(new Event("hermes:open-search"));
  const openTaskDialog = () => setTaskDialogOpen(true);
  const closeTaskDialog = useCallback(() => setTaskDialogOpen(false), []);
  const openChannelDetails = () => {
    const next = new URLSearchParams(location.search);
    next.delete("tab");
    next.delete("thread");
    next.set("details", "1");
    navigate({ pathname: location.pathname, search: `?${next.toString()}` });
  };
  const params = new URLSearchParams(location.search);
  const inChannelPanel =
    Boolean(params.get("thread")) || params.get("details") === "1";
  const mobileTab = mobileTabForPath(barePath);
  const assistantRoute = barePath === "/hermes" || barePath.startsWith("/hermes/");
  // Hermes is a tab you enter, not a tab you sit in: the conversation takes the
  // full height and the bar leaves, so the composer never competes with it.
  const mobileRoot = ["/activity", "/inbox"].includes(barePath);
  const mobileFab =
    barePath === "/channels"
      ? {
          label: "Créer un canal",
          onClick: () => window.dispatchEvent(new Event("hermes:create-channel")),
        }
      : barePath === "/activity" || barePath === "/inbox" || barePath === "/missions"
        ? {
            label: "Nouvelle tâche",
            onClick: openTaskDialog,
          }
        : null;
  const mobileActions =
    channel && !inChannelPanel ? (
      <>
        <MobileHeaderAction label="Rechercher" onClick={openSearch}>
          <SearchIcon className="size-4" />
        </MobileHeaderAction>
        <MobileHeaderAction label="Informations du canal" onClick={openChannelDetails}>
          <InfoIcon className="size-4" />
        </MobileHeaderAction>
      </>
    ) : pathname === "/inbox" ? (
      <>
        <MobileHeaderAction label="Rechercher" onClick={openSearch}>
          <SearchIcon className="size-4" />
        </MobileHeaderAction>
        <MobileHeaderAction
          label="Ouvrir le menu et le profil"
          onClick={() => navigate(orgPath(activeWorkspace.id, "/menu"))}
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--accent-200)] text-[10px] font-semibold text-[var(--accent-700)]">
            {profile.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
        </MobileHeaderAction>
      </>
    ) : pathname === "/activity" ? (
      <MobileHeaderAction label="Rechercher" onClick={openSearch}>
        <SearchIcon className="size-4" />
      </MobileHeaderAction>
    ) : null;
  useEffect(() => {
    document.title = `Hermes Console — ${meta.label}`;
  }, [meta.label]);
  useEffect(() => {
    if (!mobileTab) return;
    const frame = window.requestAnimationFrame(() => {
      if (mainScrollRef.current)
        mainScrollRef.current.scrollTop = restoreMobileTabScroll(
          activeWorkspace.id,
          mobileTab,
        );
    });
    return () => {
      window.cancelAnimationFrame(frame);
      persistMobileTabScroll(
        activeWorkspace.id,
        mobileTab,
        mainScrollRef.current?.scrollTop ?? 0,
      );
    };
  }, [activeWorkspace.id, mobileTab]);
  const changeWorkspace = (id: string) => {
    setWorkspace(id);
    // Channel ids are not portable across workspaces, so a channel view resets
    // to the index: no id is guaranteed to exist in the workspace being entered,
    // now that every channel can be deleted or renamed.
    navigate({
      pathname: orgPath(
        id,
        barePath.startsWith("/channels/") ? "/channels" : barePath,
      ),
      search: location.search,
    });
  };
  return (
    <div className="app-shell flex w-full overflow-hidden bg-[var(--surface-sunken)]">
      <GlobalSearch />
      <WorkspaceSidebar
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        profile={profile}
        onWorkspaceChange={changeWorkspace}
        members={members}
        pendingCount={items.filter((item) => !item.read).length}
        collapsed={sidebarCollapsed}
        dark={dark}
        setDark={setDark}
        channels={channels}
        channelCategories={channelCategories}
        channelMessageCounts={channelMessageCounts}
        createChannel={createChannel}
        channelActions={channelActions}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--panel)] lg:mt-2 lg:mr-2 lg:mb-2 lg:ml-0 lg:overflow-hidden lg:rounded-[14px] lg:shadow-[var(--shadow-card)]">
        {/* Hermes ships a complete header of its own (sessions, title, new
            conversation), so the stack header would only stack a second title
            bar on top of it. */}
        {assistantRoute ? null : (
          <MobileHeader stack={stack} actions={mobileActions} />
        )}
        {!channel && (
          <header className="desktop-content-header sticky top-0 z-30 hidden h-12 shrink-0 items-center justify-between gap-1 border-b border-[var(--border)] bg-[var(--panel)] px-4 lg:flex lg:gap-2 lg:px-6">
            <div className="flex min-w-0 items-center gap-2.5 text-body-2 text-[var(--muted-foreground)]">
              <SidebarTrigger
                collapsed={sidebarCollapsed}
                onToggle={() => setCollapsed(!collapsed)}
              />
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" />
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
                <Button
                  variant="primary"
                  onClick={openTaskDialog}
                >
                  <PlusIcon className="size-4" />
                  <span className="hidden sm:inline">Nouvelle tâche</span>
                  <span className="sm:hidden">Tâche</span>
                </Button>
            </div>
          </header>
        )}
        <main
          ref={mainScrollRef}
          data-mobile-tab-scroll
          className={`flex min-h-0 flex-1 flex-col ${channel || assistantRoute ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
        >
          <div
            className={
              channel || assistantRoute
                ? "flex min-h-0 flex-1 flex-col"
                : `w-full p-3 ${mobileRoot ? "mobile-root-content" : ""} pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:p-4`
            }
          >
            <Outlet key={activeWorkspace.id} />
          </div>
        </main>
        {mobileFab ? (
          <button
            type="button"
            aria-label={mobileFab.label}
            className="mobile-fab lg:hidden"
            onClick={mobileFab.onClick}
          >
            <PlusIcon aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        <TaskDialog open={taskDialogOpen} onClose={closeTaskDialog} />
        {mobileRoot ? (
          <MobileBottomNav
            workspaceId={activeWorkspace.id}
            pendingItems={items.filter((item) => !item.read).length}
          />
        ) : null}
      </div>
    </div>
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
      dot: "bg-[var(--state-warn-fg)]",
    };
  if (item.tone === "neg")
    return {
      label: "Bloqué",
      classes: "bg-[var(--state-neg)] text-[var(--state-neg-fg)]",
      dot: "bg-[var(--state-neg-fg)]",
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
    dot: "bg-[var(--text-tertiary)]",
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
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-body-2 font-medium shadow-[var(--shadow-xs)] disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-8 lg:px-2 ${variant === "primary" ? "bg-[image:var(--gradient-primary)] text-[var(--accent-contrast)] shadow-[var(--shadow-btn-primary)]" : "border border-[var(--border-control)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}
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
  } = useApp();
  const navigate = useNavigate();
  const go = (to: string) => navigate(orgPath(activeWorkspace.id, to));
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

  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      <section className="mobile-list">
        <button
          type="button"
          onClick={() => go("/workspaces")}
          className="mobile-row"
        >
          <span
            className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${workspaceToneClasses(activeWorkspace.tone)}`}
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
          detail="Vues, canaux, missions et messages"
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
          label="Canaux"
          detail={`${channels.length} ${channels.length > 1 ? "canaux" : "canal"} dans cet espace`}
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
          icon={FileSearchIcon}
          label="Journal d'audit"
          detail="Décisions et changements"
          onClick={() => go("/audit")}
        />
        <MenuRow
          icon={FlaskConicalIcon}
          label="Labs"
          detail="Expériences opt-in de la console"
          onClick={() => go("/labs")}
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
            className="mobile-switch"
          >
            <span className="mobile-switch__thumb" aria-hidden />
          </button>
        </div>
      </MenuGroup>

      <p className="pb-1 text-center text-caption-1 text-[var(--text-tertiary)]">
        Hermes Console · v0.0.1 · données locales à ce navigateur
      </p>
    </div>
  );
}

/**
 * Mobile's work feed is intentionally only a projection. File and mission
 * routes retain their own data, interactions and deep links as the authorities.
 */
export function ActivityPage() {
  const { activeWorkspace, items } = useApp();
  const navigate = useNavigate();
  const pendingItems = items.filter((item) => !item.read);
  const attentionMissions = MISSIONS.filter(
    (mission) =>
      mission.status === "waiting" ||
      pendingGates(eventsForMission(mission.id)).length > 0 ||
      mission.status === "running",
  );
  const go = (to: string) => navigate(orgPath(activeWorkspace.id, to));

  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      <section className="mobile-group" aria-label="File à traiter">
        <h2 className="mobile-group__label">À traiter</h2>
        <div className="mobile-list">
          <button type="button" onClick={() => go("/inbox")} className="mobile-row">
            <span className="mobile-row__icon">
              <InboxIcon className="size-4" strokeWidth={1.9} />
            </span>
            <span className="mobile-row__body">
              <span className="mobile-row__title">File</span>
              <span className="mobile-row__detail">
                {pendingItems.length
                  ? `${pendingItems.length} élément${pendingItems.length > 1 ? "s" : ""} à traiter`
                  : "Aucun élément en attente"}
              </span>
            </span>
            {pendingItems.length ? (
              <span className="mobile-badge">{Math.min(99, pendingItems.length)}</span>
            ) : null}
            <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
          </button>
          {pendingItems.slice(0, 2).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(`/inbox/${encodeURIComponent(item.id)}`)}
              className="mobile-row"
            >
              <span className="mobile-row__body">
                <span className="mobile-row__title">{item.title}</span>
                <span className="mobile-row__detail">{item.context}</span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
            </button>
          ))}
        </div>
      </section>

      <section className="mobile-group" aria-label="Missions en cours">
        <h2 className="mobile-group__label">Missions</h2>
        <div className="mobile-list">
          <button type="button" onClick={() => go("/missions")} className="mobile-row">
            <span className="mobile-row__icon">
              <ListChecksIcon className="size-4" strokeWidth={1.9} />
            </span>
            <span className="mobile-row__body">
              <span className="mobile-row__title">Toutes les missions</span>
              <span className="mobile-row__detail">
                {attentionMissions.length} en cours ou en attente
              </span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
          </button>
          {attentionMissions.slice(0, 2).map((mission) => {
            const gates = pendingGates(eventsForMission(mission.id));
            return (
              <button
                key={mission.id}
                type="button"
                onClick={() => go(`/missions/${encodeURIComponent(mission.id)}`)}
                className="mobile-row"
              >
                <span className="mobile-row__body">
                  <span className="mobile-row__title">{mission.name}</span>
                  <span className="mobile-row__detail">
                    {mission.status === "waiting" ? "Décision attendue" : "En cours"}
                  </span>
                </span>
                {gates.length ? <span className="mobile-badge">{gates.length}</span> : null}
                <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Channel directory: the mobile replacement for the sidebar channel list. */
export function ChannelsPage() {
  const { channels, channelCategories, messagesFor, activeWorkspace, createChannel } =
    useApp();
  const channelActions = useChannelActions();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dialogCategoryId, setDialogCategoryId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Channel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [moveTarget, setMoveTarget] = useState<Channel | null>(null);
  const [sectionTarget, setSectionTarget] = useState<ChannelCategory | null>(null);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
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
  const entries = [...channels]
    .filter((channel) =>
      !needle ||
      `${channel.name} ${channel.topic ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    )
    .map((channel) => ({
      channel,
      attention: channelAttention(channel.id, {
        hasUnread: unreadFor(channel.id) > 0,
      }),
    }))
    /* Sections group, attention orders: inside a section the channel asking for
       a decision comes first, and favourites break the tie among calm ones. */
    .sort(
      (a, b) =>
        ATTENTION_ORDER.indexOf(a.attention.state) -
          ATTENTION_ORDER.indexOf(b.attention.state) ||
        Number(Boolean(b.channel.starred)) - Number(Boolean(a.channel.starred)),
    );
  // Sections drive the grouping, on mobile as on desktop: one organization of
  // the channel tree, owned by the operator, identical on both surfaces. The
  // attention ladder is not lost — it still orders the rows inside a section and
  // still carries the dot, the pill and the pinned decisions above the search.
  const groups = channelCategories.map((category, index) => ({
    category,
    index,
    grouped: entries.filter(({ channel }) => channel.categoryId === category.id),
  }));
  // Pinned above search and immune to it: a pending decision can never be
  // filtered away, which is the whole point of pinning it.
  const pinnedDecisions = channels.flatMap((channel) =>
    channelAttention(channel.id).gates.map((entry) => ({ channel, ...entry })),
  );

  useEffect(() => {
    /* The mobile FAB lives in the shell, so it asks for the dialog by event.
       It lands in the first section, which the dialog's picker can change. */
    const openCreate = () => setDialogCategoryId(channelCategories[0]?.id ?? null);
    window.addEventListener("hermes:create-channel", openCreate);
    return () => window.removeEventListener("hermes:create-channel", openCreate);
  }, [channelCategories]);

  const open = (channelId: string) => {
    markRead(channelId);
    navigate(
      orgPath(activeWorkspace.id, `/channels/${encodeURIComponent(channelId)}`),
    );
  };

  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      <button
        type="button"
        onClick={() => navigate(orgPath(activeWorkspace.id, "/workspaces"))}
        className="mobile-row mobile-row--current lg:hidden"
      >
        <span
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${workspaceToneClasses(activeWorkspace.tone)}`}
        >
          {activeWorkspace.short}
        </span>
        <span className="mobile-row__body">
          <span className="mobile-row__title">{activeWorkspace.name}</span>
          <span className="mobile-row__detail">{activeWorkspace.description}</span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
      </button>
      {pinnedDecisions.length > 0 ? (
        <section className="channel-gates" aria-label="Décisions en attente">
          <h2 className="channel-gates__label">
            <ShieldAlertIcon aria-hidden="true" className="size-3.5" />
            Décisions en attente
          </h2>
          {pinnedDecisions.map(({ channel, mission, gate }) => (
            <button
              key={gate.id}
              type="button"
              onClick={() =>
                navigate(
                  orgPath(
                    activeWorkspace.id,
                    `/missions/${encodeURIComponent(mission.id)}`,
                  ),
                )
              }
              className="channel-gates__row"
            >
              <span className="channel-gates__body">
                <span className="channel-gates__title">{gate.title}</span>
                <span className="channel-gates__meta">
                  #{channel.name} · {mission.name}
                  {gate.blastRadius ? ` · ${gate.blastRadius.environment}` : ""}
                </span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-[var(--state-warn-fg)]" />
            </button>
          ))}
        </section>
      ) : null}
      <label className="flex h-11 items-center gap-2 rounded-[8px] border border-[var(--border-control)] bg-[var(--card)] px-2 text-[var(--muted-foreground)] shadow-[var(--shadow-xs)] focus-within:border-[var(--ring)] lg:h-8">
        <SearchIcon className="size-4 shrink-0" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          name="channel-search"
          aria-label="Rechercher un canal"
          placeholder="Rechercher un canal"
          className="min-w-0 flex-1 bg-transparent text-body-1 text-[var(--foreground)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </label>

      <div className="mobile-channel-groups">
        {groups.map(({ category, index: categoryIndex, grouped }) => {
          return (
            <section
              key={category.id}
              className="mobile-group"
              aria-label={category.name}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="mobile-group__label">{category.name}</h2>
                <RowMenu
                  className="items-center"
                  label={`la section ${category.name}`}
                  items={sectionMenuItems({
                    category,
                    index: categoryIndex,
                    count: channelCategories.length,
                    actions: channelActions,
                    onRename: () => setSectionTarget(category),
                    onAddChannel: () => setDialogCategoryId(category.id),
                  })}
                >
                  <span className="min-w-0 flex-1" />
                </RowMenu>
              </div>
              {!grouped.length && (
                <p className="px-4 py-3 text-body-2-regular text-[var(--text-tertiary)]">
                  {needle ? "Aucun canal ne correspond" : "Aucun canal"}
                </p>
              )}
              <div className="mobile-list">
                {grouped.map(({ channel, attention }) => {
                  const messages = messagesFor(channel.id);
                  const last = messages[messages.length - 1];
                  const hasUnread = unreadFor(channel.id) > 0;
                  const expandable = attention.missions.length > 0;
                  const expanded = expandedId === channel.id;
                  const runningMission = attention.missions.find(
                    (mission) => mission.status === "running",
                  );
                  const detail =
                    attention.state === "decision"
                      ? `${attention.gates.length} décision${attention.gates.length > 1 ? "s" : ""} en attente · ${attention.gates[0].mission.name}`
                      : attention.state === "question"
                        ? `Réponse attendue · ${attention.missions[0].name}`
                        : attention.state === "working" && runningMission
                          ? `${runningMission.agent} actif · ${runningMission.name}`
                          : last
                            ? `${last.author} : ${last.body || "pièce jointe"}`
                            : channel.topic || "Aucun message";
                  return (
                    <div
                      key={channel.id}
                      className={`channel-row ${expanded ? "channel-row--open" : ""}`}
                    >
                      <RowMenu
                        className="channel-row__line"
                        label={`# ${channel.name}`}
                        items={channelMenuItems({
                          onRename: () => setRenameTarget(channel),
                          onMove: () => setMoveTarget(channel),
                          onDelete: () => setDeleteTarget(channel),
                        })}
                      >
                        <button
                          type="button"
                          onClick={() => open(channel.id)}
                          className="mobile-row channel-row__main"
                        >
                          <span className="mobile-row__icon channel-row__icon">
                            <HashIcon className="size-4" strokeWidth={1.9} />
                            {attention.state !== "calm" ? (
                              <span
                                aria-hidden="true"
                                className={`channel-dot channel-dot--${attention.state}`}
                              />
                            ) : null}
                          </span>
                          <span className="mobile-row__body">
                            <span
                              className={`mobile-row__title ${hasUnread ? "channel-row__title--unread" : ""}`}
                            >
                              {channel.name}
                              {channel.starred ? (
                                <StarIcon
                                  aria-label="Favori"
                                  className="ml-1.5 inline size-3 align-[-1px] text-[var(--text-tertiary)]"
                                  fill="currentColor"
                                />
                              ) : null}
                              {attention.state !== "calm" ? (
                                <span className="sr-only">
                                  {" "}
                                  · {ATTENTION_LABEL[attention.state]}
                                </span>
                              ) : null}
                            </span>
                            <span className="mobile-row__detail">{detail}</span>
                          </span>
                          {attention.workingAgent && attention.workingSince ? (
                            <span className="channel-pill channel-pill--working">
                              {attention.workingAgent} ·{" "}
                              {formatElapsed(attention.workingSince)}
                            </span>
                          ) : attention.gates.length ? (
                            <span className="channel-pill channel-pill--decision">
                              Décider
                            </span>
                          ) : null}
                          {!expandable ? (
                            <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
                          ) : null}
                        </button>
                        {expandable ? (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "Replier" : "Déplier"} l'activité de ${channel.name}`}
                            onClick={() =>
                              setExpandedId(expanded ? null : channel.id)
                            }
                            className="channel-row__toggle"
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                            />
                          </button>
                        ) : null}
                      </RowMenu>
                      {expanded ? (
                        <div className="channel-row__panel">
                          {attention.gates.map(({ mission, gate }) => (
                            <button
                              key={gate.id}
                              type="button"
                              onClick={() =>
                                navigate(
                                  orgPath(
                                    activeWorkspace.id,
                                    `/missions/${encodeURIComponent(mission.id)}`,
                                  ),
                                )
                              }
                              className="channel-panel__row"
                            >
                              <ShieldAlertIcon
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-[var(--state-warn-fg)]"
                              />
                              <span className="channel-panel__text">
                                {gate.title}
                              </span>
                              <ChevronRightIcon className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                            </button>
                          ))}
                          {runningMission ? (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  orgPath(
                                    activeWorkspace.id,
                                    `/missions/${encodeURIComponent(runningMission.id)}`,
                                  ),
                                )
                              }
                              className="channel-panel__row"
                            >
                              <ActivityIcon
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-[var(--accent-600)]"
                              />
                              <span className="channel-panel__text">
                                {runningMission.agent} actif depuis{" "}
                                {formatElapsed(runningMission.startedAt)} ·{" "}
                                {runningMission.name}
                              </span>
                              <ChevronRightIcon className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                            </button>
                          ) : null}
                          {last ? (
                            <p className="channel-panel__last">
                              {last.author} : {last.body || "pièce jointe"}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!entries.length && needle ? (
          <p className="px-4 py-8 text-center text-body-1 text-[var(--muted-foreground)]">
            Aucun canal ne correspond à cette recherche.
          </p>
        ) : null}
      </div>

      <section className="mobile-list">
        <button
          ref={createTrigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={dialogCategoryId !== null}
          onClick={() => setDialogCategoryId(channelCategories[0]?.id ?? null)}
          className="mobile-row"
        >
          <span className="mobile-row__icon">
            <PlusIcon className="size-4" strokeWidth={1.9} />
          </span>
          <span className="mobile-row__body">
            <span className="mobile-row__title">Créer un canal</span>
            <span className="mobile-row__detail">
              Organiser les échanges autour d'un sujet
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={createSectionOpen}
          onClick={() => setCreateSectionOpen(true)}
          className="mobile-row"
        >
          <span className="mobile-row__icon">
            <PlusIcon className="size-4" strokeWidth={1.9} />
          </span>
          <span className="mobile-row__body">
            <span className="mobile-row__title">Nouvelle section</span>
            <span className="mobile-row__detail">
              Regrouper des canaux dans la navigation
            </span>
          </span>
        </button>
      </section>

      <CreateChannelDialog
        open={dialogCategoryId !== null}
        trigger={createTrigger}
        createChannel={createChannel}
        categories={channelCategories}
        defaultCategoryId={dialogCategoryId ?? undefined}
        onClose={() => setDialogCategoryId(null)}
        onCreated={(id) => {
          setDialogCategoryId(null);
          navigate(orgPath(activeWorkspace.id, `/channels/${id}`));
        }}
      />
      <ChannelDialogs
        actions={channelActions}
        categories={channelCategories}
        channelMessageCounts={messageCounts}
        renameTarget={renameTarget}
        deleteTarget={deleteTarget}
        moveTarget={moveTarget}
        sectionTarget={sectionTarget}
        createSectionOpen={createSectionOpen}
        focusAfterDelete={createTrigger}
        onCloseRename={() => setRenameTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onCloseMove={() => setMoveTarget(null)}
        onCloseSection={() => setSectionTarget(null)}
        onCloseCreateSection={() => setCreateSectionOpen(false)}
        onRequestCreateSection={() => setCreateSectionOpen(true)}
      />
    </div>
  );
}

export function InboxPage() {
  const { items, notify, markAllRead, resolveItem, activeWorkspace } = useApp();
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
      <section className="mobile-inbox lg:hidden" aria-label="File prioritaire">
        <div className="mobile-inbox__toolbar">
          <div className="mobile-inbox__chips" role="group" aria-label="Priorités de la file">
            {(
              [
                ["all", "Tout", items.length],
                ["decisions", "Décisions", stats[0][1] + stats[1][1]],
                ["agents", "Agents", stats[3][1]],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                className={filter === key ? "is-active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mobile-inbox__read"
            disabled={items.length === 0 || allRead}
            onClick={() => {
              markAllRead();
              notify(`${items.length} éléments marqués comme lus`);
            }}
          >
            <CheckCheckIcon aria-hidden="true" size={16} /> Tout lire
          </button>
        </div>
        <div className="mobile-inbox__feed">
          {visible.map((item) => {
            const state = status(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(orgPath(activeWorkspace.id, `/inbox/${item.id}`))}
                className="mobile-card"
              >
                <span className={`mobile-card__dot ${state.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="mobile-card__title block">{item.title}</span>
                  <span className="mobile-card__context block">{item.context}</span>
                  <span className="mobile-card__footer">
                    <Status item={item} />
                    <span className="text-caption-1 text-[var(--muted-foreground)]">{item.agent ? `@${item.agent}` : "Non assigné"}</span>
                    <span className="text-caption-1 text-[var(--text-tertiary)]">{item.age}</span>
                  </span>
                </span>
                <ChevronRightIcon className="mt-1 size-4 shrink-0 text-[var(--text-tertiary)]" />
              </button>
            );
          })}
          {!visible.length ? <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">Aucun élément ne correspond à ce filtre.</p> : null}
        </div>
      </section>
      <div className="hidden flex-col gap-3 lg:flex">
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
        {/* `relative` keeps the sr-only cell inside this scroller: absolutely
            positioned children escape an unpositioned overflow container and
            would stretch the document sideways. */}
        <div className="relative hidden overflow-x-auto lg:block">
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
                        orgPath(activeWorkspace.id, `/inbox/${item.id}`),
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions pour ${item.title}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] data-[state=open]:bg-[var(--muted)]"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        {/* The portal keeps React-tree bubbling: without this,
                            item clicks reach the row's onClick and navigate. */}
                        <DropdownMenuContent
                          align="end"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate(
                                orgPath(activeWorkspace.id, `/inbox/${item.id}`),
                              )
                            }
                          >
                            <ChevronRightIcon /> Ouvrir
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              item.category === "agent_activity" && item.read
                            }
                            onSelect={() => {
                              resolveItem(item.id);
                              notify("Élément marqué comme traité");
                            }}
                          >
                            <CheckIcon /> Marquer traité
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={async () => {
                              try {
                                await navigator.clipboard?.writeText(
                                  `${item.title}\n${item.context}\n${item.preview}`,
                                );
                                notify("Contexte copié dans le presse-papiers");
                              } catch {
                                notify("Contexte prêt à être copié");
                              }
                            }}
                          >
                            <CopyIcon /> Copier le contexte
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
        onClick={() => navigate(orgPath(activeWorkspace.id, "/inbox"))}
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

function TaskForm({
  onCancel,
  onCreated,
  showHeading,
}: {
  onCancel: () => void;
  onCreated: (item: InboxItem) => void;
  showHeading: boolean;
}) {
  const { addTask, notify, activeWorkspace } = useApp();
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
    onCreated(item);
  };
  return (
    <form onSubmit={submit} className="grid gap-5 p-5 sm:p-6">
      {showHeading ? (
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
            Définir une nouvelle mission
          </h2>
          <p className="mt-1 text-body-1 text-[var(--muted-foreground)]">
            L'élément est ajouté à la file puis ouvre sa vue de suivi.
          </p>
        </div>
      ) : null}
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
        <Button type="button" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" variant="primary">
          <PlusIcon className="size-4" /> Créer la mission
        </Button>
      </div>
    </form>
  );
}

export function TaskPage() {
  const { activeWorkspace } = useApp();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <TaskForm
          showHeading
          onCancel={() => navigate(orgPath(activeWorkspace.id, "/inbox"))}
          onCreated={(item) =>
            navigate(orgPath(activeWorkspace.id, `/inbox/${item.id}`))
          }
        />
      </Card>
    </div>
  );
}

function TaskDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { activeWorkspace } = useApp();
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle tâche"
      description="Lancer une mission avec une intention vérifiable."
      maxWidth="max-w-xl"
    >
      <TaskForm
        showHeading={false}
        onCancel={onClose}
        onCreated={(item) => {
          onClose();
          navigate(orgPath(activeWorkspace.id, `/inbox/${item.id}`));
        }}
      />
    </Modal>
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
    renameChannel,
    activeWorkspace,
    profile,
    notify,
    collapsed,
    setCollapsed,
    members,
    selectMember,
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
  const [membersOpen, setMembersOpen] = useState(false);
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

  const publish = (draft: SlackDraft, parentMessageId?: string) => {
    if (!channel) return;
    const attachments = toAttachments(draft.attachments);
    if (!sendMessage(channel.id, draft.body, attachments, parentMessageId)) {
      notify("Écris un message ou ajoute une pièce jointe valide");
    }
  };

  if (!channel)
    return (
      <div className="p-4 lg:p-6">
        <Card className="p-6">
          <h2 className="font-semibold">Canal introuvable</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Ce canal n'existe pas dans {activeWorkspace.name}.
          </p>
          <div className="mt-4">
            <Button
              onClick={() =>
                navigate(orgPath(activeWorkspace.id, "/inbox"))
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
        onSendThreadMessage={(parentId, draft) => publish(draft, parentId)}
        onTabChange={(tab) =>
          updateQuery((next) => {
            if (tab === "messages") next.delete("tab");
            else next.set("tab", tab);
            next.delete("thread");
            next.delete("details");
          })
        }
        onToggleStar={() => toggleStar(channel.id)}
        onShowMembers={() => setMembersOpen(true)}
        onOpenDetails={() =>
          updateQuery((next) => {
            next.delete("tab");
            next.delete("thread");
            next.set("details", "1");
          })
        }
        onUpdateDetails={(patch) => {
          saveChannelInfo(channel.id, patch);
          notify("Informations du canal enregistrées");
        }}
        onRenameChannel={(name) => {
          if (!renameChannel(channel.id, name)) return false;
          notify(`Canal renommé en #${name.trim()}`);
          return true;
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
      <MembersDialog
        open={membersOpen}
        onOpenChange={setMembersOpen}
        members={members}
        workspaceName={activeWorkspace.name}
        onSelectMember={(name) => {
          selectMember(name);
          setMembersOpen(false);
          navigate(orgPath(activeWorkspace.id, "/members"));
        }}
        onOpenPage={() => {
          setMembersOpen(false);
          navigate(orgPath(activeWorkspace.id, "/members"));
        }}
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
                      className="inline-flex size-11 items-center justify-center rounded-[10px] border border-[var(--border-control)] bg-[var(--card)] text-[16px] transition-colors hover:bg-[var(--surface-hover)] lg:size-8"
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
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--border-control)] bg-[var(--card)] px-3 text-body-2-medium transition-colors hover:bg-[var(--surface-hover)] lg:min-h-8"
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
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors lg:h-7 lg:w-12 ${notifications ? "bg-[var(--accent-500)]" : "bg-[var(--input)]"}`}
            >
              <span
                className={`absolute top-1/2 left-1 size-6 -translate-y-1/2 rounded-full bg-white shadow-[var(--shadow-xs)] transition-transform lg:size-5 ${notifications ? "translate-x-6 lg:translate-x-5" : "translate-x-0"}`}
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
      <div className="mt-4">
        <SessionCard />
      </div>
    </div>
  );
}

/** Fake local session, surfaced so sign-out is reachable from the profile. */
function SessionCard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <div>
          <h2 className="font-semibold">Session</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Connecté en tant que {user.email} (démo locale).
          </p>
        </div>
        <Button
          onClick={() => {
            useAuthStore.getState().logout();
            navigate("/login", { replace: true });
          }}
        >
          Se déconnecter
        </Button>
      </div>
    </Card>
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
    navigate(orgPath(workspace.id, "/inbox"));
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
                className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${workspaceToneClasses(workspace.tone)}`}
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
                    navigate(orgPath(workspace.id, "/inbox"));
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
            navigate(orgPath(activeWorkspace.id, "/inbox"), {
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
