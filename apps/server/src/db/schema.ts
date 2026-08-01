import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Les types du domaine vivent dans `@console/core` : l'UI en a besoin, mais
 * elle ne doit pas tirer `drizzle-orm` dans son bundle. On les ré-exporte ici
 * pour que le code serveur continue de les importer depuis le schéma.
 */
export type {
  ArtifactDirection,
  ConnectorTestStatus,
  ConnectorType,
  MessageContent,
  RuntimeHealthStatus,
  RuntimeSshAuth,
  RuntimeTransport,
  ThreadSource,
  Usage,
} from "@console/core/types/domain";

import type {
  ArtifactDirection,
  ConnectorTestStatus,
  ConnectorType,
  MessageContent,
  RuntimeHealthStatus,
  RuntimeSshAuth,
  RuntimeTransport,
  ThreadSource,
  Usage,
} from "@console/core/types/domain";

export type SiteMembershipRole =
  | "admin"
  | "operator"
  | "requester"
  | "approver"
  | "auditor";

export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sites_slug_idx").on(table.slug)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("projects_id_not_empty_check", sql`${table.id} <> ''`),
    uniqueIndex("projects_site_id_idx").on(table.siteId, table.id),
    uniqueIndex("projects_site_slug_idx").on(table.siteId, table.slug),
    index("projects_site_idx").on(table.siteId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    projectId: text("project_id"),
    projectScope: text("project_scope")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(project_id, '')`),
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
    uniqueIndex("agents_site_id_idx").on(table.siteId, table.id),
    uniqueIndex("agents_site_project_scope_id_idx").on(
      table.siteId,
      table.projectScope,
      table.id,
    ),
    uniqueIndex("agents_site_slug_idx").on(table.siteId, table.slug),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "agents_site_project_id_projects_site_id_fk",
    }),
    index("agents_site_idx").on(table.siteId),
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
  /** Révision incrémentée à chaque sauvegarde, utilisée pour lier un probe au setup. */
  configRevision: integer("config_revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Préférences d'inférence globales de la Console, indépendantes des agents. */
export const runtimeModelSettings = pgTable("runtime_model_settings", {
  id: text("id").primaryKey().default("default"),
  provider: text("provider"),
  model: text("model"),
  reasoningEffort: text("reasoning_effort"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Les identités Google admises sont contrôlées par GOOGLE_ALLOWED_EMAILS. */
export const consoleUsers = pgTable("console_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  googleSubject: text("google_subject").notNull().unique(),
  displayName: text("display_name"),
  aiDisclosureVersion: text("ai_disclosure_version"),
  aiDisclosureAcceptedAt: timestamp("ai_disclosure_accepted_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteMemberships = pgTable(
  "site_memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => consoleUsers.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<SiteMembershipRole>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.siteId] }),
    uniqueIndex("site_memberships_actor_scope_idx").on(
      table.userId,
      table.siteId,
      table.role,
    ),
    check(
      "site_memberships_role_check",
      sql`${table.role} IN ('admin', 'operator', 'requester', 'approver', 'auditor')`,
    ),
    index("site_memberships_site_role_idx").on(table.siteId, table.role),
  ],
);

export type AuditDecision = "allowed" | "denied";

export const auditLedgerHeads = pgTable("audit_ledger_heads", {
  targetSiteId: text("target_site_id")
    .primaryKey()
    .references(() => sites.id),
  nextSequence: bigint("next_sequence", { mode: "number" }).notNull().default(1),
  lastEntryHash: text("last_entry_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLedgerEntries = pgTable(
  "audit_ledger_entries",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: text("event_id").notNull(),
    actorSiteId: text("actor_site_id")
      .notNull()
      .references(() => sites.id),
    targetSiteId: text("target_site_id")
      .notNull()
      .references(() => sites.id),
    actorUserId: text("actor_user_id").notNull(),
    actorRole: text("actor_role").notNull().$type<SiteMembershipRole>(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    decision: text("decision").notNull().$type<AuditDecision>(),
    reasonCode: text("reason_code").notNull(),
    beforeState: jsonb("before_state").$type<unknown>().notNull(),
    afterState: jsonb("after_state").$type<unknown>().notNull(),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    previousHash: text("previous_hash"),
    entryHash: text("entry_hash").notNull(),
  },
  (table) => [
    uniqueIndex("audit_ledger_target_event_idx").on(table.targetSiteId, table.eventId),
    uniqueIndex("audit_ledger_target_sequence_idx").on(
      table.targetSiteId,
      table.sequence,
    ),
    index("audit_ledger_target_occurred_idx").on(
      table.targetSiteId,
      table.occurredAt,
    ),
    index("audit_ledger_correlation_idx").on(
      table.targetSiteId,
      table.correlationId,
    ),
    index("audit_ledger_resource_idx").on(
      table.targetSiteId,
      table.resourceType,
      table.resourceId,
    ),
    check("audit_ledger_sequence_positive_check", sql`${table.sequence} > 0`),
    check(
      "audit_ledger_previous_hash_check",
      sql`(${table.sequence} = 1 AND ${table.previousHash} IS NULL) OR (${table.sequence} > 1 AND ${table.previousHash} IS NOT NULL)`,
    ),
    check(
      "audit_ledger_entry_hash_check",
      sql`${table.entryHash} ~ '^[0-9a-f]{64}$' AND (${table.previousHash} IS NULL OR ${table.previousHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "audit_ledger_decision_check",
      sql`${table.decision} IN ('allowed', 'denied')`,
    ),
    check(
      "audit_ledger_reason_code_check",
      sql`btrim(${table.reasonCode}) <> ''`,
    ),
    check(
      "audit_ledger_non_empty_fields_check",
      sql`btrim(${table.eventId}) <> '' AND btrim(${table.action}) <> '' AND btrim(${table.resourceType}) <> '' AND btrim(${table.resourceId}) <> '' AND btrim(${table.correlationId}) <> ''`,
    ),
    check(
      "audit_ledger_denied_state_check",
      sql`${table.decision} <> 'denied' OR ${table.beforeState} = ${table.afterState}`,
    ),
  ],
);

