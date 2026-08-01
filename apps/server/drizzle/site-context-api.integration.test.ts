import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const runtimeEffect = mock(() => undefined);
const stopEffect = mock(() => undefined);
const approvalEffect = mock(() => undefined);
const deleteSessionEffect = mock(() => undefined);
const removeEffect = mock(() => undefined);
const streamEffect = mock(() => undefined);
const readEffect = mock(() => undefined);
const runtime = {
  baseUrl: "http://runtime.invalid",
  remoteBaseUrl: "http://runtime.invalid",
  token: "token",
  transport: "direct" as const,
  source: "database" as const,
};

import { GET as listAgents } from "@/api/agents/route";
import { DELETE as deleteAgent } from "@/api/agents/[agentId]/route";
import { GET as listConnectors } from "@/api/connectors/route";
import { GET as listThreads } from "@/api/threads/route";
import { DELETE as deleteThread } from "@/api/threads/[threadId]/route";
import { GET as streamThread } from "@/api/threads/[threadId]/events/route";
import { POST as cancelRun } from "@/api/runs/[runId]/cancel/route";
import { POST as approveRun } from "@/api/runs/[runId]/approval/route";
import { GET as listFiles } from "@/api/files/route";
import { GET as readFile } from "@/api/files/[fileId]/route";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { deleteAgent as deleteAgentScoped } from "@/modules/agents/repository";
import { deleteThread as deleteThreadScoped } from "@/modules/runs/delete-thread";
import { cancelRun as cancelRunScoped } from "@/modules/runs/cancel-run";
import { respondRunApproval as approveRunScoped } from "@/modules/runs/respond-approval";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-site-api-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

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

function psql(statement: string, database = "site_api") {
  return docker([
    "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-Atq",
  ], statement);
}

