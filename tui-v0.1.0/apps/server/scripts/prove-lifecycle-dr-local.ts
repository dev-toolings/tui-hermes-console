import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertScratchTargetEmpty,
  buildDrBundleManifest,
  canonicalJson,
  createScratchRollbackPlan,
  rollbackState,
  serializeDrBundle,
  verifyDrBundle,
} from "../src/modules/retention/dr-bundle";

const POSTGRES_IMAGE = "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";

type CommandOptions = { input?: Uint8Array | string; allowFailure?: boolean };

function command(commandName: string, args: string[], options: CommandOptions = {}) {
  const result = spawnSync(commandName, args, {
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr ?? "");
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${commandName} ${args.join(" ")} failed (${result.status}): ${stderr.slice(-2_000)}`);
  }
  return { status: result.status ?? 1, stdout, stderr };
}

function docker(args: string[], options: CommandOptions = {}) {
  return command("docker", args, options);
}

function psql(container: string, sql: string) {
  return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "hermes_console", "-Atq"], { input: sql }).stdout.toString("utf8").trim();
}

function startPostgres(container: string) {
  // Trust auth is confined to these throwaway containers; no credential is
  // written to the repository, process arguments, bundle, or evidence.
  docker(["run", "-d", "--name", container, "--network", "bridge", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=hermes_console", POSTGRES_IMAGE]);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const probe = docker(["exec", container, "pg_isready", "-U", "postgres", "-d", "hermes_console"], { allowFailure: true });
    const databaseProbe = docker(
      ["exec", container, "psql", "-U", "postgres", "-d", "hermes_console", "-Atq", "-c", "SELECT 1"],
      { allowFailure: true },
    );
    if (probe.status === 0 && databaseProbe.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`PostgreSQL container ${container} did not become ready.`);
}

function stopPostgres(container: string) {
  docker(["rm", "-f", container], { allowFailure: true });
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectCode(action: () => unknown, code: string) {
  try {
    action();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw new Error(`Expected ${code}, received ${(error as { code?: string }).code ?? String(error)}`);
  }
  throw new Error(`Expected ${code}, action succeeded`);
}

async function expectCodeAsync(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw new Error(`Expected ${code}, received ${(error as { code?: string }).code ?? String(error)}`);
  }
  throw new Error(`Expected ${code}, action succeeded`);
}

async function createFixtureFiles(root: string) {
  await mkdir(join(root, "g1-006d2"), { recursive: true });
  await writeFile(join(root, "g1-006d2", "artifact.txt"), "DR local artifact\n", { mode: 0o600 });
  await writeFile(join(root, "g1-006d2", "metadata.json"), '{"scope":"scratch"}\n', { mode: 0o600 });
  await chmod(join(root, "g1-006d2"), 0o700);
  command("tar", ["-cf", join(root, "files-data.tar"), "-C", root, "g1-006d2"]);
  return readFile(join(root, "files-data.tar"));
}

function assertSafeArchive(archivePath: string) {
  const listing = command("tar", ["-tvf", archivePath]).stdout.toString("utf8");
  for (const line of listing.split("\n").filter(Boolean)) {
    if (/^[lh]/.test(line)) throw new Error("DR archive contains a link entry; restore refused.");
  }
  const names = command("tar", ["-tf", archivePath]).stdout.toString("utf8").split("\n").filter(Boolean);
  for (const name of names) {
    const normalized = name.replaceAll("\\", "/");
    if (normalized.startsWith("/") || normalized.split("/").includes("..") || normalized.includes("\0")) {
      throw new Error(`DR archive member is outside scratch root: ${name}`);
    }
  }
}

async function restoreIntoScratch(container: string, filesRoot: string, dump: Uint8Array, archivePath: string) {
  const existingTables = Number(psql(container, "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'") || 0);
  assertScratchTargetEmpty({ databaseRows: existingTables, filePaths: await readdir(filesRoot) });
  assertSafeArchive(archivePath);
  docker(["exec", "-i", container, "pg_restore", "-U", "postgres", "-d", "hermes_console"], { input: dump });
  command("tar", ["-xf", archivePath, "-C", filesRoot]);
}

export async function runLifecycleDrProof() {
  if (docker(["info"], { allowFailure: true }).status !== 0) {
    throw new Error("Docker daemon unavailable; G1-006D2 local proof not executed.");
  }

  const runId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  const sourceContainer = `hc-g1-006d2-source-${runId}`;
  const scratchContainer = `hc-g1-006d2-scratch-${runId}`;
  const root = await mkdtemp(join(tmpdir(), "hermes-g1-006d2-"));
  const scratchFiles = join(root, "scratch-files");
  let sourceDump = Buffer.alloc(0);
  let archive = Buffer.alloc(0);
  let bundleBody = "";
  let bundleSha256 = "";
  let sourceCountBefore = "";
  let sourceCountAfter = "";

  try {
    startPostgres(sourceContainer);
    psql(sourceContainer, `
      CREATE TABLE dr_migrations (idx integer PRIMARY KEY, tag text NOT NULL, sha256 text NOT NULL);
      CREATE TABLE dr_sites (id text PRIMARY KEY, label text NOT NULL);
      CREATE TABLE dr_audit (id integer PRIMARY KEY, site_id text NOT NULL, event text NOT NULL);
      INSERT INTO dr_migrations VALUES
        (1, '0001_initial', repeat('a', 64)),
        (2, '0025_data_lifecycle_preview', repeat('b', 64));
      INSERT INTO dr_sites VALUES ('site-g1-006d2', 'DR fixture');
      INSERT INTO dr_audit VALUES (1, 'site-g1-006d2', 'fixture.created');
    `);
    sourceCountBefore = psql(sourceContainer, "SELECT (SELECT count(*) FROM dr_sites)::text || '|' || (SELECT count(*) FROM dr_audit)::text;");
    sourceDump = docker(["exec", sourceContainer, "pg_dump", "-Fc", "-U", "postgres", "-d", "hermes_console"]).stdout;
    archive = await createFixtureFiles(root);
    const migrations = [
      { index: 2, tag: "0025_data_lifecycle_preview", sha256: "b".repeat(64) },
      { index: 1, tag: "0001_initial", sha256: "a".repeat(64) },
    ];
    const manifest = buildDrBundleManifest({
      generatedAt: new Date().toISOString(),
      migrations,
      tableCounts: [
        { table: "dr_sites", rows: 1 },
        { table: "dr_audit", rows: 1 },
        { table: "dr_migrations", rows: 2 },
      ],
      databaseDump: sourceDump,
      filesArchive: archive,
      fileCount: 2,
      totalFileBytes: Buffer.byteLength("DR local artifact\n") + Buffer.byteLength('{"scope":"scratch"}\n'),
    });
    const serialized = serializeDrBundle({ manifest, databaseDump: sourceDump, filesArchive: archive });
    bundleBody = serialized.body;
    bundleSha256 = serialized.sha256;
    const verified = verifyDrBundle(bundleBody, bundleSha256);
    if (verified.document.manifest.database.tableCounts.reduce((sum, row) => sum + row.rows, 0) !== 4) {
      throw new Error("DR table counters do not match fixture inventory.");
    }

    const tamperedDump = JSON.parse(bundleBody) as Record<string, unknown> & { databaseDumpBase64: string; bundleSha256: string };
    tamperedDump.databaseDumpBase64 = Buffer.from("tampered dump", "utf8").toString("base64");
    const { bundleSha256: _tamperedBundleSha256, ...tamperedUnsigned } = tamperedDump;
    tamperedDump.bundleSha256 = sha256(Buffer.from(canonicalJson(tamperedUnsigned), "utf8"));
    expectCode(() => verifyDrBundle(JSON.stringify(tamperedDump)), "DR_BUNDLE_DUMP_MISMATCH");

    const tamperedManifest = JSON.parse(bundleBody) as { manifest: { files: { fileCount: number } } };
    tamperedManifest.manifest.files.fileCount = 99;
    expectCode(() => verifyDrBundle(JSON.stringify(tamperedManifest)), "DR_BUNDLE_MANIFEST_MISMATCH");

    startPostgres(scratchContainer);
    await mkdir(scratchFiles, { recursive: true });
    await restoreIntoScratch(scratchContainer, scratchFiles, sourceDump, join(root, "files-data.tar"));
    const scratchRows = psql(scratchContainer, "SELECT (SELECT count(*) FROM dr_sites)::text || '|' || (SELECT count(*) FROM dr_audit)::text;");
    if (scratchRows !== sourceCountBefore) throw new Error(`Scratch row inventory mismatch: ${scratchRows}`);
    if (sha256(await readFile(join(scratchFiles, "g1-006d2", "artifact.txt"))) !== sha256(Buffer.from("DR local artifact\n"))) {
      throw new Error("Scratch artifact hash mismatch.");
    }

    await expectCodeAsync(
      () => restoreIntoScratch(scratchContainer, scratchFiles, sourceDump, join(root, "files-data.tar")),
      "DR_BUNDLE_TARGET_NOT_EMPTY",
    );
    rollbackState({ staged: true, sourceChanged: false, targetRows: 0, targetFiles: 0 });
    const rollback = createScratchRollbackPlan({ sourceId: sourceContainer, targetId: scratchContainer, sourceSha256: sha256(sourceDump) });
    sourceCountAfter = psql(sourceContainer, "SELECT (SELECT count(*) FROM dr_sites)::text || '|' || (SELECT count(*) FROM dr_audit)::text;");
    if (sourceCountBefore !== sourceCountAfter) throw new Error("Source changed during scratch restore.");

    return {
      status: "PASS" as const,
      mode: "ephemeral-postgres-and-files-fixture",
      bundleSha256,
      sourceDumpSha256: sha256(sourceDump),
      filesArchiveSha256: sha256(archive),
      sourceRowsBefore: sourceCountBefore,
      sourceRowsAfter: sourceCountAfter,
      scratchRows,
      rollbackActions: rollback.actions,
      checks: ["pg_dump restored", "files-data archive restored", "dump tamper refused", "manifest tamper refused", "occupied scratch refused", "source unchanged"],
      limitations: ["local fixture only", "no external destination", "no host-loss exercise", "no P-OPS/P-SEC", "not full Gate 1 acceptance"],
    };
  } finally {
    stopPostgres(scratchContainer);
    stopPostgres(sourceContainer);
    await rm(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runLifecycleDrProof(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
