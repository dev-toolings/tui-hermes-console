import type { Workspace } from "../components/sidebar/workspace-sidebar";

export const CONSOLE_STORAGE_KEY = "hermes-console:v0.0.1";
export const CONSOLE_STATE_VERSION = 4;

export type Category =
  | "needs_action"
  | "failure"
  | "agent_activity"
  | "resume"
  | "in_progress";
export type Tone = "warn" | "neg" | "info" | "muted" | "accent";
export type InboxItem = {
  id: string;
  category: Category;
  gate: string | null;
  title: string;
  context: string;
  agent: string | null;
  age: string;
  tone: Tone;
  preview: string;
  read?: boolean;
};
export type Member = {
  name: string;
  role: string;
  state: string;
  initials: string;
};
export type AuditEvent = {
  id: string;
  level: "info" | "attention";
  label: string;
  time: string;
};
export type Channel = {
  id: string;
  name: string;
  kind: "default" | "custom";
  createdAt: string;
  topic: string;
  description: string;
  starred: boolean;
  isPrivate: boolean;
  memberNames: string[];
  pinnedMessageIds: string[];
};
export type ChannelAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
};
export type ChannelMessage = {
  id: string;
  channelId: string;
  author: string;
  body: string;
  createdAt: string;
  attachments?: ChannelAttachment[];
  parentMessageId?: string;
  reactions: ChannelMessageReaction[];
  editedAt?: string;
  broadcastToChannel?: boolean;
  /** Marks a v2 payload kept verbatim even when it exceeds new-input limits. */
  legacyPayload?: true;
};
export type ChannelMessageReaction = { emoji: string; reactors: string[] };
export type ChannelMessageInput = Omit<
  ChannelMessage,
  "reactions" | "editedAt" | "legacyPayload"
> & {
  reactions?: ChannelMessageReaction[];
};
export type ChannelInfoPatch = Partial<Pick<
  Channel,
  "topic" | "description" | "isPrivate"
>>;
export const MAX_CHANNEL_ATTACHMENTS = 8;
export const MAX_CHANNEL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_CHANNEL_ATTACHMENT_NAME_LENGTH = 180;
export const MAX_CHANNEL_ATTACHMENT_TYPE_LENGTH = 120;
export const MAX_CHANNEL_METADATA_ID_LENGTH = 240;
export const MAX_CHANNEL_MESSAGE_LENGTH = 10_000;
export type WorkspaceData = {
  items: InboxItem[];
  members: Member[];
  enabledSkills: string[];
  audit: AuditEvent[];
  notifications: boolean;
  selectedMember: string;
  channels: Channel[];
  messages: Record<string, ChannelMessage[]>;
};
export type Profile = { name: string; role: string };
export type ConsoleState = {
  version: number;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  archivedWorkspaces: Workspace[];
  profile: Profile;
  workspaceData: Record<string, WorkspaceData>;
};

const CHANNEL_ID_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const DEFAULT_CHANNEL_IDS = ["general", "équipe", "incidents"] as const;

const baseItems: InboxItem[] = [
  {
    id: "in-01",
    category: "needs_action",
    gate: "plan",
    title: "Approuver le plan : refonte du parcours de paiement Stripe",
    context: "refonte-checkout · tentative 02",
    agent: "hermes",
    age: "il y a 3 min",
    tone: "warn",
    preview:
      "4 étapes proposées, dont la migration du webhook de confirmation. Aucune étape irréversible.",
  },
  {
    id: "in-02",
    category: "needs_action",
    gate: "technique",
    title: "Valider l'accès en écriture au schéma billing avant migration",
    context: "migration-factures-2024",
    agent: "obiwan",
    age: "il y a 24 min",
    tone: "warn",
    preview:
      "La migration touche 3 tables. Un rollback SQL est joint comme preuve.",
  },
  {
    id: "in-03",
    category: "failure",
    gate: null,
    title: "Migration des factures bloquée : accès refusé",
    context: "migration-factures-2024",
    agent: "obiwan",
    age: "bloqué depuis 3 j",
    tone: "neg",
    preview:
      "GRANT manquant pour le rôle hermes_rw. Personne n'a répondu à la demande d'accès.",
  },
  {
    id: "in-04",
    category: "agent_activity",
    gate: null,
    title: "vador a terminé la revue adversariale",
    context: "refonte-checkout · revue",
    agent: "vador",
    age: "il y a 38 min",
    tone: "info",
    preview: "Deux risques relevés, aucun bloquant.",
  },
  {
    id: "in-05",
    category: "in_progress",
    gate: null,
    title: "Refonte du parcours de paiement en cours",
    context: "refonte-checkout",
    agent: "hermes",
    age: "démarré il y a 14 min",
    tone: "accent",
    preview: "Étape 2/4 : adaptation du webhook.",
  },
];

