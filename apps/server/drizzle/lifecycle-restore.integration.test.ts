import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync as readTextFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  buildLifecycleExportManifest,
  hashLifecycleExportManifest,
  serializeLifecycleExport,
} from "@/modules/retention/export";
import {
  LifecycleRestoreError,
  restoreLifecycleExportToScratch,
} from "@/modules/retention/restore";
import { getDatabase } from "@/db/client";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-lifecycle-restore-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readTextFile(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

const siteId = "site_restore_scratch";
const userId = "usr_restore_scratch";
const runId = "run_restore_scratch";
const threadId = "thread_restore_scratch";

type BundleFixture = { body: string; sha256: string };
let bundleFixture: BundleFixture;

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

function psql(statement: string, database = "lifecycle_restore") {
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

function applyMigrations() {
  for (const entry of journal.entries.filter(({ idx }) => idx <= 28)) {
    psql(readTextFile(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

async function waitForPostgres() {
  const marker = "PostgreSQL init process complete; ready for start up.";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
    const output = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
    const ready = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    ).status === 0;
    if (output.includes(marker) && ready) return;
    await Bun.sleep(250);
  }
  throw new Error("PostgreSQL scratch n’est pas prêt après 15 secondes.");
}

function fixture() {
  const artifactBytes = Buffer.from("scratch artifact bytes", "utf8");
  const artifactHash = createHash("sha256").update(artifactBytes).digest("hex");
  const payload = {
    version: 1 as const,
    type: "hermes_console_business_export" as const,
    siteId,
    previewId: "preview_restore_scratch",
    policyVersion: 1,
    retentionDays: 30,
    cutoffAt: "2026-07-01T00:00:00.000Z",
    generatedAt: "2026-08-01T00:00:00.000Z",
    threads: [{
      id: threadId,
      siteId,
      projectId: null,
      ownerUserId: userId,
      authorUserId: userId,
      title: "Scratch thread",
      agentId: null,
      agentName: "Scratch agent",
      instructions: "scratch",
      provider: null,
      model: "hermes-agent",
      reasoningEffort: null,
      source: "chat",
      hermesConversation: "scratch:conversation",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }],
    runs: [{
      id: runId,
      siteId,
      projectId: null,
      ownerUserId: userId,
      authorUserId: userId,
      mandateId: null,
      operatorOrganizationId: null,
      clientOrganizationId: "org_restore_scratch",
      threadId,
      input: "scratch",
      status: "completed",
      hermesResponseId: null,
      output: "restored",
      usage: null,
      error: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:01:00.000Z",
      lastEventAt: "2026-06-01T00:01:00.000Z",
      workdir: null,
    }],
    messages: [{
      id: "message_restore_scratch",
      threadId,
      runId,
      role: "assistant",
      content: [{ type: "text", text: "restored" }],
      createdAt: "2026-06-01T00:01:00.000Z",
    }],
    events: [{
      id: 42,
      runId,
      sequence: 1,
      type: "completed",
      payload: { output: "restored" },
      occurredAt: "2026-06-01T00:01:00.000Z",
      createdAt: "2026-06-01T00:01:00.000Z",
    }],
    artifacts: [{
      id: "artifact_restore_scratch",
      siteId,
      runId,
      ownerUserId: userId,
      authorUserId: userId,
      direction: "output",
      filename: "scratch.txt",
      mimeType: "text/plain",
      sizeBytes: artifactBytes.byteLength,
      checksumSha256: artifactHash,
      createdAt: "2026-06-01T00:01:00.000Z",
      bytesBase64: artifactBytes.toString("base64"),
    }],
  };
  const manifest = buildLifecycleExportManifest(payload);
  const body = serializeLifecycleExport({
    ...payload,
    manifest,
    manifestSha256: hashLifecycleExportManifest(manifest),
  });
  return { body: body.body, sha256: body.sha256 };
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("business-export scratch restore through PostgreSQL and files", () => {
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
    psql('CREATE DATABASE "lifecycle_restore";', "postgres");
    applyMigrations();
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/lifecycle_restore`;
    psql(`
      INSERT INTO organizations (id, name, slug, kind)
      VALUES ('org_restore_scratch', 'Restore scratch', 'restore-scratch', 'client');
      INSERT INTO sites (id, client_organization_id, name, slug)
      VALUES ('${siteId}', 'org_restore_scratch', 'Restore scratch', 'restore-scratch');
      INSERT INTO console_users (id, email, google_subject)
      VALUES ('${userId}', 'restore-scratch@example.invalid', 'restore-scratch-subject');
      INSERT INTO organization_memberships (user_id, organization_id)
      VALUES ('${userId}', 'org_restore_scratch');
      INSERT INTO site_memberships (user_id, site_id, organization_id, role)
      VALUES ('${userId}', '${siteId}', 'org_restore_scratch', 'admin');
    `);
    bundleFixture = fixture();
  }, 30_000);

  beforeEach(() => {
    psql("TRUNCATE artifacts, messages, run_events, runs, threads RESTART IDENTITY CASCADE;");
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
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("restores business rows and verified artifact bytes into an empty scratch target", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
    try {
      const result = await restoreLifecycleExportToScratch(
        bundleFixture.body,
        bundleFixture.sha256,
        { artifactRoot: root, targetSiteId: siteId, database: getDatabase() },
      );
      expect(result.restored).toEqual({
        threads: 1,
        runs: 1,
        messages: 1,
        events: 1,
        artifacts: 1,
        artifactBytes: 22,
      });
      expect(psql("SELECT count(*) FROM threads")).toBe("1");
      expect(psql("SELECT count(*) FROM runs")).toBe("1");
      expect(psql("SELECT count(*) FROM messages")).toBe("1");
      expect(psql("SELECT count(*) FROM run_events")).toBe("1");
      expect(psql("SELECT count(*) FROM artifacts")).toBe("1");
      const storagePath = psql("SELECT storage_path FROM artifacts WHERE id = 'artifact_restore_scratch'");
      expect(createHash("sha256").update(await readFile(join(root, storagePath))).digest("hex")).toBe(
        "5bc999f445b82b985429bd9243a539c7aae7ebd270aa53651c6f8944761ea147",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses corruption, incomplete bundles, a different site, and occupied targets", async () => {
    const occupiedRoot = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
    const mismatchRoot = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
    const tamperedRoot = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
    const incompleteRoot = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
    try {
      await writeFile(join(occupiedRoot, "sentinel"), "keep");
      await expect(
        restoreLifecycleExportToScratch(bundleFixture.body, bundleFixture.sha256, {
          artifactRoot: occupiedRoot,
          targetSiteId: siteId,
          database: getDatabase(),
        }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_RESTORE_TARGET_NOT_EMPTY", status: 409 });

      await expect(
        restoreLifecycleExportToScratch(bundleFixture.body, bundleFixture.sha256, {
          artifactRoot: mismatchRoot,
          targetSiteId: "site_other",
          database: getDatabase(),
        }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_RESTORE_SITE_MISMATCH", status: 409 });

      const tampered = JSON.parse(bundleFixture.body) as { artifacts: Array<{ bytesBase64: string }> };
      tampered.artifacts[0]!.bytesBase64 = Buffer.from("tampered").toString("base64");
      await expect(
        restoreLifecycleExportToScratch(JSON.stringify(tampered), undefined, {
          artifactRoot: tamperedRoot,
          targetSiteId: siteId,
          database: getDatabase(),
        }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_RESTORE_INVALID_BUNDLE", status: 422 });

      const incomplete = JSON.parse(bundleFixture.body) as { manifest: { artifactBytes: number } };
      incomplete.manifest.artifactBytes += 1;
      await expect(
        restoreLifecycleExportToScratch(JSON.stringify(incomplete), undefined, {
          artifactRoot: incompleteRoot,
          targetSiteId: siteId,
          database: getDatabase(),
        }),
      ).rejects.toMatchObject({ code: "LIFECYCLE_RESTORE_INVALID_BUNDLE", status: 422 });
    } finally {
      await Promise.all(
        [occupiedRoot, mismatchRoot, tamperedRoot, incompleteRoot].map((root) =>
          rm(root, { recursive: true, force: true }),
        ),
      );
    }
  });

  test("does not overwrite a business scope that already contains rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
    try {
      await restoreLifecycleExportToScratch(bundleFixture.body, bundleFixture.sha256, {
        artifactRoot: root,
        targetSiteId: siteId,
        database: getDatabase(),
      });
      const secondRoot = await mkdtemp(join(tmpdir(), "hermes-lifecycle-restore-"));
      try {
        await expect(
          restoreLifecycleExportToScratch(bundleFixture.body, bundleFixture.sha256, {
            artifactRoot: secondRoot,
            targetSiteId: siteId,
            database: getDatabase(),
          }),
        ).rejects.toMatchObject({ code: "LIFECYCLE_RESTORE_TARGET_NOT_EMPTY", status: 409 });
        expect(psql("SELECT count(*) FROM threads")).toBe("1");
      } finally {
        await rm(secondRoot, { recursive: true, force: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
