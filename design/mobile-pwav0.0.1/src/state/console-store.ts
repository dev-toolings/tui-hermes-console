import type { Workspace } from "../components/sidebar/workspace-sidebar";

export const CONSOLE_STORAGE_KEY = "hermes-console:v0.0.1";
export const CONSOLE_STATE_VERSION = 5;

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
/**
 * A named group of channels in the sidebar. Order is the array order, so moving
 * a section is a splice and never a renumbering of its siblings.
 */
export type ChannelCategory = {
  id: string;
  name: string;
};
export type Channel = {
  id: string;
  /** Display label. Mutable, unlike `id`, which is the key messages are filed under. */
  name: string;
  /** References a `ChannelCategory.id` of the same workspace. Never dangling. */
  categoryId: string;
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
  audit: AuditEvent[];
  notifications: boolean;
  selectedMember: string;
  /** Always holds at least one section, so a channel always has a home. */
  channelCategories: ChannelCategory[];
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

/** Shared by channel ids and section ids: both are slugs, never free text. */
const CHANNEL_ID_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
/**
 * The section every channel starts in. Seeded and materialized by the v4→v5
 * migration so that no channel is ever uncategorized, which is what lets the
 * grouping code drop its "no section" branch entirely. It is renameable,
 * movable and deletable like any other section — only "the last section
 * standing" is protected, whichever one that happens to be.
 */
export const DEFAULT_CATEGORY_ID = "canaux";
export const DEFAULT_CATEGORY_NAME = "Canaux";

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
    name: "John Doe",
    role: "opérateur",
    state: "En ligne",
    initials: "JD",
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

/**
 * The single section a migrated or reset workspace starts from. Demo volume
 * lives in the seed (DEMO_CATEGORIES), never here: a v4 payload upgrading to
 * v5 must land on exactly one section.
 */
export function createDefaultChannelCategories(): ChannelCategory[] {
  return [{ id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME }];
}

const DEMO_CATEGORIES: ChannelCategory[] = [
  { id: "produit", name: "Produit" },
  { id: "ingenierie", name: "Ingénierie" },
  { id: "operations", name: "Opérations" },
  { id: "clients", name: "Clients" },
];

export function createDefaultChannels(memberNames: string[] = []): Channel[] {
  return [
    createChannel(
      "general",
      "général",
      memberNames,
      "Annonces et coordination de l’espace",
      "Le point d’entrée commun pour les décisions, les nouvelles et les échanges transverses.",
    ),
    createChannel(
      "équipe",
      "équipe",
      memberNames,
      "Synchronisation de l’équipe",
      "Partagez l’avancement, les demandes d’aide et les informations utiles à l’équipe.",
    ),
    createChannel(
      "incidents",
      "incidents",
      memberNames,
      "Suivi des incidents",
      "Centralisez les alertes, diagnostics et décisions prises pendant un incident.",
    ),
  ];
}

/**
 * Volume for the seeded workspace, spread across DEMO_CATEGORIES. A
 * one-section, three-channel workspace hides every layout problem a real one
 * has: scrolling, truncation and attention grouping only show up here.
 */
export function createDemoChannels(memberNames: string[] = []): Channel[] {
  return DEMO_CHANNELS.map((entry) =>
    createChannel(
      entry.id,
      entry.name,
      memberNames,
      entry.topic,
      entry.topic,
      entry.categoryId,
    ),
  );
}

const DEMO_CHANNELS: Array<{
  id: string;
  name: string;
  categoryId: string;
  topic: string;
}> = [
  { id: "roadmap", name: "roadmap", categoryId: "produit", topic: "Jalons et arbitrages du trimestre" },
  { id: "design-system", name: "design-system", categoryId: "produit", topic: "Tokens, composants et revues d'interface" },
  { id: "recherche", name: "recherche", categoryId: "produit", topic: "Entretiens utilisateurs et enseignements" },
  { id: "tarification", name: "tarification", categoryId: "produit", topic: "Offres, paliers et expérimentations de prix" },
  { id: "backend", name: "backend", categoryId: "ingenierie", topic: "Services, schémas et migrations" },
  { id: "frontend", name: "frontend", categoryId: "ingenierie", topic: "Console, performances et accessibilité" },
  { id: "infra", name: "infra", categoryId: "ingenierie", topic: "Déploiements, réseau et sauvegardes" },
  { id: "revue-de-code", name: "revue-de-code", categoryId: "ingenierie", topic: "Relectures et revues adversariales" },
  { id: "releases", name: "releases", categoryId: "ingenierie", topic: "Fenêtres de livraison et journaux de version" },
  { id: "astreinte", name: "astreinte", categoryId: "operations", topic: "Rotation, escalades et post-mortems" },
  { id: "monitoring", name: "monitoring", categoryId: "operations", topic: "Alertes, seuils et tableaux de bord" },
  { id: "couts-cloud", name: "coûts-cloud", categoryId: "operations", topic: "Consommation, quotas et optimisations" },
  { id: "fournisseurs", name: "fournisseurs", categoryId: "operations", topic: "Contrats, quotas d'API et renouvellements" },
  { id: "support", name: "support", categoryId: "clients", topic: "Demandes entrantes et suivis" },
  { id: "onboarding", name: "onboarding", categoryId: "clients", topic: "Mise en route des nouveaux espaces" },
  { id: "retours", name: "retours", categoryId: "clients", topic: "Verbatims, irritants et demandes récurrentes" },
  { id: "comptes-cles", name: "comptes-clés", categoryId: "clients", topic: "Suivi des comptes stratégiques" },
];

function createChannel(
  id: string,
  name: string,
  memberNames: string[] = [],
  topic = "",
  description = "",
  categoryId = DEFAULT_CATEGORY_ID,
): Channel {
  return {
    id,
    name,
    categoryId,
    createdAt: new Date().toISOString(),
    topic,
    description,
    starred: false,
    isPrivate: false,
    memberNames,
    pinnedMessageIds: [],
  };
}

function seedData(workspace: Workspace): WorkspaceData {
  const memberNames = memberRows.map((member) => member.name);
  const channels = [
    ...createDefaultChannels(memberNames),
    ...createDemoChannels(memberNames),
  ];
  return {
    items: baseItems.map((item, itemIndex) => ({
      ...item,
      id: `${workspace.id}-${item.id}`,
      context: `${workspace.name.toLocaleLowerCase()} · ${item.context}`,
      title: itemIndex === 0 ? `${item.title} — ${workspace.name}` : item.title,
    })),
    members: memberRows.map((member) => ({ ...member })),
    audit: [
      {
        id: `${workspace.id}-seed`,
        level: "info",
        label: `${workspace.name} initialisé localement`,
        time: "à l'instant",
      },
    ],
    notifications: true,
    selectedMember: "John Doe",
    channelCategories: [...createDefaultChannelCategories(), ...DEMO_CATEGORIES],
    channels,
    /* Every channel owes `messages` an entry — the validator rejects a payload
       whose channels and message threads describe different sets. */
    messages: {
      ...Object.fromEntries(channels.map((channel) => [channel.id, []])),
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
    profile: { name: "John Doe", role: "opérateur" },
    workspaceData: Object.fromEntries(
      initialWorkspaces.map((workspace) => [
        workspace.id,
        seedData(workspace),
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

/**
 * Shape shared by every stored version: the collaboration fields and the
 * channel/message coherence. Section validation is version-specific and lives
 * in `isWorkspaceData` alone, so this stays a plain boolean rather than a
 * predicate that would over-promise for legacy shapes.
 */
function isWorkspaceDataWith(
  value: unknown,
  isMessage: (message: unknown) => message is ChannelMessage,
  isDataChannel: (channel: unknown) => boolean,
): boolean {
  if (!isRecord(value)) return false;
  const channels = value.channels;
  const messages = value.messages;
  if (
    !(
    Array.isArray(value.items) &&
    value.items.every(isInboxItem) &&
    Array.isArray(value.members) &&
    value.members.every(isMember) &&
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
  /* No channel id is structural since v5: any channel can be deleted, so the
     only rule left is that messages and channels describe the same set. */
  if (Object.keys(messages).some((channelId) => !channelIds.includes(channelId)))
    return false;

  return channels.every((channel: Channel) => {
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
  if (!isWorkspaceDataWith(value, isChannelMessage, isChannel)) return false;
  const data = value as { channelCategories: unknown; channels: Channel[] };
  const categories = data.channelCategories;
  if (
    !Array.isArray(categories) ||
    categories.length === 0 ||
    !categories.every(isChannelCategory)
  )
    return false;
  const categoryIds = categories.map((category) => category.id);
  if (new Set(categoryIds).size !== categoryIds.length) return false;
  /* A dangling categoryId would leave a channel unreachable in the sidebar,
     so it invalidates the payload rather than being repaired at read time. */
  return data.channels.every((channel) => categoryIds.includes(channel.categoryId));
}

/** v4: channels carried a `kind` and no section. */
function isV4WorkspaceData(value: unknown): boolean {
  return isWorkspaceDataWith(value, isChannelMessage, isV4Channel);
}

function isV3WorkspaceData(value: unknown): boolean {
  return isWorkspaceDataWith(value, isV3ChannelMessage, isLegacyChannel);
}

function isV2WorkspaceData(value: unknown): boolean {
  return isWorkspaceDataWith(value, isV2ChannelMessage, isLegacyChannel);
}

function isChannelCategory(value: unknown): value is ChannelCategory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CHANNEL_ID_PATTERN.test(value.id) &&
    isNonEmptyString(value.name)
  );
}

function isChannel(value: unknown): value is Channel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    CHANNEL_ID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isIsoDate(value.createdAt) &&
    typeof value.categoryId === "string" &&
    CHANNEL_ID_PATTERN.test(value.categoryId) &&
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
    (value.legacyPayload === undefined || value.legacyPayload === true)
  );
}

/**
 * v4 channel: everything v5 has except the section, plus the retired `kind`
 * discriminant. Kept lenient about which ids exist — a v4 payload that lost a
 * seeded channel used to be unloadable, and that reset the whole prototype.
 */
function isV4Channel(value: unknown): boolean {
  return (
    isRecord(value) &&
    isChannel({ ...value, categoryId: DEFAULT_CATEGORY_ID }) &&
    (value.kind === "default" || value.kind === "custom")
  );
}

function isLegacyChannel(value: unknown): boolean {
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
  isData: (data: unknown) => boolean,
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
  isData: (data: unknown) => boolean,
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
  /* v3 and v2 rebuild exactly the v4 channel shape, so they hand over to the
     v4→v5 step instead of duplicating the section materialization. */
  return migrateV4({ ...value, version: 4, workspaceData });
}

function migrateV3(value: unknown): ConsoleState | null {
  return migrateLegacyState(value, 3, isV3WorkspaceData);
}

function migrateV2(value: unknown): ConsoleState | null {
  return migrateLegacyState(value, 2, isV2WorkspaceData);
}

/**
 * v4→v5: sections appear. Every channel joins one materialized default section
 * and drops the `kind` discriminant, whose only remaining job had been to mark
 * three channels as undeletable.
 */
function migrateV4(value: unknown): ConsoleState | null {
  if (!isStateVersion(value, 4, isV4WorkspaceData)) return null;
  const workspaceData = Object.fromEntries(
    Object.entries(value.workspaceData).map(([workspaceId, data]) => [
      workspaceId,
      {
        ...data,
        channelCategories: createDefaultChannelCategories(),
        channels: data.channels.map((channel) => {
          const { kind: _retired, ...rest } = channel as Channel & {
            kind?: unknown;
          };
          return { ...rest, categoryId: DEFAULT_CATEGORY_ID };
        }),
      },
    ]),
  );
  const migrated: ConsoleState = {
    ...value,
    version: CONSOLE_STATE_VERSION,
    workspaceData,
  };
  return isState(migrated) ? migrated : null;
}

function isLegacyWorkspaceData(value: unknown): value is Omit<WorkspaceData, "channelCategories" | "channels" | "messages"> {
  if (!isRecord(value)) return false;
  return Array.isArray(value.items) && value.items.every(isInboxItem) && Array.isArray(value.members) && value.members.every(isMember) && Array.isArray(value.audit) && value.audit.every(isAuditEvent) && typeof value.notifications === "boolean" && typeof value.selectedMember === "string";
}
function migrateV1(value: unknown): ConsoleState | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces) || !value.workspaces.every(isWorkspace) || !Array.isArray(value.archivedWorkspaces) || !value.archivedWorkspaces.every(isWorkspace) || !isRecord(value.workspaceData) || !isRecord(value.profile) || typeof value.profile.name !== "string" || typeof value.profile.role !== "string" || typeof value.activeWorkspaceId !== "string") return null;
  const all = [...value.workspaces, ...value.archivedWorkspaces] as Workspace[];
  if (!all.length || new Set(all.map((workspace) => workspace.id)).size !== all.length || !value.workspaces.some((workspace) => workspace.id === value.activeWorkspaceId)) return null;
  const workspaceData: Record<string, WorkspaceData> = {};
  for (const workspace of all) {
    const data = value.workspaceData[workspace.id]; if (!isLegacyWorkspaceData(data)) return null;
    const seeded = seedData(workspace);
    workspaceData[workspace.id] = { ...data, channelCategories: seeded.channelCategories, channels: seeded.channels, messages: seeded.messages };
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
  return (
    migrateV4(value) ?? migrateV3(value) ?? migrateV2(value) ?? migrateV1(value)
  );
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

/**
 * Comparison key for "is this label already taken". Falls back to the lowercased
 * label when a name has no alphanumeric content at all, so two emoji-only names
 * stay distinguishable instead of both normalizing to the empty string.
 */
function nameKey(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || value.trim().toLocaleLowerCase();
}

/** Renames the label only: the id stays, so messages and links keep resolving. */
export function renameChannel(
  data: WorkspaceData,
  channelId: string,
  name: string,
): WorkspaceData | null {
  const trimmed = name.trim();
  if (!trimmed || !data.channels.some((entry) => entry.id === channelId)) return null;
  if (
    data.channels.some(
      (entry) => entry.id !== channelId && nameKey(entry.name) === nameKey(trimmed),
    )
  )
    return null;
  return updateChannel(data, channelId, (channel) => ({ ...channel, name: trimmed }));
}

/**
 * Drops a channel and its messages in one step. Splitting the two would leave a
 * messages key with no channel, which the validator rejects — and a rejected
 * payload is silently replaced by the seed on the next load.
 */
export function deleteChannel(
  data: WorkspaceData,
  channelId: string,
): WorkspaceData | null {
  if (!data.channels.some((entry) => entry.id === channelId)) return null;
  const { [channelId]: _removed, ...messages } = data.messages;
  return {
    ...data,
    channels: data.channels.filter((entry) => entry.id !== channelId),
    messages,
  };
}

export function createChannelCategory(
  data: WorkspaceData,
  id: string,
  name: string,
): WorkspaceData | null {
  const trimmed = name.trim();
  if (!CHANNEL_ID_PATTERN.test(id) || !trimmed) return null;
  if (
    data.channelCategories.some(
      (category) => category.id === id || nameKey(category.name) === nameKey(trimmed),
    )
  )
    return null;
  return {
    ...data,
    channelCategories: [...data.channelCategories, { id, name: trimmed }],
  };
}

export function renameChannelCategory(
  data: WorkspaceData,
  categoryId: string,
  name: string,
): WorkspaceData | null {
  const trimmed = name.trim();
  if (!trimmed || !data.channelCategories.some((entry) => entry.id === categoryId))
    return null;
  if (
    data.channelCategories.some(
      (entry) => entry.id !== categoryId && nameKey(entry.name) === nameKey(trimmed),
    )
  )
    return null;
  return {
    ...data,
    channelCategories: data.channelCategories.map((entry) =>
      entry.id === categoryId ? { ...entry, name: trimmed } : entry,
    ),
  };
}

/**
 * Deletes a section and hands its channels to the first remaining one. The last
 * section standing cannot be deleted, whichever one it is: channels must always
 * have somewhere to live.
 */
export function deleteChannelCategory(
  data: WorkspaceData,
  categoryId: string,
): WorkspaceData | null {
  if (data.channelCategories.length < 2) return null;
  if (!data.channelCategories.some((entry) => entry.id === categoryId)) return null;
  const channelCategories = data.channelCategories.filter(
    (entry) => entry.id !== categoryId,
  );
  const fallbackId = channelCategories[0].id;
  return {
    ...data,
    channelCategories,
    channels: data.channels.map((channel) =>
      channel.categoryId === categoryId
        ? { ...channel, categoryId: fallbackId }
        : channel,
    ),
  };
}

export function moveChannelToCategory(
  data: WorkspaceData,
  channelId: string,
  categoryId: string,
): WorkspaceData | null {
  if (!data.channelCategories.some((entry) => entry.id === categoryId)) return null;
  return updateChannel(data, channelId, (channel) => ({ ...channel, categoryId }));
}

/** Reorders one section by a single step; the array order is the display order. */
export function moveChannelCategory(
  data: WorkspaceData,
  categoryId: string,
  offset: -1 | 1,
): WorkspaceData | null {
  const index = data.channelCategories.findIndex((entry) => entry.id === categoryId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= data.channelCategories.length) return null;
  const channelCategories = [...data.channelCategories];
  const [moved] = channelCategories.splice(index, 1);
  channelCategories.splice(target, 0, moved);
  return { ...data, channelCategories };
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