const initialWorkspaces: Workspace[] = [
  {
    id: "tilvest",
    name: "Ruche tilvest-prod",
    short: "TP",
    tone: "bg-[#5865f2]",
    description: "Opérations de production",
  },
  {
    id: "marketplace",
    name: "Marketplace IA",
    short: "IA",
    tone: "bg-[#ec4899]",
    description: "Produit et acquisition",
  },
  {
    id: "agentik",
    name: "Agentik Lab",
    short: "AL",
    tone: "bg-[#10b981]",
    description: "Expérimentations agents",
  },
  {
    id: "foundation",
    name: "Fondation",
    short: "FN",
    tone: "bg-[#f59e0b]",
    description: "Systèmes et plateforme",
  },
];

const memberRows: Member[] = [
  {
    name: "Kev Tourteau",
    role: "opérateur",
    state: "En ligne",
    initials: "KT",
  },
  { name: "hermes", role: "orchestrateur", state: "Actif", initials: "HE" },
  {
    name: "obiwan",
    role: "implémentation",
    state: "Disponible",
    initials: "OB",
  },
  { name: "padawan", role: "exécution", state: "Occupé", initials: "PA" },
];

export function createDefaultChannels(memberNames: string[] = []): Channel[] {
  return [
    createChannel(
      "general",
      "général",
      "default",
      memberNames,
      "Annonces et coordination de l’espace",
      "Le point d’entrée commun pour les décisions, les nouvelles et les échanges transverses.",
    ),
    createChannel(
      "équipe",
      "équipe",
      "default",
      memberNames,
      "Synchronisation de l’équipe",
      "Partagez l’avancement, les demandes d’aide et les informations utiles à l’équipe.",
    ),
    createChannel(
      "incidents",
      "incidents",
      "default",
      memberNames,
      "Suivi des incidents",
      "Centralisez les alertes, diagnostics et décisions prises pendant un incident.",
    ),
  ];
}

function createChannel(
  id: string,
  name: string,
  kind: Channel["kind"],
  memberNames: string[] = [],
  topic = "",
  description = "",
): Channel {
  return {
    id,
    name,
    kind,
    createdAt: new Date().toISOString(),
    topic,
    description,
    starred: false,
    isPrivate: false,
    memberNames,
    pinnedMessageIds: [],
  };
}

function seedData(workspace: Workspace, index: number): WorkspaceData {
  const channels = createDefaultChannels(memberRows.map((member) => member.name));
  return {
    items: baseItems.map((item, itemIndex) => ({
      ...item,
      id: `${workspace.id}-${item.id}`,
      context: `${workspace.name.toLocaleLowerCase()} · ${item.context}`,
      title: itemIndex === 0 ? `${item.title} — ${workspace.name}` : item.title,
    })),
    members: memberRows.map((member) => ({ ...member })),
    enabledSkills:
      index % 2 === 0
        ? ["pdf-report", "workspace-audit", "postgres-readonly"]
        : ["workspace-audit", "notion-sync"],
    audit: [
      {
        id: `${workspace.id}-seed`,
        level: "info",
        label: `${workspace.name} initialisé localement`,
        time: "à l'instant",
      },
    ],
    notifications: true,
    selectedMember: "Kev Tourteau",
    channels,
    messages: {
      general: [
        {
          id: `${workspace.id}-general-1`,
          channelId: "general",
          author: "hermes",
          body: `Bienvenue dans #général de ${workspace.name}.`,
          createdAt: new Date().toISOString(),
          reactions: [],
        },
      ],
      "équipe": [],
      incidents: [],
    },
  };
}

