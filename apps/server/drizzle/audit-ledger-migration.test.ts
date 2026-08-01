import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { appendAuditEntry } from "../src/modules/audit/service";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-audit-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
type Journal = { entries: Array<{ idx: number; tag: string }> };
const journal = JSON.parse(readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8")) as Journal;
let hostPort = "";

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(`docker failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function psql(database: string, sql: string) {
  return docker(
    ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-Atq"],
    sql,
  );
}

function migration(tag: string) {
  return readFileSync(join(import.meta.dir, `${tag}.sql`), "utf8");
}

function applyJournal(database: string) {
  for (const { tag } of journal.entries) psql(database, migration(tag));
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;
if (!dockerAvailable) test.skip("PostgreSQL réel indisponible sans Docker", () => undefined);

describeWithDocker("audit ledger migration on PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName, "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m", "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0) {
        hostPort = docker(["port", containerName, "5432/tcp"]).split(":").at(-1) ?? "";
        return;
      }
      await Bun.sleep(250);
    }
    throw new Error("PostgreSQL éphémère indisponible.");
  }, 20_000);

  afterAll(() => {
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("0018 replays and enforces actor snapshots, target ordering, and mutation guards", () => {
    expect(journal.entries.find((entry) => entry.idx === 19)?.tag).toBe(
      "0019_database_role_boundaries",
    );
    psql("postgres", 'CREATE DATABASE "audit_ledger";');
    applyJournal("audit_ledger");
    psql("audit_ledger", migration("0018_audit_ledger_foundations"));
    psql("audit_ledger", `
      INSERT INTO sites (id, name, slug) VALUES ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon');
      INSERT INTO console_users (id, email, google_subject) VALUES ('usr_admin', 'admin@example.com', 'sub-admin');
      INSERT INTO site_memberships (user_id, site_id, role) VALUES ('usr_admin', 'paris', 'admin');
      INSERT INTO audit_ledger_entries
        (event_id, actor_site_id, target_site_id, actor_user_id, actor_role, action,
         resource_type, resource_id, decision, reason_code, before_state, after_state,
         correlation_id, occurred_at, sequence, previous_hash, entry_hash)
      VALUES
        ('evt-1', 'paris', 'lyon', 'usr_admin', 'admin', 'cross_site.denied',
         'agent', 'agt-1', 'denied', 'cross_site_denied', '{}', '{}', 'corr-1', now(),
         1, NULL, repeat('a', 64)),
        ('evt-2', 'paris', 'lyon', 'usr_admin', 'admin', 'agent.read',
         'agent', 'agt-1', 'allowed', 'authorized', '{}', '{"read":true}', 'corr-1', now(),
         2, repeat('a', 64), repeat('b', 64));
    `);

    expect(psql("audit_ledger", "SELECT string_agg(sequence::text, ',' ORDER BY sequence) FROM audit_ledger_entries;")).toBe("1,2");
    expect(psql("audit_ledger", "SELECT next_sequence || ':' || last_entry_hash FROM audit_ledger_heads WHERE target_site_id = 'lyon';")).toBe(`3:${"b".repeat(64)}`);
    expect(psql("audit_ledger", "SELECT (recorded_at IS NOT NULL)::text FROM audit_ledger_entries WHERE event_id = 'evt-1';")).toBe("true");
    expect(() => psql("audit_ledger", `INSERT INTO audit_ledger_entries
      (event_id, actor_site_id, target_site_id, actor_user_id, actor_role, action,
       resource_type, resource_id, decision, reason_code, before_state, after_state,
       correlation_id, occurred_at, sequence, previous_hash, entry_hash)
      VALUES ('evt-missing', 'lyon', 'lyon', 'usr_admin', 'admin', 'x', 'agent', 'a',
       'allowed', 'missing_membership', '{}', '{}', 'corr', now(), 3,
       repeat('b',64), repeat('c',64));`)).toThrow("audit_ledger_actor_membership_missing");
    expect(() => psql("audit_ledger", "UPDATE audit_ledger_entries SET action = 'changed' WHERE event_id = 'evt-1';")).toThrow("audit_ledger_append_only");
    expect(() => psql("audit_ledger", "DELETE FROM audit_ledger_entries WHERE event_id = 'evt-1';")).toThrow("audit_ledger_append_only");
    expect(() => psql("audit_ledger", "TRUNCATE audit_ledger_entries;")).toThrow("audit_ledger_append_only");
    expect(() => psql("audit_ledger", "UPDATE audit_ledger_heads SET next_sequence = 99 WHERE target_site_id = 'lyon';")).toThrow("audit_ledger_head_managed");
    expect(() => psql("audit_ledger", "DELETE FROM audit_ledger_heads WHERE target_site_id = 'lyon';")).toThrow("audit_ledger_head_managed");
    expect(() => psql("audit_ledger", "TRUNCATE audit_ledger_heads;")).toThrow("audit_ledger_append_only");
    expect(() => psql("audit_ledger", `INSERT INTO audit_ledger_entries
      (event_id, actor_site_id, target_site_id, actor_user_id, actor_role, action,
       resource_type, resource_id, decision, reason_code, before_state, after_state,
       correlation_id, occurred_at, sequence, previous_hash, entry_hash)
      VALUES ('evt-empty-reason', 'paris', 'lyon', 'usr_admin', 'admin', 'x', 'agent', 'a',
       'allowed', ' ', '{}', '{}', 'corr', now(), 3, repeat('b',64), repeat('c',64));`)).toThrow("audit_ledger_reason_code_check");
    expect(() => psql("audit_ledger", `INSERT INTO audit_ledger_entries
      (event_id, actor_site_id, target_site_id, actor_user_id, actor_role, action,
       resource_type, resource_id, decision, before_state, after_state,
       correlation_id, occurred_at, sequence, previous_hash, entry_hash)
      VALUES ('evt-null-reason', 'paris', 'lyon', 'usr_admin', 'admin', 'x', 'agent', 'a',
       'allowed', '{}', '{}', 'corr', now(), 3, repeat('b',64), repeat('c',64));`)).toThrow("reason_code");
  });

  test("appendAuditEntry is idempotent and rejects divergent reuse of an event id", async () => {
    psql("postgres", 'CREATE DATABASE "audit_service";');
    applyJournal("audit_service");
    psql("audit_service", `
      INSERT INTO sites (id, name, slug) VALUES ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon');
      INSERT INTO console_users (id, email, google_subject) VALUES ('usr_admin', 'admin2@example.com', 'sub-admin-2');
      INSERT INTO site_memberships (user_id, site_id, role) VALUES ('usr_admin', 'paris', 'admin');
    `);
    const client = postgres(`postgres://postgres@127.0.0.1:${hostPort}/audit_service`, { prepare: false });
    const database = drizzle(client, { schema });
    const input = {
      eventId: "evt-service-1",
      actorSiteId: "paris",
      targetSiteId: "lyon",
      actorUserId: "usr_admin",
      actorRole: "admin" as const,
      action: "cross_site.request_denied",
      resourceType: "agent",
      resourceId: "agt-1",
      decision: "denied" as const,
      reasonCode: "cross_site_denied",
      beforeState: { enabled: true },
      afterState: { enabled: true },
      correlationId: "corr-service",
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
    };
    try {
      const first = await appendAuditEntry(input, { database, hmacKey: "integration-key" });
      const replay = await appendAuditEntry(input, { database, hmacKey: "integration-key" });
      expect(replay.id).toBe(first.id);
      expect(psql("audit_service", "SELECT count(*) FROM audit_ledger_entries;")).toBe("1");
      await expect(
        appendAuditEntry({ ...input, action: "different.action" }, { database, hmacKey: "integration-key" }),
      ).rejects.toThrow("event_id identique");
    } finally {
      await client.end({ timeout: 1 });
    }
  });
});
