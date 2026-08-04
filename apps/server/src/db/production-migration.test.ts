import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { appendAuditEntry } from "../modules/audit/service";
import { computeAuditEntryHash } from "../modules/audit/chain";
import * as schema from "./schema";
import {
  loadProductionDatabaseConfig,
  migrateProductionDatabase,
} from "./production-migration";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-db-roles-${randomUUID().slice(0, 12)}`;
const ownerPassword = "owner-test-password";
const runtimePassword = "runtime-test-password";
const runtimeRole = "hermes_runtime";
const databaseName = "role_boundary";
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
let hostPort = "";

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(`docker failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function ownerPsql(statement: string) {
  return docker(
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      databaseName,
      "-Atq",
    ],
    statement,
  );
}

async function expectDenied(query: PromiseLike<unknown>) {
  let error: unknown;
  try {
    await query;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as { code?: string }).code).toBe("42501");
}

function legacyMigrationsThrough0018() {
  const source = join(import.meta.dir, "../../drizzle");
  const destination = mkdtempSync(join(tmpdir(), "hermes-migrations-0018-"));
  const journal = JSON.parse(
    readFileSync(join(source, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const entries = journal.entries.filter((entry) => entry.idx <= 18);
  mkdirSync(join(destination, "meta"));
  writeFileSync(
    join(destination, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    copyFileSync(join(source, `${entry.tag}.sql`), join(destination, `${entry.tag}.sql`));
  }
  return destination;
}

describe("production database configuration", () => {
  test("requires distinct owner/runtime identities and the runtime password from its URL", () => {
    const base = {
      DATABASE_OWNER_URL: "postgres://hermes:owner@postgres:5432/hermes_console",
      DATABASE_URL: "postgres://hermes_runtime:runtime@postgres:5432/hermes_console",
      POSTGRES_RUNTIME_USER: "hermes_runtime",
      POSTGRES_RUNTIME_PASSWORD: "runtime",
    };
    expect(loadProductionDatabaseConfig(base).databaseName).toBe("hermes_console");
    expect(() =>
      loadProductionDatabaseConfig({
        ...base,
        DATABASE_URL: "postgres://hermes:runtime@postgres:5432/hermes_console",
      }),
    ).toThrow("distinct");
    expect(() =>
      loadProductionDatabaseConfig({ ...base, POSTGRES_RUNTIME_PASSWORD: "different" }),
    ).toThrow("password must match");
    expect(() =>
      loadProductionDatabaseConfig({
        ...base,
        DATABASE_OWNER_URL: "postgres://hermes:runtime@postgres:5432/hermes_console",
      }),
    ).toThrow("distinct");
  });
});

const describeWithDocker = dockerAvailable ? describe : describe.skip;
if (!dockerAvailable) test.skip("PostgreSQL réel indisponible sans Docker", () => undefined);

describeWithDocker("production owner/runtime PostgreSQL boundary", () => {
  beforeAll(async () => {
    docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--publish",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env",
      `POSTGRES_PASSWORD=${ownerPassword}`,
      POSTGRES_IMAGE,
    ]);
    const initCompleteMarker = "PostgreSQL init process complete; ready for start up.";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
      const output = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
      if (
        output.includes(initCompleteMarker) &&
        spawnSync("docker", ["exec", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;"], {
          stdio: "ignore",
        }).status === 0
      ) {
        hostPort = docker(["port", containerName, "5432/tcp"]).split(":").at(-1) ?? "";
        docker(
          ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
          `CREATE DATABASE ${databaseName};`,
        );
        return;
      }
      await Bun.sleep(250);
    }
    throw new Error("PostgreSQL éphémère indisponible.");
  }, 20_000);

  afterAll(() => {
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("migrates as owner and exposes only runtime DML plus the audited append function", async () => {
    const ownerUrl = `postgres://postgres:${ownerPassword}@127.0.0.1:${hostPort}/${databaseName}`;
    const runtimeUrl = `postgres://${runtimeRole}:${runtimePassword}@127.0.0.1:${hostPort}/${databaseName}`;
    const config = loadProductionDatabaseConfig({
      DATABASE_OWNER_URL: ownerUrl,
      DATABASE_URL: runtimeUrl,
      POSTGRES_RUNTIME_USER: runtimeRole,
      POSTGRES_RUNTIME_PASSWORD: runtimePassword,
    });

    await migrateProductionDatabase(config);
    await migrateProductionDatabase(config);

    const runtimeClient = postgres(runtimeUrl, { prepare: false });
    const runtimeDatabase = drizzle(runtimeClient, { schema });
    const ownerClient = postgres(ownerUrl, { prepare: false });
    try {
      await runtimeClient`
        INSERT INTO organizations (id, name, slug, kind) VALUES
          ('org_client_paris', 'Client Paris', 'client-paris', 'client'),
          ('org_client_lyon', 'Client Lyon', 'client-lyon', 'client')
      `;
      await runtimeClient`
        INSERT INTO sites (id, client_organization_id, name, slug) VALUES
          ('paris', 'org_client_paris', 'Paris', 'paris'),
          ('lyon', 'org_client_lyon', 'Lyon', 'lyon')
      `;
      await runtimeClient`
        INSERT INTO console_users (id, email, google_subject)
        VALUES ('usr_admin', 'admin@example.com', 'sub-admin')
      `;
      await runtimeClient`
        INSERT INTO organization_memberships (user_id, organization_id)
        VALUES ('usr_admin', 'org_client_paris')
      `;
      await runtimeClient`
        INSERT INTO site_memberships (user_id, site_id, organization_id, role)
        VALUES ('usr_admin', 'paris', 'org_client_paris', 'admin')
      `;

      const entry = await appendAuditEntry(
        {
          eventId: "evt-runtime",
          actorSiteId: "paris",
          targetSiteId: "lyon",
          actorUserId: "usr_admin",
          actorRole: "admin",
          actorOrganizationId: "org_client_paris",
          clientOrganizationId: "org_client_paris",
          mandateId: null,
          action: "agent.read",
          resourceType: "agent",
          resourceId: "agt-1",
          decision: "allowed",
          reasonCode: "authorized",
          beforeState: {},
          afterState: { read: true },
          correlationId: "corr-runtime",
          occurredAt: new Date("2026-08-01T12:00:00.000Z"),
        },
        { database: runtimeDatabase, hmacKey: "integration-key" },
      );
      expect(entry.eventId).toBe("evt-runtime");
      const entryCount = await runtimeClient<{ count: number }[]>`
        SELECT count(*)::int AS count FROM audit_ledger_entries
      `;
      expect(entryCount[0]?.count).toBe(1);
      const ledgerHead = await runtimeClient<{ next_sequence: number }[]>`
        SELECT next_sequence::int AS next_sequence
        FROM audit_ledger_heads
        WHERE target_site_id = 'lyon'
      `;
      expect(ledgerHead[0]?.next_sequence).toBe(2);

      const deniedStatements = [
        "INSERT INTO audit_ledger_entries (event_id) VALUES ('forged')",
        "UPDATE audit_ledger_entries SET action = 'forged'",
        "DELETE FROM audit_ledger_entries",
        "TRUNCATE audit_ledger_entries",
        "INSERT INTO audit_ledger_heads (target_site_id) VALUES ('paris')",
        "UPDATE audit_ledger_heads SET next_sequence = 99",
        "CREATE TABLE runtime_owned (id integer)",
        "ALTER TABLE audit_ledger_entries DISABLE TRIGGER audit_ledger_advance_head",
        "ALTER FUNCTION public.advance_audit_ledger_head() RENAME TO compromised",
        "SELECT nextval('public.audit_ledger_entries_id_seq')",
        "SET session_replication_role = replica",
        "SET ROLE postgres",
      ];
      for (const statement of deniedStatements) {
        await expectDenied(runtimeClient.unsafe(statement));
      }

      const [role] = await ownerClient<{
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
        rolinherit: boolean;
        rolconnlimit: number;
        rolconfig: string[] | null;
        memberships: number;
      }[]>`
        SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
          r.rolinherit, r.rolconnlimit, r.rolconfig,
          (SELECT count(*)::int FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid) AS memberships
        FROM pg_catalog.pg_roles r WHERE r.rolname = ${runtimeRole}
      `;
      expect(role).toEqual({
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        rolinherit: false,
        rolconnlimit: -1,
        rolconfig: null,
        memberships: 0,
      });
      expect(
        ownerPsql(`
          SELECT prosecdef::text || ':' || proconfig[1]
          FROM pg_proc
          WHERE oid = 'public.append_audit_ledger_entry(text,text,text,text,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb,text,timestamptz,timestamptz,bigint,text,text)'::regprocedure;
        `),
      ).toBe("true:search_path=pg_catalog, public");
      expect(
        ownerPsql(`
          SET ROLE ${runtimeRole};
          SELECT has_function_privilege(current_user,
            'public.append_audit_ledger_entry(text,text,text,text,text,text,text,text,integer,text,text,text,text,text,jsonb,jsonb,text,timestamptz,timestamptz,bigint,text,text)',
            'EXECUTE')::text;
        `),
      ).toBe("true");

      await ownerClient`CREATE TABLE public.future_unclassified (id integer)`;
      await expectDenied(runtimeClient`SELECT * FROM public.future_unclassified`);
      await expectDenied(runtimeClient`INSERT INTO public.future_unclassified VALUES (1)`);
      await ownerClient`DROP TABLE public.future_unclassified`;
    } finally {
      await runtimeClient.end({ timeout: 1 });
      await ownerClient.end({ timeout: 1 });
    }
  }, 40_000);

  test("upgrades an existing 0018 ledger and neutralizes a hostile stale runtime role", async () => {
    const upgradeDatabase = "role_upgrade";
    const upgradeRole = "hermes_runtime_upgrade";
    const upgradePassword = "runtime-upgrade-password";
    docker(
      ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
      `CREATE DATABASE ${upgradeDatabase};`,
    );
    const ownerUrl = `postgres://postgres:${ownerPassword}@127.0.0.1:${hostPort}/${upgradeDatabase}`;
    const runtimeUrl = `postgres://${upgradeRole}:${upgradePassword}@127.0.0.1:${hostPort}/${upgradeDatabase}`;
    const legacyMigrations = legacyMigrationsThrough0018();
    let ownerClient = postgres(ownerUrl, { prepare: false });
    let staleRuntimeClient: ReturnType<typeof postgres> | undefined;
    try {
      await migrate(drizzle(ownerClient), { migrationsFolder: legacyMigrations });
      await ownerClient`
        INSERT INTO sites (id, name, slug) VALUES
          ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon')
      `;
      await ownerClient`
        INSERT INTO console_users (id, email, google_subject)
        VALUES ('usr_upgrade', 'upgrade@example.com', 'sub-upgrade')
      `;
      await ownerClient`
        INSERT INTO site_memberships (user_id, site_id, role)
        VALUES ('usr_upgrade', 'paris', 'admin')
      `;
      const occurredAt = "2026-08-01T12:00:00.000Z";
      const recordedAt = "2026-08-01T12:00:01.000Z";
      const entryHash = computeAuditEntryHash(
        {
          eventId: "evt-before-upgrade",
          actorSiteId: "paris",
          targetSiteId: "lyon",
          actorUserId: "usr_upgrade",
          actorRole: "admin",
          action: "agent.read",
          resourceType: "agent",
          resourceId: "agt-1",
          decision: "allowed",
          reasonCode: "authorized",
          beforeState: {},
          afterState: { read: true },
          correlationId: "corr-upgrade",
          occurredAt,
          recordedAt,
          sequence: 1,
          previousHash: null,
        },
        "integration-key",
      );
      await ownerClient`
        INSERT INTO audit_ledger_entries
          (event_id, actor_site_id, target_site_id, actor_user_id, actor_role, action,
           resource_type, resource_id, decision, reason_code, before_state, after_state,
           correlation_id, occurred_at, recorded_at, sequence, previous_hash, entry_hash)
        VALUES
          ('evt-before-upgrade', 'paris', 'lyon', 'usr_upgrade', 'admin', 'agent.read',
           'agent', 'agt-1', 'allowed', 'authorized', '{}', '{"read":true}',
           'corr-upgrade', ${occurredAt}::timestamptz, ${recordedAt}::timestamptz,
           1, NULL, ${entryHash})
      `;

      await ownerClient.unsafe(`
        CREATE TABLE msp_organization_bootstrap (
          id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL, kind text NOT NULL
        );
        INSERT INTO msp_organization_bootstrap (id, name, slug, kind) VALUES
          ('org_client_paris', 'Client Paris', 'client-paris', 'client'),
          ('org_client_lyon', 'Client Lyon', 'client-lyon', 'client'),
          ('org_client_legacy_default', 'Legacy client', 'client-legacy-default', 'client');
        CREATE TABLE msp_client_bootstrap (
          site_id text PRIMARY KEY, client_organization_id text NOT NULL
        );
        INSERT INTO msp_client_bootstrap VALUES
          ('paris', 'org_client_paris'),
          ('lyon', 'org_client_lyon'),
          ('legacy-default', 'org_client_legacy_default');
        CREATE TABLE msp_membership_bootstrap (
          user_id text NOT NULL, site_id text NOT NULL, organization_id text NOT NULL,
          PRIMARY KEY (user_id, site_id)
        );
        INSERT INTO msp_membership_bootstrap VALUES
          ('usr_upgrade', 'paris', 'org_client_paris');
      `);

      await ownerClient.unsafe(`
        CREATE ROLE ${upgradeRole} LOGIN PASSWORD '${upgradePassword}' SUPERUSER CREATEDB CREATEROLE
          REPLICATION BYPASSRLS
      `);
      await ownerClient`GRANT ${ownerClient("postgres")} TO ${ownerClient(upgradeRole)}`;
      await ownerClient`
        GRANT SET ON PARAMETER session_replication_role TO ${ownerClient(upgradeRole)}
      `;
      staleRuntimeClient = postgres(runtimeUrl, { prepare: false, max: 1 });
      const [staleBackend] = await staleRuntimeClient<{ pid: number }[]>`
        SELECT pg_backend_pid() AS pid
      `;
      await staleRuntimeClient`SET session_replication_role = replica`;
      await staleRuntimeClient`SET ROLE postgres`;
      const [staleActivity] = await ownerClient<{ usename: string }[]>`
        SELECT usename FROM pg_catalog.pg_stat_activity WHERE pid = ${staleBackend?.pid}
      `;
      expect(staleActivity?.usename).toBe(upgradeRole);

      await ownerClient`
        ALTER ROLE ${ownerClient(upgradeRole)} CONNECTION LIMIT 0 VALID UNTIL '2020-01-01'
      `;
      await ownerClient`
        ALTER ROLE ${ownerClient(upgradeRole)} SET session_replication_role = replica
      `;
      await ownerClient`
        ALTER ROLE ${ownerClient(upgradeRole)} IN DATABASE ${ownerClient(upgradeDatabase)}
        SET session_replication_role = replica
      `;
      await ownerClient`
        ALTER DATABASE ${ownerClient(upgradeDatabase)} SET session_replication_role = replica
      `;
      await ownerClient`GRANT INSERT, UPDATE, DELETE ON audit_ledger_entries TO PUBLIC`;
      await ownerClient`GRANT INSERT, UPDATE, DELETE ON audit_ledger_heads TO PUBLIC`;
      await ownerClient`GRANT USAGE, SELECT ON SEQUENCE audit_ledger_entries_id_seq TO PUBLIC`;
      await ownerClient.end({ timeout: 1 });

      const config = loadProductionDatabaseConfig({
        DATABASE_OWNER_URL: ownerUrl,
        DATABASE_URL: runtimeUrl,
        POSTGRES_RUNTIME_USER: upgradeRole,
        POSTGRES_RUNTIME_PASSWORD: upgradePassword,
      });
      await migrateProductionDatabase(config);

      ownerClient = postgres(ownerUrl, { prepare: false });
      const [terminatedBackend] = await ownerClient<{ present: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid = ${staleBackend?.pid}
        ) AS present
      `;
      expect(terminatedBackend?.present).toBe(false);
      const runtimeClient = postgres(runtimeUrl, { prepare: false });
      const runtimeDatabase = drizzle(runtimeClient, { schema });
      try {
        const [setting] = await runtimeClient<{ session_replication_role: string }[]>`
          SELECT current_setting('session_replication_role') AS session_replication_role
        `;
        expect(setting?.session_replication_role).toBe("origin");
        const [effectivePrivileges] = await runtimeClient<{
          can_insert_entries: boolean;
          can_insert_heads: boolean;
          can_use_audit_sequence: boolean;
        }[]>`
          SELECT
            has_table_privilege(current_user, 'public.audit_ledger_entries', 'INSERT') AS can_insert_entries,
            has_table_privilege(current_user, 'public.audit_ledger_heads', 'INSERT') AS can_insert_heads,
            has_sequence_privilege(current_user, 'public.audit_ledger_entries_id_seq', 'USAGE') AS can_use_audit_sequence
        `;
        expect(effectivePrivileges).toEqual({
          can_insert_entries: false,
          can_insert_heads: false,
          can_use_audit_sequence: false,
        });
        const [preserved] = await runtimeClient<{ event_id: string }[]>`
          SELECT event_id FROM audit_ledger_entries WHERE sequence = 1
        `;
        expect(preserved?.event_id).toBe("evt-before-upgrade");

        const appended = await appendAuditEntry(
          {
            eventId: "evt-after-upgrade",
            actorSiteId: "paris",
            targetSiteId: "lyon",
            actorUserId: "usr_upgrade",
            actorRole: "admin",
            actorOrganizationId: "org_client_paris",
            clientOrganizationId: "org_client_paris",
            mandateId: null,
            action: "agent.update",
            resourceType: "agent",
            resourceId: "agt-1",
            decision: "allowed",
            reasonCode: "authorized",
            beforeState: { read: true },
            afterState: { read: true, updated: true },
            correlationId: "corr-upgrade",
            occurredAt: new Date("2026-08-01T13:00:00.000Z"),
          },
          { database: runtimeDatabase, hmacKey: "integration-key" },
        );
        expect(appended.sequence).toBe(2);
        await expectDenied(runtimeClient`SET session_replication_role = replica`);
        await expectDenied(runtimeClient`SET ROLE postgres`);
        await expectDenied(runtimeClient`SELECT nextval('audit_ledger_entries_id_seq')`);
        await expectDenied(runtimeClient`INSERT INTO audit_ledger_entries (event_id) VALUES ('x')`);

        const [staleState] = await ownerClient<{
          rolconfig: string[] | null;
          rolconnlimit: number;
          memberships: number;
          database_settings: number;
        }[]>`
          SELECT r.rolconfig, r.rolconnlimit,
            (SELECT count(*)::int FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid) AS memberships,
            (SELECT count(*)::int FROM pg_catalog.pg_db_role_setting s WHERE s.setrole = r.oid) AS database_settings
          FROM pg_catalog.pg_roles r WHERE r.rolname = ${upgradeRole}
        `;
        expect(staleState).toEqual({
          rolconfig: null,
          rolconnlimit: -1,
          memberships: 0,
          database_settings: 0,
        });
      } finally {
        await runtimeClient.end({ timeout: 1 });
      }
    } finally {
      await staleRuntimeClient?.end({ timeout: 1 }).catch(() => undefined);
      await ownerClient.end({ timeout: 1 }).catch(() => undefined);
      rmSync(legacyMigrations, { recursive: true, force: true });
    }
  }, 40_000);
});