export function createInitialState(): ConsoleState {
  return {
    version: CONSOLE_STATE_VERSION,
    activeWorkspaceId: initialWorkspaces[0].id,
    workspaces: initialWorkspaces,
    archivedWorkspaces: [],
    profile: { name: "Kev Tourteau", role: "opérateur" },
    workspaceData: Object.fromEntries(
      initialWorkspaces.map((workspace, index) => [
        workspace.id,
        seedData(workspace, index),
      ]),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isWorkspace(value: unknown): value is Workspace {
  return (
    isRecord(value) &&
    ["id", "name", "short", "tone", "description"].every(
      (key) => typeof value[key] === "string",
    )
  );
}

function isMember(value: unknown): value is Member {
  return (
    isRecord(value) &&
    ["name", "role", "state", "initials"].every(
      (key) => typeof value[key] === "string",
    )
  );
}

function isInboxItem(value: unknown): value is InboxItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.context === "string" &&
    typeof value.age === "string" &&
    typeof value.preview === "string" &&
    (value.agent === null || typeof value.agent === "string") &&
    (value.gate === null || typeof value.gate === "string") &&
    [
      "needs_action",
      "failure",
      "agent_activity",
      "resume",
      "in_progress",
    ].includes(String(value.category)) &&
    ["warn", "neg", "info", "muted", "accent"].includes(String(value.tone))
  );
}

function isAuditEvent(value: unknown): value is AuditEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.time === "string" &&
    (value.level === "info" || value.level === "attention")
  );
}

function isWorkspaceDataWith(
  value: unknown,
  isMessage: (message: unknown) => message is ChannelMessage,
  isDataChannel: (channel: unknown) => channel is Channel = isChannel,
): value is WorkspaceData {
  if (!isRecord(value)) return false;
  const channels = value.channels;
  const messages = value.messages;
  if (
    !(
    Array.isArray(value.items) &&
    value.items.every(isInboxItem) &&
    Array.isArray(value.members) &&
    value.members.every(isMember) &&
    Array.isArray(value.enabledSkills) &&
    value.enabledSkills.every((entry) => typeof entry === "string") &&
    Array.isArray(value.audit) &&
    value.audit.every(isAuditEvent) &&
    typeof value.notifications === "boolean" &&
    typeof value.selectedMember === "string" &&
    Array.isArray(channels) &&
    channels.every(isDataChannel) &&
    isRecord(messages)
    )
  ) {
    return false;
  }

  const channelIds = channels.map((channel) => channel.id);
  if (new Set(channelIds).size !== channelIds.length) return false;
  if (
    !DEFAULT_CHANNEL_IDS.every((channelId) =>
      channels.some(
        (channel) => channel.id === channelId && channel.kind === "default",
      ),
    )
  )
    return false;
  if (Object.keys(messages).some((channelId) => !channelIds.includes(channelId)))
    return false;

  return channels.every((channel) => {
    const channelMessages = messages[channel.id];
    return (
      Array.isArray(channelMessages) &&
      channelMessages.every(
        (message) => isMessage(message) && message.channelId === channel.id,
      )
    );
  });
}

function isWorkspaceData(value: unknown): value is WorkspaceData {
  return isWorkspaceDataWith(value, isChannelMessage);
}

function isV3WorkspaceData(value: unknown): value is WorkspaceData {
  return isWorkspaceDataWith(value, isV3ChannelMessage, isLegacyChannel);
}

function isV2WorkspaceData(value: unknown): value is WorkspaceData {
  return isWorkspaceDataWith(value, isV2ChannelMessage, isLegacyChannel);
}

function isChannel(value: unknown): value is Channel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CHANNEL_ID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isIsoDate(value.createdAt) &&
    (value.kind === "default" || value.kind === "custom") &&
    typeof value.topic === "string" &&
    typeof value.description === "string" &&
    typeof value.starred === "boolean" &&
    typeof value.isPrivate === "boolean" &&
    Array.isArray(value.memberNames) &&
    value.memberNames.every(isNonEmptyString) &&
    new Set(value.memberNames).size === value.memberNames.length &&
    Array.isArray(value.pinnedMessageIds) &&
    value.pinnedMessageIds.every(isNonEmptyString) &&
    new Set(value.pinnedMessageIds).size === value.pinnedMessageIds.length
  );
}

