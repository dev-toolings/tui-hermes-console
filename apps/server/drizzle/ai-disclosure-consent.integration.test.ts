import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-ai-consent-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };
const artifactRoot = await mkdtemp(join(tmpdir(), "hermes-ai-consent-"));

const CURRENT_VERSION = "2026-08-01.v2";
const sessions = {
  first: { userId: "usr_ai_consent_first", token: "token-ai-consent-first", csrf: "csrf-ai-consent-first" },
  second: { userId: "usr_ai_consent_second", token: "token-ai-consent-second", csrf: "csrf-ai-consent-second" },
} as const;

type SessionName = keyof typeof sessions;
type AppFetch = (request: Request) => Response | Promise<Response>;
let appFetch: AppFetch;

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function psql(statement: string, database = "ai_consent") {
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
      database,
      "-Atq",
    ],
    statement,
  );
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function applyMigrations() {
  // The consent boundary does not exercise lifecycle policy, but the current
  // runs table also carries the nullable approval claim introduced in 0026.
  for (const entry of journal.entries.filter(({ idx }) => idx <= 28)) {
    psql(readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

async function waitForPostgres() {
  const initCompleteMarker = "PostgreSQL init process complete; ready for start up.";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
    const output = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
    const ready = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    ).status === 0;
    if (output.includes(initCompleteMarker) && ready) return;
    await Bun.sleep(250);
  }
  throw new Error("PostgreSQL n’est pas prêt après 15 secondes.");
}

function authenticatedRequest(
  name: SessionName,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const session = sessions[name];
  const headers = new Headers(options.headers);
  headers.set("cookie", `hc_session=${session.token}`);
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    headers.set("x-csrf-token", session.csrf);
  }
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return new Request(`http://console.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
}

async function payload(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

function sideEffectSnapshot() {
  return psql(`SELECT jsonb_build_object(
    'threads', (SELECT count(*) FROM threads),
    'runs', (SELECT count(*) FROM runs),
    'messages', (SELECT count(*) FROM messages),
    'artifacts', (SELECT count(*) FROM artifacts)
  )::text;`);
}

async function withoutRuntimeFetch(operation: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const runtimeCalls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    runtimeCalls.push(input instanceof Request ? input.url : String(input));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    return { response: await operation(), runtimeCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function setupSnapshot() {
  return psql(`SELECT step || ':' || coalesce(runtime_config_version, '<null>')
    FROM console_setup WHERE id = 'default';`);
}

function consentSnapshot(userId: string) {
  return psql(`SELECT coalesce(ai_disclosure_version, '<null>') || ':' ||
      coalesce(ai_disclosure_accepted_at::text, '<null>')
    FROM console_users WHERE id = ${sqlString(userId)};`);
}

function setSetup(step: "runtime" | "completed") {
  if (step === "runtime") {
    psql(`UPDATE console_setup
      SET step = 'runtime', completed_at = NULL, runtime_verified_at = NULL,
          runtime_config_version = NULL, updated_at = now()
      WHERE id = 'default';`);
    return;
  }
  psql(`UPDATE console_setup
    SET step = 'completed', completed_at = now(), runtime_verified_at = now(),
        runtime_config_version = 'database:1', updated_at = now()
    WHERE id = 'default';`);
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("AI disclosure consent through Hono and PostgreSQL", () => {
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
      "POSTGRES_HOST_AUTH_METHOD=trust",
      POSTGRES_IMAGE,
    ]);
    await waitForPostgres();
    psql('CREATE DATABASE "ai_consent";', "postgres");
    applyMigrations();

    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);

    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/ai_consent`;
    process.env.APP_ENCRYPTION_KEY = "p-int-ai-disclosure-consent";
    process.env.HERMES_CONSOLE_ARTIFACTS_DIR = artifactRoot;
    process.env.GOOGLE_ALLOWED_EMAILS = "first@example.com,second@example.com";

    const { encryptSecret } = await import("@/lib/crypto");
    const encryptedRuntimeToken = encryptSecret("runtime-token");
    psql(`
      INSERT INTO organizations (id, name, slug, kind)
      VALUES ('org_ai_consent', 'AI consent client', 'ai-consent-client', 'client');
      INSERT INTO sites (id, client_organization_id, name, slug)
      VALUES ('site_ai_consent', 'org_ai_consent', 'AI consent', 'ai-consent');
      INSERT INTO console_users (id, email, google_subject)
      VALUES
        ('usr_ai_consent_first', 'first@example.com', 'sub-ai-consent-first'),
        ('usr_ai_consent_second', 'second@example.com', 'sub-ai-consent-second');
      INSERT INTO organization_memberships (user_id, organization_id)
      VALUES
        ('usr_ai_consent_first', 'org_ai_consent'),
        ('usr_ai_consent_second', 'org_ai_consent');
      INSERT INTO site_memberships (user_id, site_id, organization_id, role)
      VALUES
        ('usr_ai_consent_first', 'site_ai_consent', 'org_ai_consent', 'admin'),
        ('usr_ai_consent_second', 'site_ai_consent', 'org_ai_consent', 'admin');
      INSERT INTO console_sessions
        (token_hash, user_id, site_id, csrf_token, expires_at)
      VALUES
        ('${createHash("sha256").update(sessions.first.token).digest("hex")}',
          'usr_ai_consent_first', 'site_ai_consent', 'csrf-ai-consent-first', now() + interval '1 day'),
        ('${createHash("sha256").update(sessions.second.token).digest("hex")}',
          'usr_ai_consent_second', 'site_ai_consent', 'csrf-ai-consent-second', now() + interval '1 day');
      INSERT INTO runtime_config
        (id, name, base_url, encrypted_token, config_revision)
      VALUES ('default', 'Hermes test', 'http://runtime.invalid', ${sqlString(encryptedRuntimeToken)}, 1);
      INSERT INTO console_setup
        (id, step, completed_at, runtime_verified_at, runtime_config_version)
      VALUES ('default', 'runtime', NULL, NULL, NULL);
    `);

    const server = (await import("@/index")).default;
    appFetch = server.fetch as AppFetch;
    await Bun.sleep(100);
  }, 30_000);

  beforeEach(() => {
    psql(`UPDATE console_users
      SET ai_disclosure_version = NULL, ai_disclosure_accepted_at = NULL,
          updated_at = now()
      WHERE id IN ('usr_ai_consent_first', 'usr_ai_consent_second');`);
    setSetup("runtime");
    psql("TRUNCATE messages, run_events, runs, threads RESTART IDENTITY CASCADE;");
  });

  afterAll(async () => {
    const databaseGlobal = globalThis as typeof globalThis & {
      hermesConsoleSql?: { end(options?: { timeout?: number }): Promise<void> };
      hermesConsoleDb?: unknown;
    };
    await databaseGlobal.hermesConsoleSql?.end({ timeout: 0 });
    delete databaseGlobal.hermesConsoleSql;
    delete databaseGlobal.hermesConsoleDb;
    delete process.env.DATABASE_URL;
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.HERMES_CONSOLE_ARTIFACTS_DIR;
    delete process.env.GOOGLE_ALLOWED_EMAILS;
    await rm(artifactRoot, { recursive: true, force: true });
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("returns 423 before an incomplete setup can create a thread or run", async () => {
    const authRead = await appFetch(authenticatedRequest("first", "/api/auth"));
    expect(authRead.status).toBe(200);
    expect((await payload(authRead)).consentRequired).toBe(true);
    const before = sideEffectSnapshot();
    const setupBefore = setupSnapshot();
    const blocked = await withoutRuntimeFetch(() =>
      appFetch(
        authenticatedRequest("first", "/api/threads", {
          method: "POST",
          // This payload would be rejected by the route parser if the boundary
          // let it through; 423 proves the middleware stopped the request first.
          body: { message: "" },
        }),
      ),
    );

    expect(blocked.response.status).toBe(423);
    expect((await payload(blocked.response)).error.code).toBe("SETUP_REQUIRED");
    expect(blocked.runtimeCalls).toEqual([]);
    expect(sideEffectSnapshot()).toBe(before);
    expect(setupSnapshot()).toBe(setupBefore);
    expect(consentSnapshot(sessions.first.userId)).toContain("<null>:<null>");
  });

  test("returns 428 on every consentless run-start route before any side effect", async () => {
    setSetup("completed");
    for (const path of [
      "/api/threads",
      "/api/threads/thread_missing/messages",
      "/api/runs/run_missing/retry",
    ]) {
      const before = sideEffectSnapshot();
      const blocked = await withoutRuntimeFetch(() =>
        appFetch(
          authenticatedRequest("first", path, {
            method: "POST",
            body: { message: "" },
          }),
        ),
      );
      expect(blocked.response.status).toBe(428);
      expect((await payload(blocked.response)).error.code).toBe("AI_DISCLOSURE_CONSENT_REQUIRED");
      expect(blocked.runtimeCalls).toEqual([]);
      expect(sideEffectSnapshot()).toBe(before);
    }
    expect(setupSnapshot()).toBe("completed:database:1");
    expect(consentSnapshot(sessions.first.userId)).toContain("<null>:<null>");
  });

  test("rejects a stale disclosure version without persisting consent", async () => {
    setSetup("completed");
    const response = await appFetch(
      authenticatedRequest("first", "/api/setup", {
        method: "POST",
        body: { consentVersion: "2026-08-01.v1" },
      }),
    );

    expect(response.status).toBe(409);
    expect((await payload(response)).error.code).toBe("AI_DISCLOSURE_VERSION_OUTDATED");
    expect(consentSnapshot(sessions.first.userId)).toContain("<null>:<null>");
  });

  test("persists exact-version consent for the accepting user", async () => {
    setSetup("completed");
    const response = await appFetch(
      authenticatedRequest("first", "/api/setup", {
        method: "POST",
        body: { consentVersion: CURRENT_VERSION },
      }),
    );
    const body = await payload(response);

    expect(response.status).toBe(200);
    expect(body.consent).toMatchObject({ current: true, version: CURRENT_VERSION });
    expect(typeof body.consent.acceptedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.consent.acceptedAt))).toBe(false);
    expect(consentSnapshot(sessions.first.userId)).toMatch(
      new RegExp(`^${CURRENT_VERSION}:`),
    );

    const setupRead = await appFetch(authenticatedRequest("first", "/api/setup"));
    expect(setupRead.status).toBe(200);
    expect((await payload(setupRead)).setup.consent).toMatchObject({
      current: true,
      version: CURRENT_VERSION,
    });
    const authRead = await appFetch(authenticatedRequest("first", "/api/auth"));
    expect(authRead.status).toBe(200);
    expect((await payload(authRead)).consentRequired).toBe(false);
  });

  test("keeps consent isolated per user and leaves the second user at 428", async () => {
    setSetup("completed");
    const accepted = await appFetch(
      authenticatedRequest("first", "/api/setup", {
        method: "POST",
        body: { consentVersion: CURRENT_VERSION },
      }),
    );
    expect(accepted.status).toBe(200);

    const secondSetup = await appFetch(authenticatedRequest("second", "/api/setup"));
    expect(secondSetup.status).toBe(200);
    expect((await payload(secondSetup)).setup.consent).toMatchObject({
      current: false,
      version: null,
      acceptedAt: null,
    });

    const before = sideEffectSnapshot();
    const secondBlocked = await withoutRuntimeFetch(() =>
      appFetch(
        authenticatedRequest("second", "/api/threads", {
          method: "POST",
          body: { message: "" },
        }),
      ),
    );
    expect(secondBlocked.response.status).toBe(428);
    expect((await payload(secondBlocked.response)).error.code).toBe("AI_DISCLOSURE_CONSENT_REQUIRED");
    expect(secondBlocked.runtimeCalls).toEqual([]);
    expect(sideEffectSnapshot()).toBe(before);
    expect(consentSnapshot(sessions.first.userId)).toMatch(new RegExp(`^${CURRENT_VERSION}:`));
    expect(consentSnapshot(sessions.second.userId)).toContain("<null>:<null>");
  });
});
