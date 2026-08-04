import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { readFileSync as readTextFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getDatabase } from "@/db/client";
import { createDataLifecyclePreview } from "@/modules/retention/service";
import { purgeDataLifecycle } from "@/modules/retention/purge";
import type { SiteRequestContext } from "@/modules/auth/service";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-lifecycle-purge-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readTextFile(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

const SITE_A = "site_purge_a";
const SITE_B = "site_purge_b";
const USER_A = "usr_purge_a";
const USER_B = "usr_purge_b";
const RUN_A = "run_purge_a";
const RUN_B = "run_purge_b";
const THREAD_A = "thread_purge_a";
const THREAD_B = "thread_purge_b";
const ARTIFACT_A = "artifact_purge_a";
const ARTIFACT_B = "artifact_purge_b";
const OLD = "2026-06-01T00:00:00.000Z";
const NOW = new Date("2026-08-01T00:00:00.000Z");

type Roots = { artifactRoot: string; sharedWorkdirRoot: string };

const contextA: SiteRequestContext = {
  siteId: SITE_A,
  userId: USER_A,
  role: "admin",
  actorOrganizationId: "org_purge_a",
  clientOrganizationId: "org_purge_a",
  mandateId: null,
  mandateProjectId: null,
  correlationId: "corr-purge-a",
};

const contextB: SiteRequestContext = {
  siteId: SITE_B,
  userId: USER_B,
  role: "admin",
  actorOrganizationId: "org_purge_b",
  clientOrganizationId: "org_purge_b",
  mandateId: null,
  mandateProjectId: null,
  correlationId: "corr-purge-b",
};

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

function psql(statement: string, database = "lifecycle_purge") {
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

async function waitForPostgres() {
  const marker = "PostgreSQL init process complete; ready for start up.";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
    const output = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
    const ready = spawnSync(
      "docker",
      ["exec", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;"],
      { stdio: "ignore" },
    ).status === 0;
    if (output.includes(marker) && ready) return;
    await Bun.sleep(250);
  }
  throw new Error("PostgreSQL scratch n’est pas prêt après 15 secondes.");
}

function applyMigrations() {
  for (const entry of journal.entries) {
    psql(readTextFile(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

function resetBusinessRows() {
  psql(
    "TRUNCATE data_lifecycle_preview_items, data_lifecycle_previews, site_data_lifecycle_policies, " +
      "approval_requests, artifacts, messages, run_events, runs, threads RESTART IDENTITY;",
  );
}

function seedBase() {
  psql(`
    INSERT INTO organizations (id, name, slug, kind) VALUES
      ('org_purge_a', 'Purge site A', 'purge-a', 'client'),
      ('org_purge_b', 'Purge site B', 'purge-b', 'client');
    INSERT INTO sites (id, client_organization_id, name, slug) VALUES
      ('${SITE_A}', 'org_purge_a', 'Purge site A', 'purge-a'),
      ('${SITE_B}', 'org_purge_b', 'Purge site B', 'purge-b');
    INSERT INTO console_users (id, email, google_subject) VALUES
      ('${USER_A}', 'purge-a@example.invalid', 'purge-a-subject'),
      ('${USER_B}', 'purge-b@example.invalid', 'purge-b-subject');
    INSERT INTO organization_memberships (user_id, organization_id) VALUES
      ('${USER_A}', 'org_purge_a'),
      ('${USER_B}', 'org_purge_b');
    INSERT INTO site_memberships (user_id, site_id, organization_id, role) VALUES
      ('${USER_A}', '${SITE_A}', 'org_purge_a', 'admin'),
      ('${USER_B}', '${SITE_B}', 'org_purge_b', 'admin');
  `, "lifecycle_purge");
}

async function makeRoots() {
  return {
    artifactRoot: await mkdtemp(join(tmpdir(), "hermes-lifecycle-purge-artifacts-")),
    sharedWorkdirRoot: await mkdtemp(join(tmpdir(), "hermes-lifecycle-purge-workdir-")),
  } satisfies Roots;
}

async function seedFixture(roots: Roots) {
  await Promise.all([
    mkdir(join(roots.artifactRoot, "runs", RUN_A), { recursive: true }),
    mkdir(join(roots.sharedWorkdirRoot, "runs", RUN_A), { recursive: true }),
    mkdir(join(roots.artifactRoot, "runs", RUN_B), { recursive: true }),
    mkdir(join(roots.sharedWorkdirRoot, "runs", RUN_B), { recursive: true }),
  ]);
  await Promise.all([
    Bun.write(join(roots.artifactRoot, "runs", RUN_A, "output.txt"), "site A artifact"),
    Bun.write(join(roots.sharedWorkdirRoot, "runs", RUN_A, "state.json"), "site A workdir"),
    Bun.write(join(roots.artifactRoot, "runs", RUN_B, "output.txt"), "site B artifact"),
    Bun.write(join(roots.sharedWorkdirRoot, "runs", RUN_B, "state.json"), "site B workdir"),
  ]);
  const artifactBytes = Buffer.from("site A artifact", "utf8");
  const artifactHash = createHash("sha256").update(artifactBytes).digest("hex");
  psql(`
    INSERT INTO site_data_lifecycle_policies
      (site_id, version, retention_days, legal_hold_enabled, legal_hold_reason, updated_by_user_id, created_at, updated_at)
    VALUES
      ('${SITE_A}', 1, 30, false, NULL, '${USER_A}', '${OLD}', '${OLD}'),
      ('${SITE_B}', 1, 30, false, NULL, '${USER_B}', '${OLD}', '${OLD}');
    INSERT INTO threads
      (id, site_id, owner_user_id, author_user_id, title, agent_name, instructions, model, source, hermes_conversation, created_at, updated_at)
    VALUES
      ('${THREAD_A}', '${SITE_A}', '${USER_A}', '${USER_A}', 'Purge A', 'agent-a', 'purge fixture', 'hermes-agent', 'chat', 'purge:a', '${OLD}', '${OLD}'),
      ('${THREAD_B}', '${SITE_B}', '${USER_B}', '${USER_B}', 'Purge B', 'agent-b', 'purge fixture', 'hermes-agent', 'chat', 'purge:b', '${OLD}', '${OLD}');
    INSERT INTO runs
      (id, site_id, owner_user_id, author_user_id, client_organization_id, thread_id, input, status, output, created_at, started_at, ended_at, last_event_at, workdir)
    VALUES
      ('${RUN_A}', '${SITE_A}', '${USER_A}', '${USER_A}', 'org_purge_a', '${THREAD_A}', 'purge A', 'completed', 'done', '${OLD}', '${OLD}', '${OLD}', '${OLD}', 'runs/${RUN_A}'),
      ('${RUN_B}', '${SITE_B}', '${USER_B}', '${USER_B}', 'org_purge_b', '${THREAD_B}', 'purge B', 'completed', 'done', '${OLD}', '${OLD}', '${OLD}', '${OLD}', 'runs/${RUN_B}');
    INSERT INTO messages (id, thread_id, run_id, role, content, created_at)
    VALUES ('message_purge_a', '${THREAD_A}', '${RUN_A}', 'assistant', '[{"type":"text","text":"done"}]'::jsonb, '${OLD}');
    INSERT INTO run_events (run_id, sequence, type, payload, occurred_at, created_at)
    VALUES ('${RUN_A}', 1, 'completed', '{"output":"done"}'::jsonb, '${OLD}', '${OLD}');
    INSERT INTO artifacts
      (id, site_id, owner_user_id, author_user_id, run_id, direction, filename, storage_path, mime_type, size_bytes, checksum_sha256, created_at)
    VALUES
      ('${ARTIFACT_A}', '${SITE_A}', '${USER_A}', '${USER_A}', '${RUN_A}', 'output', 'output.txt', 'runs/${RUN_A}/output.txt', 'text/plain', ${artifactBytes.byteLength}, '${artifactHash}', '${OLD}'),
      ('${ARTIFACT_B}', '${SITE_B}', '${USER_B}', '${USER_B}', '${RUN_B}', 'output', 'output.txt', 'runs/${RUN_B}/output.txt', 'text/plain', 16, '${createHash("sha256").update("site B artifact").digest("hex")}', '${OLD}');
  `);

  const preview = await createDataLifecyclePreview(contextA, {
    database: getDatabase(),
    now: () => NOW,
  });
  expect(preview.id).toBeString();
  return { previewId: preview.id, roots, artifactHash };
}

async function countState(previewId: string) {
  return {
    threadsA: psql(`SELECT count(*) FROM threads WHERE site_id = '${SITE_A}'`),
    runsA: psql(`SELECT count(*) FROM runs WHERE site_id = '${SITE_A}'`),
    messagesA: psql(`SELECT count(*) FROM messages WHERE thread_id = '${THREAD_A}'`),
    eventsA: psql(`SELECT count(*) FROM run_events WHERE run_id = '${RUN_A}'`),
    artifactsA: psql(`SELECT count(*) FROM artifacts WHERE site_id = '${SITE_A}'`),
    threadsB: psql(`SELECT count(*) FROM threads WHERE site_id = '${SITE_B}'`),
    runsB: psql(`SELECT count(*) FROM runs WHERE site_id = '${SITE_B}'`),
    artifactsB: psql(`SELECT count(*) FROM artifacts WHERE site_id = '${SITE_B}'`),
    previewPurgedAt: psql(`SELECT coalesce(purged_at::text, '') FROM data_lifecycle_previews WHERE id = '${previewId}'`),
  };
}

async function pathState(roots: Roots) {
  const paths = [
    join(roots.artifactRoot, "runs", RUN_A),
    join(roots.sharedWorkdirRoot, "runs", RUN_A),
    join(roots.artifactRoot, "runs", RUN_B),
    join(roots.sharedWorkdirRoot, "runs", RUN_B),
  ];
  return Promise.all(paths.map(async (path) => {
    try {
      const stat = await lstat(path);
      return `${path}:${stat.isSymbolicLink() ? "symlink" : "present"}`;
    } catch {
      return `${path}:missing`;
    }
  }));
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("data lifecycle purge against pinned PostgreSQL and filesystem", () => {
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
    psql('CREATE DATABASE "lifecycle_purge";', "postgres");
    applyMigrations();
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/lifecycle_purge`;
    process.env.APP_ENCRYPTION_KEY = "p-int-lifecycle-purge";
    seedBase();
  }, 30_000);

  beforeEach(() => {
    resetBusinessRows();
  });

  afterAll(async () => {
    const globals = globalThis as typeof globalThis & {
      hermesConsoleSql?: { end(options?: { timeout?: number }): Promise<void> };
      hermesConsoleDb?: unknown;
    };
    await globals.hermesConsoleSql?.end({ timeout: 0 });
    delete globals.hermesConsoleSql;
    delete globals.hermesConsoleDb;
    delete process.env.DATABASE_URL;
    delete process.env.APP_ENCRYPTION_KEY;
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("purges one preview atomically, removes bounded files, stamps purgedAt, and audits success", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      const result = await purgeDataLifecycle(
        contextA,
        { previewId: fixture.previewId },
        { database: getDatabase(), ...roots, now: () => NOW },
      );
      expect(result).toEqual(expect.objectContaining({ previewId: fixture.previewId }));
      expect(new Date(result.purgedAt).toISOString()).toBe(result.purgedAt);
      const state = await countState(fixture.previewId);
      expect(state).toMatchObject({
        threadsA: "0",
        runsA: "0",
        messagesA: "0",
        eventsA: "0",
        artifactsA: "0",
        threadsB: "1",
        runsB: "1",
        artifactsB: "1",
      });
      expect(state.previewPurgedAt).not.toBe("");
      expect(await pathState(roots)).toEqual(expect.arrayContaining([
        `${join(roots.artifactRoot, "runs", RUN_A)}:missing`,
        `${join(roots.sharedWorkdirRoot, "runs", RUN_A)}:missing`,
        `${join(roots.artifactRoot, "runs", RUN_B)}:present`,
        `${join(roots.sharedWorkdirRoot, "runs", RUN_B)}:present`,
      ]));
      expect(psql(`SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = '${SITE_A}' AND action = 'data.lifecycle.purge' AND resource_id = '${fixture.previewId}' AND decision = 'allowed'`)).toBe("2");
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("rejects a second purge with 409 and leaves the consumed preview untouched", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      await purgeDataLifecycle(contextA, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW });
      const before = { state: await countState(fixture.previewId), paths: await pathState(roots), audits: psql(`SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = '${SITE_A}'`) };
      await expect(
        purgeDataLifecycle(contextA, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_PURGE_ALREADY_CONSUMED", status: 409 });
      expect(await countState(fixture.previewId)).toEqual(before.state);
      expect(await pathState(roots)).toEqual(before.paths);
      expect(psql(`SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = '${SITE_A}'`)).toBe(String(Number(before.audits) + 1));
      expect(psql(`SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = '${SITE_A}' AND resource_id = '${fixture.previewId}' AND decision = 'denied' AND reason_code = 'LIFECYCLE_PURGE_ALREADY_CONSUMED'`)).toBe("1");
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("rechecks a legal hold activated after preview and performs no business mutation", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      psql(`UPDATE site_data_lifecycle_policies SET legal_hold_enabled = true, legal_hold_reason = 'litigation' WHERE site_id = '${SITE_A}'`);
      const before = { state: await countState(fixture.previewId), paths: await pathState(roots) };
      await expect(
        purgeDataLifecycle(contextA, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_PURGE_LEGAL_HOLD", status: 409 });
      expect(await countState(fixture.previewId)).toEqual(before.state);
      expect(await pathState(roots)).toEqual(before.paths);
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("rejects policy drift and an active run after the preview", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      psql(`UPDATE site_data_lifecycle_policies SET version = 2 WHERE site_id = '${SITE_A}'`);
      await expect(
        purgeDataLifecycle(contextA, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_PURGE_POLICY_CHANGED", status: 409 });

      psql(`UPDATE site_data_lifecycle_policies SET version = 1 WHERE site_id = '${SITE_A}'`);
      psql(`UPDATE runs SET status = 'running' WHERE id = '${RUN_A}'`);
      await expect(
        purgeDataLifecycle(contextA, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_PURGE_ACTIVE_RUN", status: 409 });
      expect(await countState(fixture.previewId)).toMatchObject({ threadsA: "1", runsA: "1", artifactsA: "1" });
      expect(await pathState(roots)).toEqual(expect.arrayContaining([
        `${join(roots.artifactRoot, "runs", RUN_A)}:present`,
        `${join(roots.sharedWorkdirRoot, "runs", RUN_A)}:present`,
      ]));
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("persists cleanup_pending when post-commit quarantine cleanup fails", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      const result = await purgeDataLifecycle(
        contextA,
        { previewId: fixture.previewId },
        {
          database: getDatabase(),
          ...roots,
          now: () => NOW,
          filesystem: {
            lstat,
            mkdir,
            rename,
            rm: async () => { throw new Error("cleanup unavailable"); },
          },
        },
      );
      expect(result.cleanupPending).toBe(true);
      expect(psql(`SELECT cleanup_pending::text FROM data_lifecycle_previews WHERE id = '${fixture.previewId}'`)).toBe("true");
      expect(await pathState(roots)).toEqual(expect.arrayContaining([
        `${join(roots.artifactRoot, "runs", RUN_A)}:missing`,
        `${join(roots.sharedWorkdirRoot, "runs", RUN_A)}:missing`,
      ]));
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("scopes preview ownership to the calling site and refuses a cross-site purge", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      let error: unknown;
      try {
        await purgeDataLifecycle(contextB, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW });
      } catch (caught) {
        error = caught;
      }
      const status = (error as { status?: unknown })?.status;
      expect(status === 404 || status === 409).toBe(true);
      expect(await countState(fixture.previewId)).toMatchObject({ threadsA: "1", runsA: "1", artifactsA: "1", threadsB: "1", runsB: "1", artifactsB: "1" });
      expect(await pathState(roots)).toEqual(expect.arrayContaining([
        `${join(roots.artifactRoot, "runs", RUN_A)}:present`,
        `${join(roots.sharedWorkdirRoot, "runs", RUN_A)}:present`,
      ]));
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("fails closed when the success audit append is unavailable", async () => {
    const roots = await makeRoots();
    try {
      const fixture = await seedFixture(roots);
      const before = { state: await countState(fixture.previewId), paths: await pathState(roots) };
      await expect(
        purgeDataLifecycle(contextA, { previewId: fixture.previewId }, {
          database: getDatabase(),
          ...roots,
          now: () => NOW,
          appendInTransaction: async () => {
            throw new Error("audit ledger unavailable");
          },
        }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_PURGE_AUDIT_UNAVAILABLE", status: 503 });
      expect(await countState(fixture.previewId)).toEqual(before.state);
      expect(await pathState(roots)).toEqual(before.paths);
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
    }
  });

  test("refuses a symlinked run directory without deleting the external target", async () => {
    const roots = await makeRoots();
    const outside = await mkdtemp(join(tmpdir(), "hermes-lifecycle-purge-outside-"));
    try {
      const fixture = await seedFixture(roots);
      const hostileRunPath = join(roots.artifactRoot, "runs", RUN_A);
      await rm(hostileRunPath, { recursive: true, force: true });
      await writeFile(join(outside, "keep.txt"), "do not delete");
      await symlink(outside, hostileRunPath, "dir");
      await expect(
        purgeDataLifecycle(contextA, { previewId: fixture.previewId }, { database: getDatabase(), ...roots, now: () => NOW }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_PURGE_STORAGE_INVALID" });
      expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("do not delete");
      expect((await lstat(hostileRunPath)).isSymbolicLink()).toBe(true);
      expect(await countState(fixture.previewId)).toMatchObject({ threadsA: "1", runsA: "1", artifactsA: "1" });
    } finally {
      await rm(roots.artifactRoot, { recursive: true, force: true });
      await rm(roots.sharedWorkdirRoot, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