function isChannelMessage(value: unknown): value is ChannelMessage {
  const attachments = isRecord(value) ? value.attachments : undefined;
  const reactions = isRecord(value) ? value.reactions : undefined;
  const isPreservedLegacy = isRecord(value) && value.legacyPayload === true;
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (isPreservedLegacy || value.id.length <= MAX_CHANNEL_METADATA_ID_LENGTH) &&
    typeof value.channelId === "string" &&
    CHANNEL_ID_PATTERN.test(value.channelId) &&
    typeof value.author === "string" &&
    value.author.trim().length > 0 &&
    typeof value.body === "string" &&
    (value.body.trim().length > 0 ||
      (Array.isArray(attachments) && attachments.length > 0)) &&
    (isPreservedLegacy || value.body.length <= MAX_CHANNEL_MESSAGE_LENGTH) &&
    isIsoDate(value.createdAt) &&
    (attachments === undefined ||
      (Array.isArray(attachments) &&
        (isPreservedLegacy
          ? attachments.every(isV2ChannelAttachment)
          : attachments.length <= MAX_CHANNEL_ATTACHMENTS &&
            attachments.every(isChannelAttachment)))) &&
    Array.isArray(reactions) &&
    reactions.every(isChannelMessageReaction) &&
    new Set(reactions.map((reaction) => reaction.emoji)).size === reactions.length &&
    (value.parentMessageId === undefined || isNonEmptyString(value.parentMessageId)) &&
    (value.editedAt === undefined || isIsoDate(value.editedAt)) &&
    (value.broadcastToChannel === undefined || typeof value.broadcastToChannel === "boolean") &&
    (value.legacyPayload === undefined || value.legacyPayload === true)
  );
}

function isLegacyChannel(value: unknown): value is Channel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CHANNEL_ID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    (value.kind === "default" || value.kind === "custom")
  );
}

function isV3ChannelMessage(value: unknown): value is ChannelMessage {
  const attachments = isRecord(value) ? value.attachments : undefined;
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= MAX_CHANNEL_METADATA_ID_LENGTH &&
    typeof value.channelId === "string" &&
    CHANNEL_ID_PATTERN.test(value.channelId) &&
    typeof value.author === "string" &&
    value.author.trim().length > 0 &&
    typeof value.body === "string" &&
    (value.body.trim().length > 0 ||
      (Array.isArray(attachments) && attachments.length > 0)) &&
    value.body.length <= MAX_CHANNEL_MESSAGE_LENGTH &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    (attachments === undefined ||
      (Array.isArray(attachments) &&
        attachments.length <= MAX_CHANNEL_ATTACHMENTS &&
        attachments.every(isChannelAttachment)))
  );
}

function isChannelMessageReaction(value: unknown): value is ChannelMessageReaction {
  return (
    isRecord(value) &&
    isNonEmptyString(value.emoji) &&
    Array.isArray(value.reactors) &&
    value.reactors.every(isNonEmptyString) &&
    value.reactors.length > 0 &&
    new Set(value.reactors).size === value.reactors.length
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isChannelAttachment(value: unknown): value is ChannelAttachment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= MAX_CHANNEL_METADATA_ID_LENGTH &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= MAX_CHANNEL_ATTACHMENT_NAME_LENGTH &&
    typeof value.type === "string" &&
    value.type.length <= MAX_CHANNEL_ATTACHMENT_TYPE_LENGTH &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    value.size <= MAX_CHANNEL_ATTACHMENT_BYTES &&
    typeof value.lastModified === "number" &&
    Number.isFinite(value.lastModified) &&
    value.lastModified >= 0
  );
}

function isV2ChannelMessage(value: unknown): value is ChannelMessage {
  const attachments = isRecord(value) ? value.attachments : undefined;
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.channelId === "string" &&
    CHANNEL_ID_PATTERN.test(value.channelId) &&
    typeof value.author === "string" &&
    value.author.trim().length > 0 &&
    typeof value.body === "string" &&
    (value.body.trim().length > 0 ||
      (Array.isArray(attachments) && attachments.length > 0)) &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    (attachments === undefined ||
      (Array.isArray(attachments) && attachments.every(isV2ChannelAttachment)))
  );
}