function applyMigrations() {
  for (const entry of journal.entries.filter(({ idx }) => idx <= 21)) {
    psql(readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

const actor = {
  siteId: "paris",
  userId: "usr_paris",
  role: "operator" as const,
  correlationId: "p-int-site-scope",
};

function context<T extends Record<string, string>>(params: T): AuthenticatedRouteContext<T> {
  return { params: Promise.resolve(params), siteContext: actor };
}

function request(path: string, method = "GET", body?: object) {
  return new Request(`http://console.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function expectSameNotFound(left: Response, right: Response, code: string) {
  expect(left.status).toBe(404);
  expect(right.status).toBe(404);
  const leftPayload = await left.json() as { error: { code: string } };
  const rightPayload = await right.json() as { error: { code: string } };
  expect(leftPayload).toEqual(rightPayload);
  expect(leftPayload.error.code).toBe(code);
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("site context API isolation on PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName,
      "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0) break;
      await Bun.sleep(250);
    }
    psql('CREATE DATABASE "site_api";', "postgres");
    applyMigrations();
    psql(`
      INSERT INTO sites (id, name, slug) VALUES
        ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon');
      INSERT INTO console_users (id, email, google_subject) VALUES
        ('usr_paris', 'paris@example.com', 'sub-paris'),
        ('usr_lyon', 'lyon@example.com', 'sub-lyon');
      INSERT INTO site_memberships (user_id, site_id, role)
        VALUES ('usr_paris', 'paris', 'operator'), ('usr_lyon', 'lyon', 'admin');
      INSERT INTO agents (id, site_id, owner_user_id, author_user_id, name, slug, instructions) VALUES
        ('agt_paris', 'paris', 'usr_paris', 'usr_paris', 'Paris agent', 'paris-agent', 'Paris'),
        ('agt_lyon', 'lyon', 'usr_lyon', 'usr_lyon', 'Lyon agent', 'lyon-agent', 'Lyon');
      INSERT INTO connectors
        (id, site_id, owner_user_id, author_user_id, type, label, email, imap_host, encrypted_password) VALUES
        ('con_paris', 'paris', 'usr_paris', 'usr_paris', 'gmail_imap', 'Paris inbox', 'p@example.com', 'imap.example.com', 'cipher'),
        ('con_lyon', 'lyon', 'usr_lyon', 'usr_lyon', 'gmail_imap', 'Lyon inbox', 'l@example.com', 'imap.example.com', 'cipher');
      INSERT INTO threads
        (id, site_id, owner_user_id, author_user_id, title, agent_id, agent_name, instructions, hermes_conversation) VALUES
        ('thr_paris', 'paris', 'usr_paris', 'usr_paris', 'Paris thread', 'agt_paris', 'Paris agent', 'Paris', 'console:paris'),
        ('thr_lyon', 'lyon', 'usr_lyon', 'usr_lyon', 'Lyon thread', 'agt_lyon', 'Lyon agent', 'Lyon', 'console:lyon');
      INSERT INTO runs
        (id, site_id, owner_user_id, author_user_id, thread_id, input, status, hermes_response_id) VALUES
        ('run_paris', 'paris', 'usr_paris', 'usr_paris', 'thr_paris', 'Paris', 'completed', 'hermes-paris'),
        ('run_lyon', 'lyon', 'usr_lyon', 'usr_lyon', 'thr_lyon', 'Lyon', 'awaiting_approval', 'hermes-lyon');
      INSERT INTO artifacts
        (id, site_id, owner_user_id, author_user_id, run_id, direction, filename, storage_path, size_bytes, checksum_sha256) VALUES
        ('file_paris', 'paris', 'usr_paris', 'usr_paris', 'run_paris', 'output', 'paris.txt', '/vault/paris.txt', 1, '00'),
        ('file_lyon', 'lyon', 'usr_lyon', 'usr_lyon', 'run_lyon', 'output', 'lyon.txt', '/vault/lyon.txt', 1, '00');
    `);
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/site_api`;
    process.env.APP_ENCRYPTION_KEY = "p-int-site-scope-hmac";
  }, 30_000);

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
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("lists expose only the actor site", async () => {
    const agents = await (await listAgents(request("/api/agents"), context({}))).json() as { agents: Array<{ id: string }> };
    const connectors = await (await listConnectors(request("/api/connectors"), context({}))).json() as { connectors: Array<{ label: string }> };
    const threads = await (await listThreads(request("/api/threads"), context({}))).json() as { threads: Array<{ id: string }> };
    const files = await (await listFiles(request("/api/files"), context({}))).json() as { artifacts: Array<{ id: string }> };
    expect(agents.agents.map(({ id }) => id)).toEqual(["agt_paris"]);
    expect(connectors.connectors.map(({ label }) => label)).toEqual(["Paris inbox"]);
    expect(threads.threads.map(({ id }) => id)).toEqual(["thr_paris"]);
    expect(files.artifacts.map(({ id }) => id)).toEqual(["file_paris"]);
  });

  test("foreign and random ids share 404s and cannot mutate business rows or trigger effects", async () => {
    const before = psql(`SELECT
      (SELECT count(*) FROM agents) || ':' ||
      (SELECT count(*) FROM threads) || ':' ||
      (SELECT status FROM runs WHERE id = 'run_lyon') || ':' ||
      (SELECT count(*) FROM artifacts);`);

    await expectSameNotFound(
      await deleteAgent(request("/api/agents/agt_lyon", "DELETE"), context({ agentId: "agt_lyon" }), {
        delete: (ctx, id) => deleteAgentScoped(ctx, id, {
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          deleteSession: async () => { deleteSessionEffect(); },
        }),
      }),
      await deleteAgent(request("/api/agents/agt_random", "DELETE"), context({ agentId: "agt_random" }), {
        delete: (ctx, id) => deleteAgentScoped(ctx, id, {
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          deleteSession: async () => { deleteSessionEffect(); },
        }),
      }),
      "AGENT_NOT_FOUND",
    );
    await expectSameNotFound(
      await deleteThread(request("/api/threads/thr_lyon", "DELETE"), context({ threadId: "thr_lyon" }), {
        delete: (ctx, id) => deleteThreadScoped(ctx, id, {
          cancel: async () => { stopEffect(); return { runId: "x", status: "cancelled", local: false, remoteStop: false }; },
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          deleteSession: async () => { deleteSessionEffect(); },
          remove: async () => { removeEffect(); },
        }),
      }),
      await deleteThread(request("/api/threads/thr_random", "DELETE"), context({ threadId: "thr_random" }), {
        delete: (ctx, id) => deleteThreadScoped(ctx, id, {
          cancel: async () => { stopEffect(); return { runId: "x", status: "cancelled", local: false, remoteStop: false }; },
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          deleteSession: async () => { deleteSessionEffect(); },
          remove: async () => { removeEffect(); },
        }),
      }),
      "THREAD_NOT_FOUND",
    );
    await expectSameNotFound(
      await cancelRun(request("/api/runs/run_lyon/cancel", "POST"), context({ runId: "run_lyon" }), {
        cancel: (ctx, id) => cancelRunScoped(ctx, id, {
          cancelLocal: () => { stopEffect(); return false; },
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          stopRemote: async () => { stopEffect(); },
        }),
      }),
      await cancelRun(request("/api/runs/run_random/cancel", "POST"), context({ runId: "run_random" }), {
        cancel: (ctx, id) => cancelRunScoped(ctx, id, {
          cancelLocal: () => { stopEffect(); return false; },
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          stopRemote: async () => { stopEffect(); },
        }),
      }),
      "RUN_NOT_FOUND",
    );
    await expectSameNotFound(
      await approveRun(request("/api/runs/run_lyon/approval", "POST", { choice: "once" }), context({ runId: "run_lyon" }), {
        approve: (ctx, id, body) => approveRunScoped(ctx, id, body, {
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          respondRemote: async () => { approvalEffect(); },
          isActive: () => { approvalEffect(); return false; },
          resume: () => { approvalEffect(); },
        }),
      }),
      await approveRun(request("/api/runs/run_random/approval", "POST", { choice: "once" }), context({ runId: "run_random" }), {
        approve: (ctx, id, body) => approveRunScoped(ctx, id, body, {
          resolveRuntime: async () => { runtimeEffect(); return runtime; },
          respondRemote: async () => { approvalEffect(); },
          isActive: () => { approvalEffect(); return false; },
          resume: () => { approvalEffect(); },
        }),
      }),
      "RUN_NOT_FOUND",
    );
    await expectSameNotFound(
      await streamThread(request("/api/threads/thr_lyon/events"), context({ threadId: "thr_lyon" }), { stream: () => { streamEffect(); return new Response("unexpected"); } }),
      await streamThread(request("/api/threads/thr_random/events"), context({ threadId: "thr_random" }), { stream: () => { streamEffect(); return new Response("unexpected"); } }),
      "THREAD_NOT_FOUND",
    );
    await expectSameNotFound(
      await readFile(request("/api/files/file_lyon"), context({ fileId: "file_lyon" }), { read: async () => { readEffect(); return new Uint8Array([1]); } }),
      await readFile(request("/api/files/file_random"), context({ fileId: "file_random" }), { read: async () => { readEffect(); return new Uint8Array([1]); } }),
      "ARTIFACT_NOT_FOUND",
    );

    expect(psql(`SELECT
      (SELECT count(*) FROM agents) || ':' ||
      (SELECT count(*) FROM threads) || ':' ||
      (SELECT status FROM runs WHERE id = 'run_lyon') || ':' ||
      (SELECT count(*) FROM artifacts);`)).toBe(before);
    expect(runtimeEffect).not.toHaveBeenCalled();
    expect(stopEffect).not.toHaveBeenCalled();
    expect(approvalEffect).not.toHaveBeenCalled();
    expect(deleteSessionEffect).not.toHaveBeenCalled();
    expect(removeEffect).not.toHaveBeenCalled();
    expect(streamEffect).not.toHaveBeenCalled();
    expect(readEffect).not.toHaveBeenCalled();
    expect(psql(`SELECT count(*) FROM audit_ledger_entries
      WHERE target_site_id = 'paris'
        AND decision = 'denied'
        AND reason_code = 'RESOURCE_NOT_FOUND_OR_OUT_OF_SCOPE';`)).toBe("12");
  });
});
