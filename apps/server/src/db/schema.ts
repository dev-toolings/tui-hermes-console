import {
  bigint,
  boolean,
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
  RuntimeWorkspaceStatus,
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
  RuntimeWorkspaceStatus,
  ThreadSource,
  Usage,
} from "@console/core/types/domain";

export type SiteMembershipRole =
  | "admin"
  | "operator"
  | "requester"
  | "approver"
  | "auditor";

export type OrganizationKind = "client" | "msp";

export type ApprovalRequestState = "pending" | "claimed" | "resolved" | "expired";
export type ApprovalOutcome = "once" | "deny";

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: text("kind").notNull().$type<OrganizationKind>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organizations_slug_idx").on(table.slug),
    check("organizations_kind_check", sql`${table.kind} IN ('client', 'msp')`),
  ],
);

export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey(),
    clientOrganizationId: text("client_organization_id")
      .notNull()
      .references(() => organizations.id),
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
    ownerUserId: text("owner_user_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => consoleUsers.id),
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
    foreignKey({
      columns: [table.ownerUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "agents_owner_site_membership_fk",
    }),
    index("agents_site_idx").on(table.siteId),
    index("agents_site_owner_idx").on(table.siteId, table.ownerUserId),
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
  /** Chemin correspondant vu depuis Hermes (différent du chemin hôte en Docker). */
  remoteHermesWorkdir: text("remote_hermes_workdir"),
  workspaceStatus: text("workspace_status")
    .notNull()
    .default("not_required")
    .$type<RuntimeWorkspaceStatus>(),
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

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => consoleUsers.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index("organization_memberships_organization_idx").on(table.organizationId),
  ],
);