function isV2ChannelAttachment(value: unknown): value is ChannelAttachment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.lastModified === "number" &&
    Number.isFinite(value.lastModified) &&
    value.lastModified >= 0
  );
}

function isStateVersion(
  value: unknown,
  version: number,
  isData: (data: unknown) => data is WorkspaceData,
): value is ConsoleState {
  if (!isRecord(value) || value.version !== version) return false;
  if (
    !Array.isArray(value.workspaces) ||
    value.workspaces.length === 0 ||
    !value.workspaces.every(isWorkspace)
  )
    return false;
  if (
    !Array.isArray(value.archivedWorkspaces) ||
    !value.archivedWorkspaces.every(isWorkspace)
  )
    return false;
  const workspaceIds = [...value.workspaces, ...value.archivedWorkspaces].map(
    (workspace) => workspace.id,
  );
  if (new Set(workspaceIds).size !== workspaceIds.length) return false;
  if (
    !isRecord(value.profile) ||
    typeof value.profile.name !== "string" ||
    typeof value.profile.role !== "string"
  )
    return false;
  if (
    !isRecord(value.workspaceData) ||
    typeof value.activeWorkspaceId !== "string"
  )
    return false;
  if (
    !value.workspaces.some(
      (workspace) => workspace.id === value.activeWorkspaceId,
    )
  )
    return false;
  const workspaceData = value.workspaceData;
  return [...value.workspaces, ...value.archivedWorkspaces].every((workspace) =>
    isData(workspaceData[workspace.id]),
  );
}

function isState(value: unknown): value is ConsoleState {
  return isStateVersion(value, CONSOLE_STATE_VERSION, isWorkspaceData);
}

function sanitizeLegacyMessage(
  message: ChannelMessage,
  messageIds: ReadonlySet<string>,
  order: number,
  preserveOverflow = false,
): ChannelMessage | null {
  const {
    parentMessageId: legacyParentMessageId,
    reactions: legacyReactions,
    editedAt: legacyEditedAt,
    broadcastToChannel: legacyBroadcastToChannel,
    ...baseMessage
  } = message;
  const body = preserveOverflow
    ? message.body
    : message.body.slice(0, MAX_CHANNEL_MESSAGE_LENGTH);
  const attachments = preserveOverflow
    ? (message.attachments ?? []).map((attachment) => ({ ...attachment }))
    : (message.attachments ?? [])
        .filter(
          (attachment) => attachment.size <= MAX_CHANNEL_ATTACHMENT_BYTES,
        )
        .slice(0, MAX_CHANNEL_ATTACHMENTS)
        .map((attachment) => ({
          ...attachment,
          id: attachment.id.slice(0, MAX_CHANNEL_METADATA_ID_LENGTH),
          name: attachment.name
            .trim()
            .slice(0, MAX_CHANNEL_ATTACHMENT_NAME_LENGTH),
          type: attachment.type.slice(0, MAX_CHANNEL_ATTACHMENT_TYPE_LENGTH),
        }))
        .filter(
          (attachment) => attachment.id.length > 0 && attachment.name.length > 0,
        );

  if (!body.trim() && attachments.length === 0) return null;
  const parentMessageId =
    isNonEmptyString(legacyParentMessageId) &&
    legacyParentMessageId !== message.id &&
    messageIds.has(legacyParentMessageId)
      ? legacyParentMessageId
      : undefined;
  return {
    ...baseMessage,
    id: preserveOverflow
      ? message.id
      : message.id.slice(0, MAX_CHANNEL_METADATA_ID_LENGTH),
    body,
    createdAt: toIsoDate(message.createdAt, order),
    reactions: sanitizeReactions(legacyReactions),
    ...(parentMessageId ? { parentMessageId } : {}),
    ...(isIsoDate(legacyEditedAt) ? { editedAt: legacyEditedAt } : {}),
    ...(parentMessageId && legacyBroadcastToChannel
      ? { broadcastToChannel: true }
      : {}),
    ...(preserveOverflow ? { legacyPayload: true as const } : {}),
    ...(attachments.length > 0 ? { attachments } : { attachments: undefined }),
  };
}

