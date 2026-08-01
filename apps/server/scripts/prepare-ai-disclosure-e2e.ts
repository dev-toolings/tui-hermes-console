import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const root = resolve(import.meta.dir, "../../..");
const containerName = `hermes-g1-003-${randomUUID().slice(0, 12)}`;
const artifactRoot = await mkdtemp(join(tmpdir(), "hermes-g1-003-") );
const sessionToken = "fixture-g1-003-session";
const csrfToken = "fixture-g1-003-csrf";
const serverPort = 34000 + Math.floor(Math.random() * 1000);
let server: ReturnType<typeof Bun.spawn> | null = null;

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

function psql(statement: string, database = "ai_consent_e2e") {
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

function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    if (
      probe.status === 0 &&
      `${probe.stdout ?? ""} ${probe.stderr ?? ""}`.includes("accepting connections")
    ) return;
    Bun.sleepSync(250);
  }
  throw new Error("PostgreSQL fixture not ready after 15 seconds.");
}

function applyMigrations() {
  const journal = JSON.parse(
    readFileSync(join(root, "apps/server/drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  for (const entry of journal.entries.filter(({ idx }) => idx <= 27)) {
    psql(readFileSync(join(root, `apps/server/drizzle/${entry.tag}.sql`), "utf8"));
  }
}

async function cleanup() {
  server?.kill();
  if (server) await server.exited.catch(() => undefined);
  docker(["rm", "--force", containerName]);
  await rm(artifactRoot, { recursive: true, force: true });
}

async function main() {
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
  waitForPostgres();
  docker(["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-c", 'CREATE DATABASE "ai_consent_e2e";']);
  applyMigrations();
  const binding = docker(["port", containerName, "5432/tcp"]);
  const postgresPort = binding.match(/:(\d+)$/)?.[1];
  if (!postgresPort) throw new Error(`PostgreSQL port unreadable: ${binding}`);

  const sessionHash = createHash("sha256").update(sessionToken).digest("hex");
  const encryptedRuntimeToken = createHash("sha256").update("fixture-runtime-token").digest("hex");
  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${postgresPort}/ai_consent_e2e`;
  process.env.APP_ENCRYPTION_KEY = "p-int-g1-003-e2e-fixture";
  process.env.HERMES_CONSOLE_ARTIFACTS_DIR = artifactRoot;
  process.env.GOOGLE_ALLOWED_EMAILS = "fixture@example.com";

  psql(`
    INSERT INTO organizations (id, name, slug, kind)
    VALUES ('org_g1_003', 'G1-003 fixture', 'g1-003-fixture', 'client');
    INSERT INTO sites (id, client_organization_id, name, slug)
    VALUES ('site_g1_003', 'org_g1_003', 'G1-003 fixture', 'g1-003-fixture');
    INSERT INTO console_users (id, email, google_subject)
    VALUES ('usr_g1_003', 'fixture@example.com', 'sub-g1-003');
    INSERT INTO organization_memberships (user_id, organization_id)
    VALUES ('usr_g1_003', 'org_g1_003');
    INSERT INTO site_memberships (user_id, site_id, organization_id, role)
    VALUES ('usr_g1_003', 'site_g1_003', 'org_g1_003', 'admin');
    INSERT INTO console_sessions
      (token_hash, user_id, site_id, csrf_token, expires_at)
    VALUES (${sqlString(sessionHash)}, 'usr_g1_003', 'site_g1_003', ${sqlString(csrfToken)}, now() + interval '1 day');
    INSERT INTO runtime_config
      (id, name, base_url, encrypted_token, config_revision)
    VALUES ('default', 'G1-003 fixture runtime', 'http://runtime.invalid', ${sqlString(encryptedRuntimeToken)}, 1);
    INSERT INTO console_setup
      (id, step, completed_at, runtime_verified_at, runtime_config_version)
    VALUES ('default', 'completed', now(), now(), 'database:1');
  `);

  server = Bun.spawn(["bun", join(root, "apps/server/src/index.ts")], {
    cwd: root,
    env: {
      ...process.env,
      CONSOLE_SERVER_HOST: "127.0.0.1",
      CONSOLE_SERVER_PORT: String(serverPort),
      CONSOLE_SPA_DIR: join(root, "apps/console/dist"),
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) break;
    } catch {
      // Server is still starting.
    }
    await Bun.sleep(250);
  }
  const health = await fetch(`${baseUrl}/api/healthz`).catch(() => null);
  if (!health?.ok) throw new Error("Console fixture did not become ready.");

  console.log("G1-003 browser fixture ready");
  console.log(`URL=${baseUrl}`);
  console.log(`SESSION_TOKEN=${sessionToken}`);
  console.log(`CSRF_TOKEN=${csrfToken}`);
  console.log(`POSTGRES_CONTAINER=${containerName}`);
  console.log("Synthetic local-only credentials; press Ctrl-C to clean up.");
  await new Promise<void>(() => undefined);
}

process.once("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

try {
  await main();
} catch (error) {
  await cleanup();
  throw error;
}