export const siteMemberships = pgTable(
  "site_memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => consoleUsers.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull().$type<SiteMembershipRole>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.siteId] }),
    foreignKey({
      columns: [table.userId, table.organizationId],
      foreignColumns: [organizationMemberships.userId, organizationMemberships.organizationId],
      name: "site_memberships_user_organization_membership_fk",
    }),
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

export const mspMandates = pgTable(
  "msp_mandates",
  {
    id: text("id").primaryKey(),
    operatorOrganizationId: text("operator_organization_id")
      .notNull()
      .references(() => organizations.id),
    clientOrganizationId: text("client_organization_id")
      .notNull()
      .references(() => organizations.id),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "msp_mandates_site_project_fk",
    }),
    index("msp_mandates_scope_idx").on(
      table.siteId,
      table.projectId,
      table.operatorOrganizationId,
    ),
    uniqueIndex("msp_mandates_site_id_unique").on(table.siteId, table.id),
    check(
      "msp_mandates_distinct_organizations_check",
      sql`${table.operatorOrganizationId} <> ${table.clientOrganizationId}`,
    ),
    check(
      "msp_mandates_time_window_check",
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`,
    ),
  ],
);

export const mspMandateAssignments = pgTable(
  "msp_mandate_assignments",
  {
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mspMandates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => consoleUsers.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.mandateId, table.userId] }),
    foreignKey({
      columns: [table.userId, table.organizationId],
      foreignColumns: [organizationMemberships.userId, organizationMemberships.organizationId],
      name: "msp_mandate_assignments_user_organization_fk",
    }),
    index("msp_mandate_assignments_user_idx").on(table.userId, table.organizationId),
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
    // Les entrées historiques v1 n'avaient pas de snapshot organisationnel.
    // Elles restent vérifiables sans être réécrites; les nouvelles écritures
    // v2 les renseignent toujours via appendAuditEntry.
    actorOrganizationId: text("actor_organization_id").references(() => organizations.id),
    clientOrganizationId: text("client_organization_id").references(() => organizations.id),
    mandateId: text("mandate_id").references(() => mspMandates.id),
    envelopeVersion: integer("envelope_version").notNull().default(1),
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
      "audit_ledger_envelope_version_check",
      sql`${table.envelopeVersion} IN (1, 2)`,
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

export const siteDataLifecyclePolicies = pgTable(
  "site_data_lifecycle_policies",
  {
    siteId: text("site_id")
      .primaryKey()
      .references(() => sites.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    retentionDays: integer("retention_days").notNull(),
    legalHoldEnabled: boolean("legal_hold_enabled").notNull().default(false),
    legalHoldReason: text("legal_hold_reason"),
    updatedByUserId: text("updated_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("site_data_lifecycle_retention_days_check", sql`${table.retentionDays} BETWEEN 1 AND 3650`),
    check("site_data_lifecycle_version_check", sql`${table.version} > 0`),
    check("site_data_lifecycle_hold_check", sql`(${table.legalHoldEnabled} IN (true, false))`),
    check(
      "site_data_lifecycle_hold_reason_check",
      sql`${table.legalHoldEnabled} = false OR (${table.legalHoldReason} IS NOT NULL AND btrim(${table.legalHoldReason}) <> '')`,
    ),
    foreignKey({
      columns: [table.updatedByUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "site_data_lifecycle_policy_author_fk",
    }),
  ],
);

export const dataLifecyclePreviews = pgTable(
  "data_lifecycle_previews",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    policyVersion: integer("policy_version").notNull(),
    retentionDays: integer("retention_days").notNull(),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
    manifestSha256: text("manifest_sha256").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    cleanupPending: boolean("cleanup_pending").notNull().default(false),
  },
  (table) => [
    uniqueIndex("data_lifecycle_previews_site_id_idx").on(table.siteId, table.id),
    index("data_lifecycle_previews_site_created_idx").on(table.siteId, table.createdAt),
    check("data_lifecycle_previews_manifest_hash_check", sql`${table.manifestSha256} ~ '^[0-9a-f]{64}$'`),
    foreignKey({
      columns: [table.createdByUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "data_lifecycle_preview_author_fk",
    }),
  ],
);

export const dataLifecyclePreviewItems = pgTable(
  "data_lifecycle_preview_items",
  {
    previewId: text("preview_id")
      .notNull()
      .references(() => dataLifecyclePreviews.id, { onDelete: "cascade" }),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull().default("thread"),
    resourceId: text("resource_id").notNull(),
    activityAt: timestamp("activity_at", { withTimezone: true }).notNull(),
    runCount: integer("run_count").notNull(),
    messageCount: integer("message_count").notNull(),
    artifactCount: integer("artifact_count").notNull(),
    artifactBytes: bigint("artifact_bytes", { mode: "number" }).notNull(),
    runIds: jsonb("run_ids").$type<string[]>().notNull(),
    artifactHashes: jsonb("artifact_hashes").$type<string[]>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.previewId, table.resourceType, table.resourceId] }),
    index("data_lifecycle_preview_items_site_idx").on(table.siteId, table.resourceId),
    foreignKey({
      columns: [table.siteId, table.previewId],
      foreignColumns: [dataLifecyclePreviews.siteId, dataLifecyclePreviews.id],
      name: "data_lifecycle_preview_items_preview_site_fk",
    }),
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
    mandateId: text("mandate_id").references(() => mspMandates.id, {
      onDelete: "set null",
    }),
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
    foreignKey({
      columns: [table.siteId, table.mandateId],
      foreignColumns: [mspMandates.siteId, mspMandates.id],
      name: "console_sessions_site_mandate_fk",
    }).onDelete("set null"),
    index("console_sessions_expires_idx").on(table.expiresAt),
    index("console_sessions_site_idx").on(table.siteId),
    index("console_sessions_mandate_idx").on(table.mandateId),
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
    ownerUserId: text("owner_user_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => consoleUsers.id),
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
    foreignKey({
      columns: [table.ownerUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "connectors_owner_site_membership_fk",
    }),
    index("connectors_site_idx").on(table.siteId),
    index("connectors_site_owner_idx").on(table.siteId, table.ownerUserId),
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
    ownerUserId: text("owner_user_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => consoleUsers.id),
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
    uniqueIndex("threads_site_project_scope_id_owner_idx").on(
      table.siteId,
      table.projectScope,
      table.id,
      table.ownerUserId,
    ),
    uniqueIndex("threads_hermes_conversation_idx").on(table.hermesConversation),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "threads_site_project_id_projects_site_id_fk",
    }),
    foreignKey({
      columns: [table.ownerUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "threads_owner_site_membership_fk",
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
    index("threads_site_owner_idx").on(table.siteId, table.ownerUserId),
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
    ownerUserId: text("owner_user_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => consoleUsers.id),
    mandateId: text("mandate_id").references(() => mspMandates.id, {
      onDelete: "set null",
    }),
    operatorOrganizationId: text("operator_organization_id").references(
      () => organizations.id,
    ),
    clientOrganizationId: text("client_organization_id").references(
      () => organizations.id,
    ),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    status: text("status").notNull().default("pending"),
    hermesResponseId: text("hermes_response_id"),
    output: text("output"),
    usage: jsonb("usage").$type<Usage>(),
    error: text("error"),
    // Nonce for the one in-flight approval relay. A claim is cleared only
    // after the remote decision is durably observed or explicitly released.
    approvalClaimId: text("approval_claim_id"),
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
    uniqueIndex("runs_site_project_scope_id_owner_idx").on(
      table.siteId,
      table.projectScope,
      table.id,
      table.ownerUserId,
    ),
    foreignKey({
      columns: [table.siteId, table.projectId],
      foreignColumns: [projects.siteId, projects.id],
      name: "runs_site_project_id_projects_site_id_fk",
    }),
    foreignKey({
      columns: [table.ownerUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "runs_owner_site_membership_fk",
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
    foreignKey({
      columns: [table.siteId, table.projectScope, table.threadId, table.ownerUserId],
      foreignColumns: [
        threads.siteId,
        threads.projectScope,
        threads.id,
        threads.ownerUserId,
      ],
      name: "runs_thread_owner_fk",
    }),
    index("runs_thread_created_idx").on(table.threadId, table.createdAt),
    index("runs_status_idx").on(table.status),
    index("runs_site_idx").on(table.siteId),
    index("runs_site_owner_idx").on(table.siteId, table.ownerUserId),
    index("runs_site_mandate_status_idx").on(
      table.siteId,
      table.mandateId,
      table.status,
    ),
    index("runs_approval_claim_idx").on(table.siteId, table.approvalClaimId),
  ],
);

/**
 * Persisted approval.request state. This is deliberately independent from the
 * run approval claim: it records the exact Hermes request and gives the local
 * service a nonce/TTL/CAS boundary before any future remote relay integration.
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    hermesRunId: text("hermes_run_id").notNull(),
    approvalRequestId: text("approval_request_id").notNull(),
    nonce: text("nonce").notNull(),
    claimState: text("claim_state")
      .notNull()
      .default("pending")
      .$type<ApprovalRequestState>(),
    outcome: text("outcome").$type<ApprovalOutcome>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("approval_requests_scope_idx").on(
      table.siteId,
      table.runId,
      table.hermesRunId,
      table.approvalRequestId,
    ),
    uniqueIndex("approval_requests_nonce_idx").on(table.nonce),
    index("approval_requests_expiry_idx").on(
      table.siteId,
      table.claimState,
      table.expiresAt,
    ),
    foreignKey({
      columns: [table.siteId, table.runId],
      foreignColumns: [runs.siteId, runs.id],
      name: "approval_requests_site_run_fk",
    }),
    check(
      "approval_requests_state_check",
      sql`${table.claimState} IN ('pending', 'claimed', 'resolved', 'expired')`,
    ),
    check(
      "approval_requests_outcome_check",
      sql`(${table.claimState} = 'resolved' AND ${table.outcome} IN ('once', 'deny')) OR (${table.claimState} <> 'resolved' AND ${table.outcome} IS NULL)`,
    ),
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
    ownerUserId: text("owner_user_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => consoleUsers.id),
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
      columns: [table.ownerUserId, table.siteId],
      foreignColumns: [siteMemberships.userId, siteMemberships.siteId],
      name: "artifacts_owner_site_membership_fk",
    }),
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
    foreignKey({
      columns: [table.siteId, table.projectScope, table.runId, table.ownerUserId],
      foreignColumns: [runs.siteId, runs.projectScope, runs.id, runs.ownerUserId],
      name: "artifacts_run_owner_fk",
    }),
    index("artifacts_run_idx").on(table.runId),
    index("artifacts_run_direction_idx").on(table.runId, table.direction),
    index("artifacts_site_idx").on(table.siteId),
    index("artifacts_site_owner_idx").on(table.siteId, table.ownerUserId),
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
