import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";

const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const MUTABLE_APPLICATION_TABLES = [
  "agents",
  "approval_requests",
  "artifacts",
  "connectors",
  "console_auth_transactions",
  "console_sessions",
  "console_setup",
  "console_users",
  "data_lifecycle_preview_items",
  "data_lifecycle_previews",
  "messages",
  "msp_mandate_assignments",
  "msp_mandates",
  "organization_memberships",
  "organizations",
  "projects",
  "run_events",
  "runs",
  "runtime_config",
  "runtime_model_settings",
  "site_data_lifecycle_policies",
  "site_memberships",
  "sites",
  "threads",
] as const;
const PROTECTED_APPLICATION_TABLES = [
  "audit_ledger_entries",
  "audit_ledger_heads",
] as const;
const MUTABLE_APPLICATION_SEQUENCES = ["run_events_id_seq"] as const;
const PROTECTED_APPLICATION_SEQUENCES = ["audit_ledger_entries_id_seq"] as const;
export interface ProductionDatabaseConfig {
  ownerUrl: string;
  runtimeUrl: string;
  runtimeRole: string;
  runtimePassword: string;
  databaseName: string;
}

function parsePostgresUrl(value: string, variable: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must be a valid PostgreSQL URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${variable} must use the postgres or postgresql protocol.`);
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || !url.hostname || !url.username) {
    throw new Error(`${variable} must include a user, host, and database.`);
  }
  return {
    databaseName,
    hostname: url.hostname,
    port: url.port || "5432",
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export function loadProductionDatabaseConfig(
  environment: Record<string, string | undefined> = process.env,
): ProductionDatabaseConfig {
  const ownerUrl = environment.DATABASE_OWNER_URL;
  const runtimeUrl = environment.DATABASE_URL;
  const runtimeRole = environment.POSTGRES_RUNTIME_USER;
  const runtimePassword = environment.POSTGRES_RUNTIME_PASSWORD;
  if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is required for production migrations.");
  if (!runtimeUrl) throw new Error("DATABASE_URL is required for the runtime role.");
  if (!runtimeRole || !ROLE_NAME_PATTERN.test(runtimeRole)) {
    throw new Error("POSTGRES_RUNTIME_USER must be a simple PostgreSQL role name.");
  }
  if (!runtimePassword) {
    throw new Error("POSTGRES_RUNTIME_PASSWORD is required for production migrations.");
  }

  const owner = parsePostgresUrl(ownerUrl, "DATABASE_OWNER_URL");
  const runtime = parsePostgresUrl(runtimeUrl, "DATABASE_URL");
  if (
    owner.hostname !== runtime.hostname ||
    owner.port !== runtime.port ||
    owner.databaseName !== runtime.databaseName
  ) {
    throw new Error("DATABASE_OWNER_URL and DATABASE_URL must target the same database.");
  }
  if (owner.username === runtimeRole || runtime.username !== runtimeRole) {
    throw new Error("The owner and runtime PostgreSQL identities must be distinct and match their URLs.");
  }
  if (runtime.password !== runtimePassword) {
    throw new Error("DATABASE_URL password must match POSTGRES_RUNTIME_PASSWORD.");
  }
  if (!owner.password || owner.password === runtimePassword) {
    throw new Error("The owner and runtime PostgreSQL passwords must be non-empty and distinct.");
  }

  return {
    ownerUrl,
    runtimeUrl,
    runtimeRole,
    runtimePassword,
    databaseName: owner.databaseName,
  };
}

async function formattedRoleStatement(
  owner: Sql,
  template: string,
  role: string,
  password?: string,
) {
  const rows = password
    ? await owner<{ statement: string }[]>`
        SELECT format(${template}::text, ${role}::text, ${password}::text) AS statement
      `
    : await owner<{ statement: string }[]>`
        SELECT format(${template}::text, ${role}::text) AS statement
      `;
  const statement = rows[0]?.statement;
  if (!statement) throw new Error("PostgreSQL did not produce the role statement.");
  await owner.unsafe(statement);
}

export async function provisionRuntimeRole(
  owner: Sql,
  config: Pick<
    ProductionDatabaseConfig,
    "databaseName" | "runtimeRole" | "runtimePassword"
  >,
) {
  const existing = await owner<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${config.runtimeRole}) AS exists
  `;
  if (!existing[0]?.exists) {
    await formattedRoleStatement(
      owner,
      "CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
      config.runtimeRole,
    );
  }
  await owner`
    REVOKE CONNECT ON DATABASE ${owner(config.databaseName)}
    FROM PUBLIC, ${owner(config.runtimeRole)}
  `;
  await formattedRoleStatement(
    owner,
    "ALTER ROLE %I LOGIN PASSWORD %L CONNECTION LIMIT -1 VALID UNTIL 'infinity' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    config.runtimeRole,
    config.runtimePassword,
  );
  await formattedRoleStatement(owner, "ALTER ROLE %I RESET ALL", config.runtimeRole);
  await owner`
    ALTER ROLE ${owner(config.runtimeRole)} IN DATABASE ${owner(config.databaseName)} RESET ALL
  `;
  await owner`REVOKE ALL PRIVILEGES ON PARAMETER session_replication_role FROM PUBLIC`;
  await owner`
    REVOKE ALL PRIVILEGES ON PARAMETER session_replication_role FROM ${owner(config.runtimeRole)}
  `;

  const memberships = await owner<{ role_name: string }[]>`
    SELECT granted.rolname AS role_name
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    WHERE member.rolname = ${config.runtimeRole}
  `;
  for (const membership of memberships) {
    await owner`REVOKE ${owner(membership.role_name)} FROM ${owner(config.runtimeRole)}`;
  }

  const sessions = await owner<{ pid: number; terminated: boolean }[]>`
    SELECT pid, pg_catalog.pg_terminate_backend(pid) AS terminated
    FROM pg_catalog.pg_stat_activity
    WHERE usename = ${config.runtimeRole} AND pid <> pg_catalog.pg_backend_pid()
  `;
  const unterminated = sessions.filter((session) => !session.terminated);
  if (unterminated.length > 0) {
    throw new Error(
      `Could not terminate stale runtime database sessions: ${unterminated
        .map((session) => session.pid)
        .join(", ")}.`,
    );
  }
}