function sanitizeReactions(value: unknown): ChannelMessageReaction[] {
  if (!Array.isArray(value)) return [];
  const emojis = new Set<string>();
  return value.flatMap((reaction) => {
    if (!isRecord(reaction) || !isNonEmptyString(reaction.emoji)) return [];
    if (emojis.has(reaction.emoji)) return [];
    const reactors = Array.isArray(reaction.reactors)
      ? [...new Set(reaction.reactors.filter(isNonEmptyString))]
      : [];
    if (!reactors.length) return [];
    emojis.add(reaction.emoji);
    return [{ emoji: reaction.emoji, reactors }];
  });
}

function toIsoDate(value: unknown, order: number): string {
  if (isIsoDate(value)) return value;
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return new Date(Date.UTC(2020, 0, 1, 0, 0, 0, order)).toISOString();
}

function migrateLegacyState(
  value: unknown,
  version: number,
  isData: (data: unknown) => data is WorkspaceData,
): ConsoleState | null {
  if (!isStateVersion(value, version, isData)) return null;
  const workspaceData = Object.fromEntries(
    Object.entries(value.workspaceData).map(([workspaceId, data]) => {
      const memberNames = [...new Set(data.members.map((member) => member.name))];
      const messages = Object.fromEntries(
        data.channels.map((channel) => {
          const channelMessages = data.messages[channel.id];
          const ids = new Set(channelMessages.map((message) => message.id));
          return [
            channel.id,
            channelMessages
              .map((message, index) =>
                sanitizeLegacyMessage(message, ids, index, version === 2),
              )
              .filter((message): message is ChannelMessage => message !== null),
          ];
        }),
      );
      return [
        workspaceId,
        {
          ...data,
          channels: data.channels.map((channel, index) => ({
            ...channel,
            createdAt: toIsoDate(channel.createdAt, index),
            topic: "",
            description: "",
            starred: false,
            isPrivate: false,
            memberNames,
            pinnedMessageIds: [],
          })),
          messages,
        },
      ];
    }),
  );
  const migrated: ConsoleState = {
    ...value,
    version: CONSOLE_STATE_VERSION,
    workspaceData,
  };
  return isState(migrated) ? migrated : null;
}

function migrateV3(value: unknown): ConsoleState | null {
  return migrateLegacyState(value, 3, isV3WorkspaceData);
}

function migrateV2(value: unknown): ConsoleState | null {
  return migrateLegacyState(value, 2, isV2WorkspaceData);
}

function isLegacyWorkspaceData(value: unknown): value is Omit<WorkspaceData, "channels" | "messages"> {
  if (!isRecord(value)) return false;
  return Array.isArray(value.items) && value.items.every(isInboxItem) && Array.isArray(value.members) && value.members.every(isMember) && Array.isArray(value.enabledSkills) && value.enabledSkills.every((entry) => typeof entry === "string") && Array.isArray(value.audit) && value.audit.every(isAuditEvent) && typeof value.notifications === "boolean" && typeof value.selectedMember === "string";
}
function migrateV1(value: unknown): ConsoleState | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces) || !value.workspaces.every(isWorkspace) || !Array.isArray(value.archivedWorkspaces) || !value.archivedWorkspaces.every(isWorkspace) || !isRecord(value.workspaceData) || !isRecord(value.profile) || typeof value.profile.name !== "string" || typeof value.profile.role !== "string" || typeof value.activeWorkspaceId !== "string") return null;
  const all = [...value.workspaces, ...value.archivedWorkspaces] as Workspace[];
  if (!all.length || new Set(all.map((workspace) => workspace.id)).size !== all.length || !value.workspaces.some((workspace) => workspace.id === value.activeWorkspaceId)) return null;
  const workspaceData: Record<string, WorkspaceData> = {};
  for (const workspace of all) {
    const data = value.workspaceData[workspace.id]; if (!isLegacyWorkspaceData(data)) return null;
    const seeded = seedData(workspace, 0);
    workspaceData[workspace.id] = { ...data, channels: seeded.channels, messages: seeded.messages };
  }
  return { version: CONSOLE_STATE_VERSION, activeWorkspaceId: value.activeWorkspaceId, workspaces: value.workspaces as Workspace[], archivedWorkspaces: value.archivedWorkspaces as Workspace[], profile: { name: value.profile.name, role: value.profile.role }, workspaceData };
}

