import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type MessageContent = Array<
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
    }
>;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type RuntimeHealthStatus =
  | "unknown"
  | "healthy"
  | "unreachable"
  | "unauthorized"
  | "missing_feature";

/** `direct` = la Console appelle baseUrl telle quelle. `ssh` = via un tunnel SSH sortant. */
export type RuntimeTransport = "direct" | "ssh";

/** `agent` = binaire `ssh` + ~/.ssh/config (clé, agent, ProxyJump).
 *  `password` = ssh2 avec un mot de passe stocké chiffré. */
export type RuntimeSshAuth = "agent" | "password";

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    provider: text("provider"),
    model: text("model"),
    reasoningEffort: text("reasoning_effort"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agents_slug_idx").on(table.slug),
    index("agents_archived_idx").on(table.archivedAt),
  ],
);

export const runtimeConfig = pgTable("runtime_config", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull().default("Hermes"),
  /** En transport `ssh`, l'URL est celle vue depuis la machine distante. */
  baseUrl: text("base_url").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  transport: text("transport").notNull().default("direct").$type<RuntimeTransport>(),
  sshHost: text("ssh_host"),
  sshPort: integer("ssh_port").notNull().default(22),
  sshUser: text("ssh_user"),
  sshAuth: text("ssh_auth").notNull().default("agent").$type<RuntimeSshAuth>(),
  encryptedSshPassword: text("encrypted_ssh_password"),
  /** Racine du volume de travail côté machine distante (transport `ssh`). */
  remoteWorkdir: text("remote_workdir"),
  detectedVersion: text("detected_version"),
  capabilities: jsonb("capabilities").$type<Record<string, unknown>>(),
  lastHealthStatus: text("last_health_status").notNull().default("unknown").$type<RuntimeHealthStatus>(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConnectorType = "gmail_imap" | "outlook_imap" | "pro_imap";
export type ConnectorTestStatus = "unknown" | "healthy" | "failed";
export type ThreadSource = "chat" | "mission";

export const connectors = pgTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull().$type<ConnectorType>(),
    label: text("label").notNull(),
    email: text("email").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull().default(993),
    encryptedPassword: text("encrypted_password").notNull(),
    lastTestStatus: text("last_test_status")
      .notNull()
      .default("unknown")
      .$type<ConnectorTestStatus>(),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("connectors_type_idx").on(table.type)],
);

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agentName: text("agent_name").notNull(),
    instructions: text("instructions").notNull(),
    provider: text("provider"),
    model: text("model").notNull().default("hermes-agent"),
    reasoningEffort: text("reasoning_effort"),
    source: text("source").notNull().default("chat").$type<ThreadSource>(),
    hermesConversation: text("hermes_conversation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("threads_hermes_conversation_idx").on(table.hermesConversation),
    index("threads_agent_idx").on(table.agentId),
    index("threads_source_idx").on(table.source),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    status: text("status").notNull().default("pending"),
    hermesResponseId: text("hermes_response_id"),
    output: text("output"),
    usage: jsonb("usage").$type<Usage>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    workdir: text("workdir"),
  },
  (table) => [
    index("runs_thread_created_idx").on(table.threadId, table.createdAt),
    index("runs_status_idx").on(table.status),
  ],
);

export type ArtifactDirection = "input" | "output";

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    direction: text("direction").notNull().$type<ArtifactDirection>(),
    filename: text("filename").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("artifacts_run_idx").on(table.runId),
    index("artifacts_run_direction_idx").on(table.runId, table.direction),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    content: jsonb("content").$type<MessageContent>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_thread_created_idx").on(table.threadId, table.createdAt)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("run_events_run_sequence_idx").on(table.runId, table.sequence),
    index("run_events_cursor_idx").on(table.id),
  ],
);
