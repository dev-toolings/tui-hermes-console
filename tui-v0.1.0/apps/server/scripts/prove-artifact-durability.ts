import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const composeFile = resolve(repositoryRoot, "compose.prod.yml");
const projectPattern = /^hc-g1-001-[0-9]+-[a-f0-9]{8}$/;
const artifactId = "file_g1_001";
const artifactPath = "/data/files/g1-001/artifact.txt";
const artifactBytes = Buffer.from("g1-001 durable artifact\n", "utf8");
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");

type Mount = { Name?: string; Destination?: string; RW?: boolean };
type ProbeResult = {
  status: "PASS";
  project: string;
  commit: string;
  consoleBefore: string;
  consoleAfter: string;
  volume: string;
  artifact: { id: string; sizeBytes: number; sha256: string };
  http: { before: number; after: number; corrupt: number; missing: number };
  cleanup: "confirmed";
};

function fail(message: string): never {
  throw new Error(message);
}

function run(command: string, args: string[], input?: string): string {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 24 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function docker(args: string[], input?: string) {
  return run("docker", args, input);
}

function ensureProject(project: string) {
  if (!projectPattern.test(project)) fail(`invalid proof project name: ${project}`);
}

function json<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    fail(`invalid JSON from ${description}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function compose(project: string, envFile: string, args: string[], input?: string) {
  return docker([
    "compose", "--project-name", project, "--env-file", envFile,
    "-f", composeFile, ...args,
  ], input);
}

function serviceId(project: string, envFile: string) {
  const id = compose(project, envFile, ["ps", "-q", "console"]);
  if (!id) fail("console container is not running");
  return id;
}

function mounts(project: string, envFile: string): Mount[] {
  return json<Mount[]>(
    docker(["inspect", "--format", "{{json .Mounts}}", serviceId(project, envFile)]),
    "console mounts",
  );
}

function filesVolume(project: string, envFile: string) {
  const mount = mounts(project, envFile).find((candidate) => candidate.Destination === "/data/files");
  if (!mount?.Name || mount.RW !== true) fail("files-data mount is missing or not writable");
  if (mount.Name !== `${project}_files-data`) fail(`unexpected files volume: ${mount.Name}`);
  return mount.Name;
}

async function waitForHttp(baseUrl: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The Compose healthcheck is still converging.
    }
    await Bun.sleep(500);
  }
  fail("console healthcheck did not become ready within 30 seconds");
}

async function publishedBaseUrl(runCompose: (args: string[]) => string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const binding = runCompose(["port", "console", "3170"]);
    const port = binding.match(/:(\d+)\s*$/)?.[1];
    if (port) {
      const baseUrl = `http://127.0.0.1:${port}`;
      try {
        await waitForHttp(baseUrl);
        return baseUrl;
      } catch {
        // The published port can exist before the app is ready.
      }
    }
    await Bun.sleep(500);
  }
  fail("console published port did not become available");
}

function psqlFixture(project: string, envFile: string, token: string, csrf: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sql = `
    INSERT INTO organizations (id, name, slug, kind)
      VALUES ('org_g1_001', 'G1-001 fixture', 'g1-001-fixture', 'client');
    INSERT INTO sites (id, client_organization_id, name, slug)
      VALUES ('site_g1_001', 'org_g1_001', 'G1-001 fixture site', 'g1-001-fixture');
    INSERT INTO console_users
      (id, email, google_subject, ai_disclosure_version, ai_disclosure_accepted_at)
      VALUES ('usr_g1_001', 'g1-001@example.invalid', 'g1-001-subject', '2026-08-01.v2', now());
    INSERT INTO organization_memberships (user_id, organization_id)
      VALUES ('usr_g1_001', 'org_g1_001');
    INSERT INTO site_memberships (user_id, site_id, organization_id, role)
      VALUES ('usr_g1_001', 'site_g1_001', 'org_g1_001', 'admin');
    INSERT INTO console_sessions (token_hash, user_id, site_id, csrf_token, expires_at)
      VALUES ('${tokenHash}', 'usr_g1_001', 'site_g1_001', '${csrf}', now() + interval '1 hour');
    INSERT INTO runtime_config
      (id, name, base_url, encrypted_token, config_revision)
      VALUES ('default', 'Hermes G1-001 fixture', 'http://runtime.invalid', 'fixture-ciphertext', 1);
    INSERT INTO console_setup
      (id, step, completed_at, runtime_verified_at, runtime_config_version)
      VALUES ('default', 'completed', now(), now(), 'database:1');
    INSERT INTO threads
      (id, site_id, owner_user_id, author_user_id, title, agent_name, instructions, hermes_conversation)
      VALUES ('thread_g1_001', 'site_g1_001', 'usr_g1_001', 'usr_g1_001', 'G1-001 fixture', 'fixture-agent', 'fixture', 'g1-001-session');
    INSERT INTO runs
      (id, site_id, owner_user_id, author_user_id, thread_id, input, status)
      VALUES ('run_g1_001', 'site_g1_001', 'usr_g1_001', 'usr_g1_001', 'thread_g1_001', 'fixture', 'completed');
    INSERT INTO artifacts
      (id, site_id, owner_user_id, author_user_id, run_id, direction, filename, storage_path, mime_type, size_bytes, checksum_sha256)
      VALUES ('${artifactId}', 'site_g1_001', 'usr_g1_001', 'usr_g1_001', 'run_g1_001', 'output', 'artifact.txt', '${artifactPath}', 'text/plain', ${artifactBytes.byteLength}, '${artifactSha256}');
  `;
  compose(project, envFile, [
    "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "hermes", "-d", "hermes_console", "-Atq",
  ], sql);
}