/** Les cookies ne contiennent qu'un secret aléatoire ; seul son hash vit en base. */
export const consoleSessions = pgTable(
  "console_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => consoleUsers.id, { onDelete: "cascade" }),
    siteId: text("site_id"),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "console_sessions_user_site_membership_fk",
    }).onDelete("cascade"),
    index("console_sessions_expires_idx").on(table.expiresAt),
    index("console_sessions_site_idx").on(table.siteId),
  ],
);

/** État éphémère du code flow. Le navigateur ne reçoit que l'état brut. */
export const consoleAuthTransactions = pgTable(
  "console_auth_transactions",
  {
    stateHash: text("state_hash").primaryKey(),
    nonce: text("nonce").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("console_auth_transactions_expires_idx").on(table.expiresAt)],
);

/**
 * La mise en service est une propriété de l'installation, pas d'un compte.
 * Plusieurs opérateurs autorisés retrouvent donc exactement le même point de
 * reprise sans transformer la Console mono-runtime en produit multi-tenant.
 */
export const consoleSetup = pgTable(
  "console_setup",
  {
    id: text("id").primaryKey().default("default"),
    step: text("step")
      .notNull()
      .default("runtime")
      .$type<"runtime" | "agent" | "completed">(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    runtimeVerifiedAt: timestamp("runtime_verified_at", { withTimezone: true }),
    runtimeConfigVersion: text("runtime_config_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "console_setup_completed_proof_check",
      sql`${table.step} <> 'completed' OR (${table.completedAt} IS NOT NULL AND ${table.runtimeVerifiedAt} IS NOT NULL AND ${table.runtimeConfigVersion} IS NOT NULL)`,
    ),
  ],
);


export const connectors = pgTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    projectId: text("project_id"),
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
  (table) => [
    uniqueIndex("connectors_site_id_idx").on(table.siteId, table.id),
    uniqueIndex("connectors_site_type_idx").on(table.siteId, table.type),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "connectors_site_project_id_projects_site_id_fk",
    }),
    index("connectors_site_idx").on(table.siteId),
  ],
);

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    projectId: text("project_id"),
    projectScope: text("project_scope")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(project_id, '')`),
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
    uniqueIndex("threads_site_id_idx").on(table.siteId, table.id),
    uniqueIndex("threads_site_project_scope_id_idx").on(
      table.siteId,
      table.projectScope,
      table.id,
    ),
    uniqueIndex("threads_hermes_conversation_idx").on(table.hermesConversation),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "threads_site_project_id_projects_site_id_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.agentId],
      foreignColumns: [agents.siteId, agents.id],
      name: "threads_site_agent_id_agents_site_id_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.projectScope, table.agentId],
      foreignColumns: [agents.siteId, agents.projectScope, agents.id],
      name: "threads_site_project_scope_agent_id_agents_scope_id_fk",
    }),
    index("threads_agent_idx").on(table.agentId),
    index("threads_source_idx").on(table.source),
    index("threads_site_idx").on(table.siteId),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    projectId: text("project_id"),
    projectScope: text("project_scope")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(project_id, '')`),
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
    uniqueIndex("runs_site_id_idx").on(table.siteId, table.id),
    uniqueIndex("runs_site_project_scope_id_idx").on(
      table.siteId,
      table.projectScope,
      table.id,
    ),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "runs_site_project_id_projects_site_id_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.threadId],
      foreignColumns: [threads.siteId, threads.id],
      name: "runs_site_thread_id_threads_site_id_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.projectScope, table.threadId],
      foreignColumns: [threads.siteId, threads.projectScope, threads.id],
      name: "runs_site_project_scope_thread_id_threads_scope_id_fk",
    }),
    index("runs_thread_created_idx").on(table.threadId, table.createdAt),
    index("runs_status_idx").on(table.status),
    index("runs_site_idx").on(table.siteId),
  ],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id),
    projectId: text("project_id"),
    projectScope: text("project_scope")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(project_id, '')`),
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
    uniqueIndex("artifacts_site_id_idx").on(table.siteId, table.id),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "artifacts_site_project_id_projects_site_id_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.runId],
      foreignColumns: [runs.siteId, runs.id],
      name: "artifacts_site_run_id_runs_site_id_fk",
    }),
    foreignKey({
      columns: [table.siteId, table.projectScope, table.runId],
      foreignColumns: [runs.siteId, runs.projectScope, runs.id],
      name: "artifacts_site_project_scope_run_id_runs_scope_id_fk",
    }),
    index("artifacts_run_idx").on(table.runId),
    index("artifacts_run_direction_idx").on(table.runId, table.direction),
    index("artifacts_site_idx").on(table.siteId),
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
