import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = "hermes-audit-export-" + randomUUID().slice(0, 12);
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };
const hmacKey = "p-int-g1-005b-audit-export";

type AppFetch = (request: Request) => Response | Promise<Response>;
const sessions = {
  auditorA: { userId: "usr_audit_export_a", token: "token-audit-export-a", csrf: "csrf-audit-export-a" },
  requesterA: { userId: "usr_audit_export_requester", token: "token-audit-export-requester", csrf: "csrf-audit-export-requester" },
  auditorB: { userId: "usr_audit_export_b", token: "token-audit-export-b", csrf: "csrf-audit-export-b" },
} as const;
type SessionName = keyof typeof sessions;
let appFetch: AppFetch;

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 12 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("docker " + args.join(" ") + " failed: " + (result.stderr || result.stdout));
  return result.stdout.trim();
}

function psql(statement: string, database = "audit_export") {
  return docker([
    "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-Atq",
  ], statement);
}

function sqlString(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function applyMigrations() {
  for (const entry of journal.entries) {
    psql(readFileSync(join(import.meta.dir, entry.tag + ".sql"), "utf8"));
  }
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync("docker", ["exec", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;"], { stdio: "ignore" }).status === 0) return;
    await Bun.sleep(250);
  }
  throw new Error("PostgreSQL éphémère indisponible.");
}

function authenticatedRequest(
  name: SessionName,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const session = sessions[name];
  const headers = new Headers(options.headers);
  headers.set("cookie", "hc_session=" + session.token);
  if (options.method && !["GET", "HEAD"].includes(options.method) && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", session.csrf);
  }
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return new Request("http://console.test" + path, { method: options.method ?? "GET", headers, body });
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;
if (!dockerAvailable) test.skip("PostgreSQL réel indisponible sans Docker", () => undefined);

describeWithDocker("G1-005B-local audit export over Hono and PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName, "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m", "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    await waitForPostgres();
    docker(["exec", "-i", containerName, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", 'CREATE DATABASE "audit_export";']);
    applyMigrations();
    const port = docker(["port", containerName, "5432/tcp"]).match(/:(\d+)$/)?.[1];
    if (!port) throw new Error("Port PostgreSQL illisible.");
    process.env.DATABASE_URL = "postgres://postgres@127.0.0.1:" + port + "/audit_export";
    process.env.APP_ENCRYPTION_KEY = hmacKey;
    process.env.GOOGLE_ALLOWED_EMAILS = "audit-a@example.com,audit-requester@example.com,audit-b@example.com";
    const { encryptSecret } = await import("@/lib/crypto");
    const encryptedRuntimeToken = encryptSecret("audit-export-runtime-token");

    psql(
      "INSERT INTO organizations (id, name, slug, kind) VALUES" +
      " ('org_export_a', 'Export A', 'export-a', 'client'), ('org_export_b', 'Export B', 'export-b', 'client');" +
      " INSERT INTO sites (id, client_organization_id, name, slug) VALUES" +
      " ('site_export_a', 'org_export_a', 'Export A', 'export-a'), ('site_export_b', 'org_export_b', 'Export B', 'export-b');" +
      " INSERT INTO console_users (id, email, google_subject) VALUES" +
      " ('usr_audit_export_a', 'audit-a@example.com', 'sub-audit-export-a')," +
      " ('usr_audit_export_requester', 'audit-requester@example.com', 'sub-audit-export-requester')," +
      " ('usr_audit_export_b', 'audit-b@example.com', 'sub-audit-export-b');" +
      " INSERT INTO organization_memberships (user_id, organization_id) VALUES" +
      " ('usr_audit_export_a', 'org_export_a'), ('usr_audit_export_requester', 'org_export_a'), ('usr_audit_export_b', 'org_export_b');" +
      " INSERT INTO site_memberships (user_id, site_id, organization_id, role) VALUES" +
      " ('usr_audit_export_a', 'site_export_a', 'org_export_a', 'auditor')," +
      " ('usr_audit_export_requester', 'site_export_a', 'org_export_a', 'requester')," +
      " ('usr_audit_export_b', 'site_export_b', 'org_export_b', 'auditor');" +
      " INSERT INTO console_sessions (token_hash, user_id, site_id, csrf_token, expires_at) VALUES" +
      " (" + sqlString(createHash("sha256").update(sessions.auditorA.token).digest("hex")) + ", 'usr_audit_export_a', 'site_export_a', 'csrf-audit-export-a', now() + interval '1 day')," +
      " (" + sqlString(createHash("sha256").update(sessions.requesterA.token).digest("hex")) + ", 'usr_audit_export_requester', 'site_export_a', 'csrf-audit-export-requester', now() + interval '1 day')," +
      " (" + sqlString(createHash("sha256").update(sessions.auditorB.token).digest("hex")) + ", 'usr_audit_export_b', 'site_export_b', 'csrf-audit-export-b', now() + interval '1 day');" +
      " INSERT INTO console_setup (id, step, completed_at, runtime_verified_at, runtime_config_version)" +
      " VALUES ('default', 'completed', now(), now(), 'database:1');" +
      " INSERT INTO runtime_config (id, name, base_url, encrypted_token, config_revision)" +
      " VALUES ('default', 'Audit export Hermes', 'http://runtime.invalid', " + sqlString(encryptedRuntimeToken) + ", 1);",
    );

    const { appendAuditEntry } = await import("@/modules/audit/service");
    const seed = async (eventId: string, siteId: string, userId: string, organization: string, action: string, resourceId: string, beforeState: Record<string, string>, afterState: Record<string, string>, occurredAt: string) =>
      appendAuditEntry({
        eventId, actorSiteId: siteId, targetSiteId: siteId, actorUserId: userId, actorRole: "auditor",
        actorOrganizationId: organization, clientOrganizationId: organization, mandateId: null, action,
        resourceType: "run", resourceId, decision: "allowed", reasonCode: "RUN_APPROVAL_ALLOWED",
        beforeState, afterState, correlationId: "corr-" + eventId, occurredAt: new Date(occurredAt),
      });
    await seed("evt-export-a-1", "site_export_a", sessions.auditorA.userId, "org_export_a", "run.approve", "run-a-1", { status: "awaiting_approval" }, { status: "running" }, "2026-08-01T10:00:00.000Z");
    await seed("evt-export-a-2", "site_export_a", sessions.auditorA.userId, "org_export_a", "run.completed", "run-a-1", { status: "running" }, { status: "completed" }, "2026-08-01T10:01:00.000Z");
    await seed("evt-export-b-1", "site_export_b", sessions.auditorB.userId, "org_export_b", "run.approve", "run-b-1", { status: "awaiting_approval" }, { status: "running" }, "2026-08-01T10:00:00.000Z");
    appFetch = (await import("@/index")).default.fetch as AppFetch;
  }, 30_000);

  afterAll(async () => {
    const globalState = globalThis as typeof globalThis & {
      hermesConsoleSql?: { end(options?: { timeout?: number }): Promise<void> };
      hermesConsoleDb?: unknown;
    };
    await globalState.hermesConsoleSql?.end({ timeout: 0 });
    delete globalState.hermesConsoleSql;
    delete globalState.hermesConsoleDb;
    delete process.env.DATABASE_URL;
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.GOOGLE_ALLOWED_EMAILS;
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("exports only the session site and records hash, trailer, and success audit", async () => {
    const responseA = await appFetch(authenticatedRequest("auditorA", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 2 },
    }));
    expect(responseA.status).toBe(200);
    expect(responseA.headers.get("content-type")).toContain("application/x-ndjson");
    expect(responseA.headers.get("content-disposition")).toContain("audit-1-2.ndjson");
    expect(responseA.headers.get("cache-control")).toBe("no-store");
    const bodyA = await responseA.text();
    const shaA = responseA.headers.get("x-audit-export-sha256");
    const eventA = responseA.headers.get("x-audit-export-event");
    expect(shaA).toMatch(/^[a-f0-9]{64}$/);
    expect(eventA).toBeTruthy();
    const bodyLinesA = bodyA.trimEnd().split("\n");
    const trailerLineA = bodyLinesA.pop()!;
    expect(bodyLinesA).toHaveLength(2);
    expect(shaA).toBe(createHash("sha256").update(bodyLinesA.map((line) => line + "\n").join("")).digest("hex"));
    const trailerA = JSON.parse(trailerLineA) as Record<string, unknown>;
    expect(trailerA).toMatchObject({ version: 1, type: "audit_export_trailer", fromSequence: 1, toSequence: 2, entryCount: 2, sha256: shaA, exportEventId: eventA });
    expect(bodyA).toContain("evt-export-a-1");
    expect(bodyA).toContain("evt-export-a-2");
    expect(bodyA).not.toContain("evt-export-b-1");
    expect(psql("SELECT event_id || ':' || (after_state->>'sha256') || ':' || (after_state->>'entryCount') || ':' || (after_state->>'fromSequence') || ':' || (after_state->>'toSequence') FROM audit_ledger_entries WHERE target_site_id = 'site_export_a' AND action = 'audit.export' AND reason_code = 'AUDIT_EXPORT_COMPLETED';")).toBe(eventA + ":" + shaA + ":2:1:2");

    const responseB = await appFetch(authenticatedRequest("auditorB", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 1 },
    }));
    expect(responseB.status).toBe(200);
    expect(responseB.headers.get("cache-control")).toBe("no-store");
    const bodyB = await responseB.text();
    const shaB = responseB.headers.get("x-audit-export-sha256");
    const eventB = responseB.headers.get("x-audit-export-event");
    const bodyLinesB = bodyB.trimEnd().split("\n");
    const trailerB = JSON.parse(bodyLinesB.pop()!) as Record<string, unknown>;
    expect(bodyLinesB).toHaveLength(1);
    expect(shaB).toMatch(/^[a-f0-9]{64}$/);
    expect(shaB).toBe(createHash("sha256").update(bodyLinesB.map((line) => line + "\n").join("")).digest("hex"));
    expect(trailerB).toMatchObject({ version: 1, type: "audit_export_trailer", fromSequence: 1, toSequence: 1, entryCount: 1, sha256: shaB, exportEventId: eventB });
    expect(bodyB).toContain("evt-export-b-1");
    expect(bodyB).not.toContain("evt-export-a-1");
    expect(psql("SELECT event_id || ':' || (after_state->>'sha256') || ':' || (after_state->>'entryCount') || ':' || (after_state->>'fromSequence') || ':' || (after_state->>'toSequence') FROM audit_ledger_entries WHERE target_site_id = 'site_export_b' AND action = 'audit.export';")).toBe(eventB + ":" + shaB + ":1:1:1");
  });

  test("refuses role, CSRF, injected scope, and a corrupted chain without NDJSON bytes", async () => {
    const requester = await appFetch(authenticatedRequest("requesterA", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 1 },
    }));
    expect(requester.status).toBe(403);
    expect(requester.headers.get("content-type")).not.toContain("application/x-ndjson");
    expect(requester.headers.get("x-audit-export-sha256")).toBeNull();
    expect(requester.headers.get("x-audit-export-event")).toBeNull();
    expect(psql("SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = 'site_export_a' AND action = 'audit.export' AND decision = 'denied' AND reason_code = 'ROLE_PERMISSION_DENIED';")).toBe("1");
    const csrf = await appFetch(authenticatedRequest("auditorA", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 1 }, headers: { "x-csrf-token": "forged" },
    }));
    expect(csrf.status).toBe(403);
    expect(csrf.headers.get("content-type")).not.toContain("application/x-ndjson");
    expect(csrf.headers.get("x-audit-export-sha256")).toBeNull();
    expect(csrf.headers.get("x-audit-export-event")).toBeNull();
    const injectedScope = await appFetch(authenticatedRequest("auditorA", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 1, siteId: "site_export_b" },
    }));
    expect(injectedScope.status).toBe(400);
    expect(injectedScope.headers.get("content-type")).not.toContain("application/x-ndjson");
    expect(injectedScope.headers.get("x-audit-export-sha256")).toBeNull();
    expect(injectedScope.headers.get("x-audit-export-event")).toBeNull();
    psql("SET session_replication_role = replica; UPDATE audit_ledger_entries SET entry_hash = repeat('0', 64) WHERE target_site_id = 'site_export_b' AND sequence = 1; SET session_replication_role = origin;");
    const corrupted = await appFetch(authenticatedRequest("auditorB", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 1 },
    }));
    expect(corrupted.status).toBe(409);
    expect(corrupted.headers.get("x-audit-export-sha256")).toBeNull();
    expect(corrupted.headers.get("content-type")).not.toContain("application/x-ndjson");
    expect(corrupted.headers.get("x-audit-export-event")).toBeNull();
  });

  test("returns an empty 503 when the success audit append fails after a valid read", async () => {
    psql("SET session_replication_role = replica; UPDATE audit_ledger_heads SET last_entry_hash = repeat('0', 64) WHERE target_site_id = 'site_export_a'; SET session_replication_role = origin;");
    const response = await appFetch(authenticatedRequest("auditorA", "/api/audit/exports", {
      method: "POST", body: { fromSequence: 1, toSequence: 2 },
    }));
    expect(response.status).toBe(503);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBeNull();
    expect(response.headers.get("x-audit-export-sha256")).toBeNull();
    expect(response.headers.get("x-audit-export-event")).toBeNull();
    expect(psql("SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = 'site_export_a' AND action = 'audit.export' AND reason_code = 'AUDIT_EXPORT_COMPLETED';")).toBe("1");
  });
});