function fixtureWriteExpression(contents: string) {
  return `const {mkdir}=await import("node:fs/promises");await mkdir("/data/files/g1-001",{recursive:true});await Bun.write(${JSON.stringify(artifactPath)},${JSON.stringify(contents)})`;
}

function fixtureDeleteExpression() {
  return `const {rm}=await import("node:fs/promises");await rm(${JSON.stringify(artifactPath)})`;
}

function consoleExec(project: string, envFile: string, expression: string) {
  compose(project, envFile, ["exec", "-T", "console", "bun", "-e", expression]);
}

function assertNoProjectResources(project: string) {
  const resources = [
    ["container", docker(["ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "-q"])],
    ["volume", docker(["volume", "ls", "--filter", `label=com.docker.compose.project=${project}`, "-q"])],
    ["network", docker(["network", "ls", "--filter", `label=com.docker.compose.project=${project}`, "-q"])],
  ].filter(([, ids]) => ids.length > 0);
  if (resources.length > 0) {
    fail(`Compose cleanup left ${resources.map(([kind, ids]) => `${kind}:${ids}`).join(", ")}`);
  }
}

async function readArtifact(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/api/files/${artifactId}`, {
    headers: { cookie: `hc_session=${token}`, origin: baseUrl },
    cache: "no-store",
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { response, bytes };
}

function assertBodyCode(bytes: Uint8Array, expected: string) {
  const body = new TextDecoder().decode(bytes);
  const parsed = json<{ error?: { code?: string } }>(body, "artifact error response");
  if (parsed.error?.code !== expected) fail(`expected ${expected}, got ${body}`);
}

async function prove() {
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    fail("Docker daemon unavailable; G1-001 proof not executed");
  }
  const project = `hc-g1-001-${process.pid}-${randomUUID().slice(0, 8)}`;
  ensureProject(project);
  const tempRoot = await mkdtemp(join(tmpdir(), "hermes-g1-001-"));
  const envFile = join(tempRoot, "production.env");
  const env = `CONSOLE_SITE_ADDRESS=http://localhost
POSTGRES_USER=hermes
POSTGRES_PASSWORD=g1_001_owner_password
POSTGRES_DB=hermes_console
DATABASE_OWNER_URL=postgres://hermes:g1_001_owner_password@postgres:5432/hermes_console
POSTGRES_RUNTIME_USER=hermes_runtime
POSTGRES_RUNTIME_PASSWORD=g1_001_runtime_password
DATABASE_URL=postgres://hermes_runtime:g1_001_runtime_password@postgres:5432/hermes_console
APP_ENCRYPTION_KEY=${"a".repeat(64)}
CONSOLE_APP_ORIGIN=http://localhost
GOOGLE_ALLOWED_EMAILS=g1-001@example.invalid
HERMES_PROTOCOL=agent
`;
  await writeFile(envFile, env, { mode: 0o600 });
  await chmod(envFile, 0o600);
  const overrideFile = join(tempRoot, "compose.override.yml");
  await writeFile(overrideFile, "services:\n  console:\n    ports:\n      - \"127.0.0.1::3170\"\n", { mode: 0o600 });
  try {
    const composeWithOverride = (args: string[], input?: string) => docker([
      "compose", "--project-name", project, "--env-file", envFile,
      "-f", composeFile, "-f", overrideFile, ...args,
    ], input);
    composeWithOverride(["config", "--quiet"]);
    composeWithOverride(["up", "-d", "--build", "postgres", "migrate", "console"]);
    const baseUrl = await publishedBaseUrl(composeWithOverride);
    const token = `g1-001-token-${randomUUID()}`;
    const csrf = `g1-001-csrf-${randomUUID()}`;
    psqlFixture(project, envFile, token, csrf);
    const setupState = compose(project, envFile, [
      "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "hermes",
      "-d", "hermes_console", "-Atq", "-c",
      "SELECT step || '|' || coalesce(runtime_config_version, '') || '|' || coalesce((SELECT config_revision::text FROM runtime_config WHERE id = 'default'), '') FROM console_setup WHERE id = 'default'",
    ]);
    if (setupState !== "completed|database:1|1") fail(`fixture setup state mismatch: ${setupState}`);
    consoleExec(project, envFile, fixtureWriteExpression(artifactBytes.toString("utf8")));
    const beforeContainer = serviceId(project, envFile);
    const beforeId = docker(["inspect", "--format", "{{.Id}}", beforeContainer]);
    const volume = filesVolume(project, envFile);
    const initial = await readArtifact(baseUrl, token);
    if (initial.response.status !== 200) fail(`initial artifact read returned ${initial.response.status}: ${new TextDecoder().decode(initial.bytes)}`);
    if (createHash("sha256").update(initial.bytes).digest("hex") !== artifactSha256) fail("initial artifact hash mismatch");

    composeWithOverride(["up", "-d", "--no-deps", "--force-recreate", "console"]);
    const afterContainer = serviceId(project, envFile);
    const afterId = docker(["inspect", "--format", "{{.Id}}", afterContainer]);
    if (beforeId === afterId) fail("console container was not replaced");
    if (filesVolume(project, envFile) !== volume) fail("files volume changed during console replacement");
    const afterBaseUrl = await publishedBaseUrl(composeWithOverride);
    const after = await readArtifact(afterBaseUrl, token);
    if (after.response.status !== 200) fail(`post-replacement artifact read returned ${after.response.status}: ${new TextDecoder().decode(after.bytes)}`);
    if (createHash("sha256").update(after.bytes).digest("hex") !== artifactSha256) fail("post-replacement artifact hash mismatch");

    consoleExec(project, envFile, fixtureWriteExpression("tampered\n"));
    const corrupt = await readArtifact(afterBaseUrl, token);
    if (corrupt.response.status !== 409) fail(`corruption returned ${corrupt.response.status}`);
    assertBodyCode(corrupt.bytes, "ARTIFACT_INTEGRITY_FAILED");
    consoleExec(project, envFile, fixtureWriteExpression(artifactBytes.toString("utf8")));
    const restored = await readArtifact(afterBaseUrl, token);
    if (restored.response.status !== 200) fail(`restored artifact read returned ${restored.response.status}`);
    consoleExec(project, envFile, fixtureDeleteExpression());
    const missing = await readArtifact(afterBaseUrl, token);
    if (missing.response.status !== 410) fail(`missing artifact returned ${missing.response.status}`);
    assertBodyCode(missing.bytes, "ARTIFACT_BYTES_MISSING");

    return {
      status: "PASS",
      project,
      commit: run("git", ["rev-parse", "HEAD"]),
      consoleBefore: beforeId,
      consoleAfter: afterId,
      volume,
      artifact: { id: artifactId, sizeBytes: artifactBytes.byteLength, sha256: artifactSha256 },
      http: { before: initial.response.status, after: after.response.status, corrupt: corrupt.response.status, missing: missing.response.status },
      cleanup: "confirmed",
    } satisfies ProbeResult;
  } finally {
    try {
      docker([
        "compose", "--project-name", project, "--env-file", envFile,
        "-f", composeFile, "-f", overrideFile,
        "down", "--volumes", "--remove-orphans",
      ]);
      assertNoProjectResources(project);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await prove(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export { ensureProject, prove };