async function assertRuntimeOwnsNoDatabaseObjects(owner: Sql, runtimeRole: string) {
  const owned = await owner<{ kind: string; name: string }[]>`
    SELECT 'database' AS kind, datname AS name
    FROM pg_catalog.pg_database
    WHERE datdba = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ${runtimeRole})
    UNION ALL
    SELECT 'schema' AS kind, nspname AS name
    FROM pg_catalog.pg_namespace
    WHERE nspowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ${runtimeRole})
    UNION ALL
    SELECT 'relation', n.nspname || '.' || c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ${runtimeRole})
    UNION ALL
    SELECT 'function', n.nspname || '.' || p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ${runtimeRole})
    UNION ALL
    SELECT 'type', n.nspname || '.' || t.typname
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ${runtimeRole})
    LIMIT 1
  `;
  if (owned[0]) {
    throw new Error(
      `Runtime role must not own database objects (${owned[0].kind} ${owned[0].name}).`,
    );
  }
}

async function assertAllApplicationTablesAreClassified(owner: Sql) {
  const tables = await owner<{ table_name: string }[]>`
    SELECT c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ORDER BY c.relname
  `;
  const classified = new Set<string>([
    ...MUTABLE_APPLICATION_TABLES,
    ...PROTECTED_APPLICATION_TABLES,
  ]);
  const unknown = tables.map((table) => table.table_name).filter((table) => !classified.has(table));
  if (unknown.length > 0) {
    throw new Error(`Database privilege classification missing for: ${unknown.join(", ")}.`);
  }
}

async function assertAllApplicationSequencesAreClassified(owner: Sql) {
  const sequences = await owner<{ sequence_name: string }[]>`
    SELECT c.relname AS sequence_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    ORDER BY c.relname
  `;
  const classified = new Set<string>([
    ...MUTABLE_APPLICATION_SEQUENCES,
    ...PROTECTED_APPLICATION_SEQUENCES,
  ]);
  const unknown = sequences
    .map((sequence) => sequence.sequence_name)
    .filter((sequence) => !classified.has(sequence));
  if (unknown.length > 0) {
    throw new Error(`Database privilege classification missing for sequences: ${unknown.join(", ")}.`);
  }
}

export async function reconcileRuntimePrivileges(
  owner: Sql,
  config: Pick<ProductionDatabaseConfig, "databaseName" | "runtimeRole">,
) {
  const role = owner(config.runtimeRole);
  const database = owner(config.databaseName);

  await assertRuntimeOwnsNoDatabaseObjects(owner, config.runtimeRole);
  await assertAllApplicationTablesAreClassified(owner);
  await assertAllApplicationSequencesAreClassified(owner);
  await owner`REVOKE CONNECT, TEMPORARY ON DATABASE ${database} FROM PUBLIC`;
  await owner`REVOKE ALL ON SCHEMA public FROM PUBLIC`;
  await owner`REVOKE CREATE ON SCHEMA public FROM ${role}`;
  await owner`GRANT USAGE ON SCHEMA public TO ${role}`;

  await owner`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC`;
  await owner`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`;
  for (const tableName of MUTABLE_APPLICATION_TABLES) {
    await owner`
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${owner(tableName)} TO ${role}
    `;
  }
  for (const tableName of PROTECTED_APPLICATION_TABLES) {
    await owner`GRANT SELECT ON TABLE public.${owner(tableName)} TO ${role}`;
  }
  await owner`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC`;
  await owner`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`;
  for (const sequenceName of MUTABLE_APPLICATION_SEQUENCES) {
    await owner`GRANT USAGE, SELECT ON SEQUENCE public.${owner(sequenceName)} TO ${role}`;
  }
  await owner`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`;
  await owner`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${role}`;
  await owner`REVOKE SET, ALTER SYSTEM ON PARAMETER session_replication_role FROM PUBLIC`;
  await owner`REVOKE SET, ALTER SYSTEM ON PARAMETER session_replication_role FROM ${role}`;

  await owner`
    GRANT EXECUTE ON FUNCTION public.append_audit_ledger_entry(
      text, text, text, text, text, text, text, text, integer, text, text, text,
      text, text, jsonb, jsonb, text, timestamp with time zone,
      timestamp with time zone, bigint, text, text
    ) TO ${role}
  `;

  await owner`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC`;
  await owner`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`;
  await owner`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC`;
  await owner`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`;
  await owner`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`;
  await owner`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM ${role}`;
  await owner`GRANT CONNECT ON DATABASE ${database} TO ${role}`;
}

export async function migrateProductionDatabase(
  config: ProductionDatabaseConfig,
  migrationsFolder = join(import.meta.dir, "../../drizzle"),
) {
  const owner = postgres(config.ownerUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    prepare: false,
  });
  try {
    await owner`SET session_replication_role = origin`;
    await owner`ALTER DATABASE ${owner(config.databaseName)} RESET session_replication_role`;
    await provisionRuntimeRole(owner, config);
    await migrate(drizzle(owner), { migrationsFolder });
    await reconcileRuntimePrivileges(owner, config);
  } finally {
    await owner.end({ timeout: 5 });
  }
}
