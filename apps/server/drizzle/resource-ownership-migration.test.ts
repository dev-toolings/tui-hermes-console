import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-ownership-migration-${randomUUID().slice(0, 8)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };
const migration = readFileSync(join(import.meta.dir, "0021_resource_ownership.sql"), "utf8");
const initCompleteMarker = "PostgreSQL init process complete; ready for start up.";

function docker(args: string[], input?: string, allowFailure = false) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function psql(database: string, statement: string, allowFailure = false) {
  return docker([
    "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-Atq",
  ], statement, allowFailure);
}

function applyThrough0020(database: string) {
  for (const entry of journal.entries.filter(({ idx }) => idx <= 20)) {
    psql(database, readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

function seedLegacy(database: string, options: { secondAdmin?: boolean } = {}) {
  psql(database, `
    INSERT INTO sites (id, name, slug) VALUES ('paris', 'Paris', 'paris');
    INSERT INTO console_users (id, email, google_subject) VALUES
      ('usr_admin', 'admin@example.com', 'sub-admin'),
      ('usr_creator', 'creator@example.com', 'sub-creator'),
      ('usr_other', 'other@example.com', 'sub-other');
    INSERT INTO site_memberships (user_id, site_id, role) VALUES
      ('usr_admin', 'paris', 'admin'),
      ('usr_creator', 'paris', 'requester'),
      ('usr_other', 'paris', '${options.secondAdmin ? "admin" : "requester"}');
    INSERT INTO agents (id, site_id, name, slug, instructions)
      VALUES ('agt_legacy', 'paris', 'Legacy agent', 'legacy-agent', 'Legacy');
    INSERT INTO connectors
      (id, site_id, type, label, email, imap_host, encrypted_password)
      VALUES ('con_legacy', 'paris', 'gmail_imap', 'Legacy inbox', 'legacy@example.com', 'imap.example.com', 'cipher');
    INSERT INTO threads
      (id, site_id, title, agent_id, agent_name, instructions, hermes_conversation)
      VALUES ('thr_legacy', 'paris', 'Legacy thread', 'agt_legacy', 'Legacy agent', 'Legacy', 'console:legacy');
    INSERT INTO runs (id, site_id, thread_id, input, status)
      VALUES ('run_legacy', 'paris', 'thr_legacy', 'Legacy', 'completed');
    INSERT INTO artifacts
      (id, site_id, run_id, direction, filename, storage_path, size_bytes, checksum_sha256)
      VALUES ('file_legacy', 'paris', 'run_legacy', 'output', 'legacy.txt', '/vault/legacy.txt', 1, '00');
  `);
}

function createBootstrap(database: string, options: { omitArtifact?: boolean; divergentRun?: boolean } = {}) {
  psql(database, `
    CREATE TABLE resource_ownership_bootstrap (
      resource_type text NOT NULL,
      resource_id text NOT NULL,
      owner_user_id text,
      author_user_id text NOT NULL,
      PRIMARY KEY (resource_type, resource_id)
    );
    INSERT INTO resource_ownership_bootstrap VALUES
      ('agent', 'agt_legacy', NULL, 'usr_creator'),
      ('connector', 'con_legacy', NULL, 'usr_creator'),
      ('thread', 'thr_legacy', NULL, 'usr_creator'),
      ('run', 'run_legacy', ${options.divergentRun ? "'usr_other'" : "NULL"}, 'usr_creator')
      ${options.omitArtifact ? "" : ", ('artifact', 'file_legacy', NULL, 'usr_creator')"};
  `);
}

function apply0021(database: string, allowFailure = false) {
  return psql(database, `BEGIN;\n${migration}\nCOMMIT;`, allowFailure);
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

async function waitForFinalPostgres() {
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
  throw new Error("PostgreSQL final n’est pas prêt après 15 secondes pour le test migration ownership.");
}

describeWithDocker("0020 to 0021 explicit ownership migration", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName,
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    await waitForFinalPostgres();
    for (const database of ["complete", "incomplete", "ambiguous", "divergent"]) {
      psql("postgres", `CREATE DATABASE ${database};`);
      applyThrough0020(database);
    }
  }, 30_000);

  afterAll(() => {
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("complete explicit authors upgrade and preserve aggregate ownership", () => {
    seedLegacy("complete");
    createBootstrap("complete");
    apply0021("complete");
    expect(psql("complete", `SELECT owner_user_id || ':' || author_user_id FROM threads WHERE id = 'thr_legacy';`).stdout.trim()).toBe("usr_admin:usr_creator");
    expect(psql("complete", `SELECT owner_user_id FROM runs WHERE id = 'run_legacy';`).stdout.trim()).toBe("usr_admin");
    expect(psql("complete", `SELECT owner_user_id FROM artifacts WHERE id = 'file_legacy';`).stdout.trim()).toBe("usr_admin");
    expect(psql("complete", `SELECT to_regclass('resource_ownership_bootstrap') IS NULL;`).stdout.trim()).toBe("t");
    apply0021("complete");
    expect(psql("complete", `SELECT owner_user_id || ':' || author_user_id FROM threads WHERE id = 'thr_legacy';`).stdout.trim()).toBe("usr_admin:usr_creator");
  });

  test("missing explicit author fails closed and rolls the schema back", () => {
    seedLegacy("incomplete");
    createBootstrap("incomplete", { omitArtifact: true });
    const result = apply0021("incomplete", true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RESOURCE_OWNERSHIP_BOOTSTRAP_REQUIRED");
    expect(psql("incomplete", `SELECT count(*) FROM information_schema.columns WHERE table_name = 'artifacts' AND column_name = 'owner_user_id';`).stdout.trim()).toBe("0");
    expect(psql("incomplete", `SELECT to_regclass('resource_ownership_bootstrap') IS NOT NULL;`).stdout.trim()).toBe("t");
  });

  test("multiple admins cannot become an implicit owner", () => {
    seedLegacy("ambiguous", { secondAdmin: true });
    createBootstrap("ambiguous");
    const result = apply0021("ambiguous", true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RESOURCE_OWNERSHIP_BOOTSTRAP_REQUIRED");
  });

  test("child bootstrap ownership cannot diverge from its parent", () => {
    seedLegacy("divergent");
    createBootstrap("divergent", { divergentRun: true });
    const result = apply0021("divergent", true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RESOURCE_OWNERSHIP_AGGREGATE_DIVERGENCE");
  });
});