export function loadConsoleState(): ConsoleState {
  try {
    const raw = localStorage.getItem(CONSOLE_STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed: unknown = JSON.parse(raw);
    return migrateConsoleState(parsed) ?? createInitialState();
  } catch {
    return createInitialState();
  }
}

/** Converts persisted state without consulting localStorage, for tests and import paths. */
export function migrateConsoleState(value: unknown): ConsoleState | null {
  if (isState(value)) return value;
  return migrateV3(value) ?? migrateV2(value) ?? migrateV1(value);
}

export function saveConsoleState(state: ConsoleState) {
  try {
    localStorage.setItem(CONSOLE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* local console remains usable when storage is unavailable */
  }
}

export function readLocalPreference(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalPreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preferences remain usable in memory */
  }
}

/** Local prototype visibility rule; real authorization must remain server-side. */
export function canAccessChannel(channel: Channel, memberName: string): boolean {
  return !channel.isPrivate || channel.memberNames.includes(memberName);
}

/** Appends a validated root message or thread reply to one channel. */
export function sendChannelMessage(
  data: WorkspaceData,
  input: ChannelMessageInput,
): WorkspaceData | null {
  const channel = data.channels.find((entry) => entry.id === input.channelId);
  if (!channel || data.messages[input.channelId] === undefined) return null;
  if (
    Object.values(data.messages)
      .flat()
      .some((message) => message.id === input.id)
  )
    return null;

  const parentMessageId = input.parentMessageId;
  if (
    parentMessageId !== undefined &&
    !data.messages[input.channelId].some((message) => message.id === parentMessageId)
  )
    return null;

  const message: ChannelMessage = {
    ...input,
    body: input.body.trim(),
    reactions: sanitizeReactions(input.reactions),
    ...(parentMessageId ? { parentMessageId } : {}),
    ...(parentMessageId && input.broadcastToChannel
      ? { broadcastToChannel: true }
      : {}),
  };
  if (!isChannelMessage(message)) return null;
  return {
    ...data,
    messages: {
      ...data.messages,
      [input.channelId]: [...data.messages[input.channelId], message],
    },
  };
}

/** Adds or removes one member from an emoji reaction on a message. */
export function toggleMessageReaction(
  data: WorkspaceData,
  channelId: string,
  messageId: string,
  emoji: string,
  memberName: string,
): WorkspaceData | null {
  if (!isNonEmptyString(emoji) || !isNonEmptyString(memberName)) return null;
  return updateMessage(data, channelId, messageId, (message) => {
    const current = message.reactions.find((reaction) => reaction.emoji === emoji);
    const reactions = current
      ? current.reactors.includes(memberName)
        ? message.reactions
            .map((reaction) =>
              reaction.emoji === emoji
                ? {
                    ...reaction,
                    reactors: reaction.reactors.filter((name) => name !== memberName),
                  }
                : reaction,
            )
            .filter((reaction) => reaction.reactors.length > 0)
        : message.reactions.map((reaction) =>
            reaction.emoji === emoji
              ? { ...reaction, reactors: [...reaction.reactors, memberName] }
              : reaction,
          )
      : [...message.reactions, { emoji, reactors: [memberName] }];
    return { ...message, reactions };
  });
}

/** Pins or unpins a message in its channel metadata. */
export function setMessagePinned(
  data: WorkspaceData,
  channelId: string,
  messageId: string,
  pinned: boolean,
): WorkspaceData | null {
  if (!data.messages[channelId]?.some((message) => message.id === messageId)) return null;
  const channel = data.channels.find((entry) => entry.id === channelId);
  if (!channel) return null;
  const pinnedMessageIds = pinned
    ? [...new Set([...channel.pinnedMessageIds, messageId])]
    : channel.pinnedMessageIds.filter((id) => id !== messageId);
  return {
    ...data,
    channels: data.channels.map((entry) =>
      entry.id === channelId ? { ...entry, pinnedMessageIds } : entry,
    ),
  };
}

/** Edits a message only when its author matches the supplied actor. */
export function editChannelMessage(
  data: WorkspaceData,
  channelId: string,
  messageId: string,
  actor: string,
  body: string,
  editedAt: string,
): WorkspaceData | null {
  if (!isNonEmptyString(actor) || !isIsoDate(editedAt)) return null;
  return updateMessage(data, channelId, messageId, (message) => {
    if (message.author !== actor) return null;
    const next = { ...message, body: body.trim(), editedAt };
    return isChannelMessage(next) ? next : null;
  });
}

/** Deletes an owned message and descendants in its thread, including stale pins. */
export function deleteChannelMessage(
  data: WorkspaceData,
  channelId: string,
  messageId: string,
  actor: string,
): WorkspaceData | null {
  const messages = data.messages[channelId];
  const target = messages?.find((message) => message.id === messageId);
  if (!target || target.author !== actor) return null;
  const deletedIds = new Set([messageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const message of messages) {
      if (message.parentMessageId && deletedIds.has(message.parentMessageId)) {
        changed ||= !deletedIds.has(message.id);
        deletedIds.add(message.id);
      }
    }
  }
  return {
    ...data,
    channels: data.channels.map((channel) =>
      channel.id === channelId
        ? {
            ...channel,
            pinnedMessageIds: channel.pinnedMessageIds.filter(
              (id) => !deletedIds.has(id),
            ),
          }
        : channel,
    ),
    messages: {
      ...data.messages,
      [channelId]: messages.filter((message) => !deletedIds.has(message.id)),
    },
  };
}

export function updateChannelInfo(
  data: WorkspaceData,
  channelId: string,
  patch: ChannelInfoPatch,
): WorkspaceData | null {
  if (
    (patch.topic !== undefined && typeof patch.topic !== "string") ||
    (patch.description !== undefined && typeof patch.description !== "string") ||
    (patch.isPrivate !== undefined && typeof patch.isPrivate !== "boolean")
  )
    return null;
  return updateChannel(data, channelId, (channel) => ({ ...channel, ...patch }));
}

export function updateChannelMembers(
  data: WorkspaceData,
  channelId: string,
  memberNames: readonly string[],
): WorkspaceData | null {
  if (!memberNames.every(isNonEmptyString)) return null;
  return updateChannel(data, channelId, (channel) => ({
    ...channel,
    memberNames: [...new Set(memberNames.map((name) => name.trim()))],
  }));
}

export function toggleChannelStar(
  data: WorkspaceData,
  channelId: string,
): WorkspaceData | null {
  return updateChannel(data, channelId, (channel) => ({
    ...channel,
    starred: !channel.starred,
  }));
}

function updateChannel(
  data: WorkspaceData,
  channelId: string,
  update: (channel: Channel) => Channel,
): WorkspaceData | null {
  const channel = data.channels.find((entry) => entry.id === channelId);
  if (!channel) return null;
  const next = update(channel);
  if (!isChannel(next)) return null;
  return {
    ...data,
    channels: data.channels.map((entry) => (entry.id === channelId ? next : entry)),
  };
}

function updateMessage(
  data: WorkspaceData,
  channelId: string,
  messageId: string,
  update: (message: ChannelMessage) => ChannelMessage | null,
): WorkspaceData | null {
  const messages = data.messages[channelId];
  const message = messages?.find((entry) => entry.id === messageId);
  if (!message) return null;
  const next = update(message);
  if (!next || !isChannelMessage(next)) return null;
  return {
    ...data,
    messages: {
      ...data.messages,
      [channelId]: messages.map((entry) => (entry.id === messageId ? next : entry)),
    },
  };
}

export function addAudit(
  data: WorkspaceData,
  label: string,
  level: AuditEvent["level"] = "info",
): WorkspaceData {
  return {
    ...data,
    audit: [
      {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        level,
        label,
        time: "à l'instant",
      },
      ...data.audit,
    ],
  };
}
