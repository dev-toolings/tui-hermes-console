import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync as readTextFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getDatabase } from "@/db/client";
import { deleteArtifactEverywhere } from "@/modules/artifacts/delete-artifact";
import { createDataLifecyclePreview } from "@/modules/retention/service";
import { createLifecycleExport } from "@/modules/retention/export";
import type { SiteRequestContext } from "@/modules/auth/service";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-artifact-legal-hold-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readTextFile(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

const SITE = "site_del_hold";
const ORG = "org_del_hold";
const USER = "usr_del_hold";
const THREAD = "thread_del_hold";
const RUN = "run_del_hold";
const ARTIFACT = "artifact_del_hold";
const OLD = "2026-06-01T00:00:00.000Z";
const NOW = new Date("2026-08-01T00:00:00.000Z");
const FILENAME = "output.txt";
const CONTENT = "legal hold fixture content";

type Roots = { artifactRoot: string; workRoot: string };

const context: SiteRequestContext = {
  siteId: SITE,
  userId: USER,
  role: "admin",
  actorOrganizationId: ORG,
  clientOrganizationId: ORG,
  mandateId: null,
  mandateProjectId: null,
  correlationId: "corr-del-hold",
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

function psql(statement: string, database = "artifact_legal_hold") {
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
  // audit_ledger_entries est append-only (déclencheur reject_audit_ledger_mutation) :
  // ne jamais le TRUNCATE, seulement en lire le compte relatif au test courant.
  psql(
    "TRUNCATE data_lifecycle_preview_items, data_lifecycle_previews, site_data_lifecycle_policies, " +
      "approval_requests, artifacts, messages, run_events, runs, threads RESTART IDENTITY;",
  );
}

function seedBase() {
  psql(`
    INSERT INTO organizations (id, name, slug, kind) VALUES
      ('${ORG}', 'Legal hold site', 'del-hold', 'client');
    INSERT INTO sites (id, client_organization_id, name, slug) VALUES
      ('${SITE}', '${ORG}', 'Legal hold site', 'del-hold');
    INSERT INTO console_users (id, email, google_subject) VALUES
      ('${USER}', 'del-hold@example.invalid', 'del-hold-subject');
    INSERT INTO organization_memberships (user_id, organization_id) VALUES
      ('${USER}', '${ORG}');
    INSERT INTO site_memberships (user_id, site_id, organization_id, role) VALUES
      ('${USER}', '${SITE}', '${ORG}', 'admin');
  `);
}

async function makeRoots(): Promise<Roots> {
  const artifactRoot = await mkdtemp(join(tmpdir(), "hermes-del-hold-artifacts-"));
  const workRoot = await mkdtemp(join(tmpdir(), "hermes-del-hold-work-"));
  return { artifactRoot, workRoot };
}

async function writeFixtureFiles(roots: Roots) {
  const privateDir = join(roots.artifactRoot, "runs", RUN, "out");
  const workDir = join(roots.workRoot, "runs", RUN, "out");
  await mkdir(privateDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
  const privateFile = join(privateDir, FILENAME);
  const workFile = join(workDir, FILENAME);
  await writeFile(privateFile, CONTENT);
  await writeFile(workFile, CONTENT);
  const bytes = Buffer.from(CONTENT, "utf8");
  return {
    privateFile,
    workFile,
    sizeBytes: bytes.byteLength,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function seedFixture(roots: Roots, options: { legalHoldEnabled: boolean } = { legalHoldEnabled: false }) {
  const file = await writeFixtureFiles(roots);
  psql(`
    INSERT INTO site_data_lifecycle_policies
      (site_id, version, retention_days, legal_hold_enabled, legal_hold_reason, updated_by_user_id, created_at, updated_at)
    VALUES
      ('${SITE}', 1, 30, ${options.legalHoldEnabled}, ${options.legalHoldEnabled ? "'litigation'" : "NULL"}, '${USER}', '${OLD}', '${OLD}');
    INSERT INTO threads
      (id, site_id, owner_user_id, author_user_id, title, agent_name, instructions, model, source, hermes_conversation, created_at, updated_at)
    VALUES
      ('${THREAD}', '${SITE}', '${USER}', '${USER}', 'Legal hold thread', 'agent-hold', 'legal hold fixture', 'hermes-agent', 'chat', 'hold:thread', '${OLD}', '${OLD}');
    INSERT INTO runs
      (id, site_id, owner_user_id, author_user_id, client_organization_id, thread_id, input, status, output, created_at, started_at, ended_at, last_event_at, workdir)
    VALUES
      ('${RUN}', '${SITE}', '${USER}', '${USER}', '${ORG}', '${THREAD}', 'legal hold run', 'completed', 'done', '${OLD}', '${OLD}', '${OLD}', '${OLD}', 'runs/${RUN}');
    INSERT INTO artifacts
      (id, site_id, owner_user_id, author_user_id, run_id, direction, filename, storage_path, mime_type, size_bytes, checksum_sha256, created_at)
    VALUES
      ('${ARTIFACT}', '${SITE}', '${USER}', '${USER}', '${RUN}', 'output', '${FILENAME}', '${file.privateFile}', 'text/plain', ${file.sizeBytes}, '${file.checksumSha256}', '${OLD}');
  `);
  return file;
}

/** Lignes d'audit "denied" pour artifact.delete sur l'artefact de fixture, dans l'ordre
 *  d'insertion (id auto-incrémenté). audit_ledger_entries est append-only : on lit toujours
 *  un delta scopé à ARTIFACT plutôt qu'un compte absolu de table. */
function deniedAuditRows() {
  const raw = psql(
    `SELECT id, actor_user_id, target_site_id, resource_type, resource_id, decision, reason_code, correlation_id ` +
      `FROM audit_ledger_entries WHERE target_site_id = '${SITE}' AND action = 'artifact.delete' ` +
      `AND resource_id = '${ARTIFACT}' AND decision = 'denied' ORDER BY id`,
  );
  if (!raw) return [] as Array<{
    id: string;
    actorUserId: string;
    targetSiteId: string;
    resourceType: string;
    resourceId: string;
    decision: string;
    reasonCode: string;
    correlationId: string;
  }>;
  return raw.split("\n").map((line) => {
    const [id, actorUserId, targetSiteId, resourceType, resourceId, decision, reasonCode, correlationId] =
      line.split("|");
    return { id, actorUserId, targetSiteId, resourceType, resourceId, decision, reasonCode, correlationId };
  });
}

async function artifactRowState() {
  return {
    deletedAt: psql(`SELECT coalesce(deleted_at::text, '') FROM artifacts WHERE id = '${ARTIFACT}'`),
    storagePath: psql(`SELECT storage_path FROM artifacts WHERE id = '${ARTIFACT}'`),
    sizeBytes: psql(`SELECT size_bytes::text FROM artifacts WHERE id = '${ARTIFACT}'`),
    checksum: psql(`SELECT checksum_sha256 FROM artifacts WHERE id = '${ARTIFACT}'`),
  };
}

async function pathState(file: { privateFile: string; workFile: string }) {
  const privateDir = dirname(file.privateFile);
  const workDir = dirname(file.workFile);
  const check = async (path: string) => {
    try {
      const info = await lstat(path);
      return info.isFile() ? "file" : "other";
    } catch {
      return "missing";
    }
  };
  return {
    privateFile: await check(file.privateFile),
    workFile: await check(file.workFile),
    privateQuarantineDir: await check(join(privateDir, ".delete-quarantine")),
    workQuarantineDir: await check(join(workDir, ".delete-quarantine")),
  };
}

function dirname(filePath: string) {
  return filePath.slice(0, filePath.lastIndexOf("/"));
}

function withRoots<T>(roots: Roots, action: () => Promise<T>): Promise<T> {
  const previousArtifactRoot = process.env.HERMES_CONSOLE_ARTIFACTS_DIR;
  const previousWorkRoot = process.env.HERMES_SHARED_WORKDIR;
  process.env.HERMES_CONSOLE_ARTIFACTS_DIR = roots.artifactRoot;
  process.env.HERMES_SHARED_WORKDIR = roots.workRoot;
  return action().finally(() => {
    if (previousArtifactRoot === undefined) delete process.env.HERMES_CONSOLE_ARTIFACTS_DIR;
    else process.env.HERMES_CONSOLE_ARTIFACTS_DIR = previousArtifactRoot;
    if (previousWorkRoot === undefined) delete process.env.HERMES_SHARED_WORKDIR;
    else process.env.HERMES_SHARED_WORKDIR = previousWorkRoot;
  });
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("artifact deletion respects an active legal hold", () => {
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
    psql('CREATE DATABASE "artifact_legal_hold";', "postgres");
    applyMigrations();
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/artifact_legal_hold`;
    process.env.APP_ENCRYPTION_KEY = "p-int-artifact-legal-hold";
    seedBase();
  }, 30_000);

  beforeEach(() => {
    resetBusinessRows();
  });

  afterEach(() => {
    delete process.env.HERMES_CONSOLE_ARTIFACTS_DIR;
    delete process.env.HERMES_SHARED_WORKDIR;
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

  test("deletes a terminal run artifact everywhere when no legal hold is active", async () => {
    const roots = await makeRoots();
    try {
      const file = await seedFixture(roots, { legalHoldEnabled: false });
      // audit_ledger_entries est append-only et n'est jamais vidé entre les tests
      // (voir resetBusinessRows) : on compare un delta scopé à cet artifactId,
      // jamais un compte absolu.
      const auditBefore = Number(
        psql(
          `SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = '${SITE}' AND action = 'artifact.delete' AND resource_id = '${ARTIFACT}' AND decision = 'allowed' AND reason_code = 'ARTIFACT_DELETED_EVERYWHERE'`,
        ),
      );
      const result = await withRoots(roots, () =>
        deleteArtifactEverywhere(context, ARTIFACT, {
          removeRemote: async () => {},
          now: () => NOW,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ artifactId: ARTIFACT, runId: RUN, filename: FILENAME, cleanupPending: false }),
      );
      expect(result.deletedAt).toBe(NOW.toISOString());

      const row = await artifactRowState();
      expect(row.deletedAt).not.toBe("");

      const paths = await pathState(file);
      expect(paths.privateFile).toBe("missing");
      expect(paths.workFile).toBe("missing");

      expect(
        psql(
          `SELECT count(*) FROM audit_ledger_entries WHERE target_site_id = '${SITE}' AND action = 'artifact.delete' AND resource_id = '${ARTIFACT}' AND decision = 'allowed' AND reason_code = 'ARTIFACT_DELETED_EVERYWHERE'`,
        ),
      ).toBe(String(auditBefore + 1));
    } finally {
      await rmRoots(roots);
    }
  });

  test("refuses deletion under an active legal hold, leaves the artifact and its bytes untouched, and keeps it exportable", async () => {
    const roots = await makeRoots();
    try {
      const file = await seedFixture(roots, { legalHoldEnabled: false });

      // Le preview doit être créé avant l'activation de la rétention légale :
      // createDataLifecyclePreview refuse elle-même la création sous hold actif.
      const preview = await createDataLifecyclePreview(context, {
        database: getDatabase(),
        now: () => NOW,
      });
      expect(preview.id).toBeString();

      const auditBefore = deniedAuditRows();
      expect(auditBefore).toHaveLength(0);

      psql(
        `UPDATE site_data_lifecycle_policies SET legal_hold_enabled = true, legal_hold_reason = 'litigation' WHERE site_id = '${SITE}'`,
      );

      const before = { row: await artifactRowState(), paths: await pathState(file) };
      expect(before.paths.privateFile).toBe("file");
      expect(before.paths.workFile).toBe("file");
      expect(before.paths.privateQuarantineDir).toBe("missing");
      expect(before.paths.workQuarantineDir).toBe("missing");

      await expect(
        withRoots(roots, () =>
          deleteArtifactEverywhere(context, ARTIFACT, { removeRemote: async () => {}, now: () => NOW }),
        ),
      ).rejects.toMatchObject({ code: "ARTIFACT_LEGAL_HOLD", status: 409 });

      const after = { row: await artifactRowState(), paths: await pathState(file) };
      expect(after.row).toEqual(before.row);
      expect(after.row.deletedAt).toBe("");
      expect(after.paths).toEqual(before.paths);

      expect(await readFile(file.privateFile, "utf8")).toBe(CONTENT);
      expect(await readFile(file.workFile, "utf8")).toBe(CONTENT);

      // Le refus est désormais audité : une entrée "denied" attribuée doit exister,
      // et l'écriture d'audit elle-même ne doit rien changer de plus à la ligne ni au disque.
      const auditAfterFirstDenial = deniedAuditRows();
      expect(auditAfterFirstDenial).toHaveLength(1);
      expect(auditAfterFirstDenial[0]).toMatchObject({
        actorUserId: USER,
        targetSiteId: SITE,
        resourceType: "artifact",
        resourceId: ARTIFACT,
        decision: "denied",
        reasonCode: "ARTIFACT_LEGAL_HOLD",
        correlationId: context.correlationId,
      });
      expect(await artifactRowState()).toEqual(before.row);
      expect(await pathState(file)).toEqual(before.paths);

      const exportResult = await createLifecycleExport(
        context,
        { previewId: preview.id },
        { database: getDatabase(), now: () => NOW, artifactRoot: roots.artifactRoot },
      );
      const exported = JSON.parse(exportResult.body) as {
        artifacts: Array<{ id: string; checksumSha256: string; bytesBase64: string }>;
      };
      const exportedArtifact = exported.artifacts.find((entry) => entry.id === ARTIFACT);
      expect(exportedArtifact).toBeDefined();
      expect(exportedArtifact?.checksumSha256).toBe(file.checksumSha256);
      expect(Buffer.from(exportedArtifact!.bytesBase64, "base64").toString("utf8")).toBe(CONTENT);

      // Un second appel après refus ne doit rien changer de plus à la ligne ni au disque,
      // mais DOIT rester tracé : une seconde entrée "denied" distincte, pas une seule.
      await expect(
        withRoots(roots, () =>
          deleteArtifactEverywhere(context, ARTIFACT, { removeRemote: async () => {}, now: () => NOW }),
        ),
      ).rejects.toMatchObject({ code: "ARTIFACT_LEGAL_HOLD", status: 409 });

      const afterSecondCall = { row: await artifactRowState(), paths: await pathState(file) };
      expect(afterSecondCall.row).toEqual(before.row);
      expect(afterSecondCall.paths).toEqual(before.paths);

      const auditAfterSecondDenial = deniedAuditRows();
      expect(auditAfterSecondDenial).toHaveLength(2);
      expect(auditAfterSecondDenial[0].id).toBe(auditAfterFirstDenial[0].id);
      expect(auditAfterSecondDenial[1].id).not.toBe(auditAfterFirstDenial[0].id);
      expect(auditAfterSecondDenial[1]).toMatchObject({
        actorUserId: USER,
        targetSiteId: SITE,
        resourceType: "artifact",
        resourceId: ARTIFACT,
        decision: "denied",
        reasonCode: "ARTIFACT_LEGAL_HOLD",
        correlationId: context.correlationId,
      });
    } finally {
      await rmRoots(roots);
    }
  });
});

async function rmRoots(roots: Roots) {
  await rm(roots.artifactRoot, { recursive: true, force: true });
  await rm(roots.workRoot, { recursive: true, force: true });
}
