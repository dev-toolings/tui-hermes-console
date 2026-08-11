import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateDecisionKeyPair } from "../src/modules/policy/decision-envelope";

/**
 * G1-004D — preuve locale avec le vrai serveur Console, PostgreSQL et Hermes.
 *
 * Le provider Hermes reste externe à ce harness : seul le token API du runtime
 * est injecté par l'appelant via HERMES_RUNTIME_TOKEN. Aucun secret n'est écrit
 * dans le dépôt ou dans le rapport.
 */

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const root = resolve(import.meta.dir, "../../..");
const prefix = `g1-004-real-${Date.now()}`;
const containerName = `${prefix}-postgres`;
const databaseName = "g1_004_real";
const siteId = "site_g1_004_real";
const organizationId = "org_g1_004_real";
const requesterId = "usr_g1_004_real_requester";
const approverId = "usr_g1_004_real_approver";
const agentId = "agent_g1_004_real";
const requesterToken = "g1-004-real-requester-session";
const approverToken = "g1-004-real-approver-session";
const requesterCsrf = "g1-004-real-requester-csrf";
const approverCsrf = "g1-004-real-approver-csrf";
const runtimeBaseUrl = (process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642")
  .trim()
  .replace(/\/+$/, "");
const configuredRuntimeToken = process.env.HERMES_RUNTIME_TOKEN?.trim();
if (!configuredRuntimeToken) {
  throw new Error("HERMES_RUNTIME_TOKEN est requis pour cette preuve.");
}
const runtimeToken: string = configuredRuntimeToken;

const policyKeys = generateDecisionKeyPair();
const policyPrivateKey = policyKeys.privateKey
  .export({ format: "der", type: "pkcs8" })
  .toString("base64url");
const policyPublicKey = policyKeys.publicKey;
const sharedRoot = await mkdtemp(join(tmpdir(), `${prefix}-work-`));
const artifactRoot = await mkdtemp(join(tmpdir(), `${prefix}-artifacts-`));
const probePath = `/tmp/${prefix}-destructive-probe`;

let postgresPort = "";
let consoleProcess: ReturnType<typeof Bun.spawn> | null = null;
const hermesRunIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`G1-004D assertion failed: ${message}`);
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function psql(statement: string, database = databaseName) {
  return docker([
    "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-Atq",
  ], statement);
}

async function waitFor<T>(
  label: string,
  read: () => Promise<T> | T,
  predicate: (value: T) => boolean,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (predicate(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(200);
  }
  throw new Error(`${label} indisponible après ${timeoutMs} ms${lastError ? `: ${String(lastError)}` : ""}`);
}

function applyMigrations() {
  const journal = JSON.parse(
    readFileSync(join(root, "apps/server/drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  for (const entry of journal.entries) {
    psql(readFileSync(join(root, `apps/server/drizzle/${entry.tag}.sql`), "utf8"));
  }
}

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function startConsole(port: number, databaseUrl: string, withPolicy: boolean) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    APP_ENCRYPTION_KEY: "p-int-g1-004-real-e2e",
    HERMES_SHARED_WORKDIR: sharedRoot,
    HERMES_CONSOLE_ARTIFACTS_DIR: artifactRoot,
    HERMES_PROTOCOL: "agent",
    CONSOLE_SERVER_HOST: "127.0.0.1",
    CONSOLE_SERVER_PORT: String(port),
    WEB_DIST_DIR: join(root, "apps/web/dist"),
    GOOGLE_ALLOWED_EMAILS: "g1-004-real@example.invalid,g1-004-real-approver@example.invalid",
    ...(withPolicy
      ? {
          HERMES_POLICY_PRIVATE_KEY_B64URL: policyPrivateKey,
          HERMES_POLICY_PUBLIC_KEY_B64URL: policyPublicKey,
        }
      : {}),
  };
  if (!withPolicy) {
    delete env.HERMES_POLICY_PRIVATE_KEY_B64URL;
    delete env.HERMES_POLICY_PUBLIC_KEY_B64URL;
  }
  consoleProcess = Bun.spawn(["bun", join(root, "apps/server/src/index.ts")], {
    cwd: root,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  await waitFor(
    "serveur Console",
    async () => fetch(`http://127.0.0.1:${port}/api/healthz`),
    (response) => response.ok,
  );
}

async function stopConsole() {
  if (!consoleProcess) return;
  const processRef = consoleProcess;
  processRef.kill();
  await Promise.race([processRef.exited.catch(() => undefined), Bun.sleep(2_000)]);
  if (processRef.exitCode === null) {
    processRef.kill(9);
    await processRef.exited.catch(() => undefined);
  }
  consoleProcess = null;
}

function apiHeaders(token: string, csrf: string) {
  return {
    cookie: `hc_session=${encodeURIComponent(token)}`,
    "x-csrf-token": csrf,
  };
}

async function api(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  token = requesterToken,
  csrf = requesterCsrf,
) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...apiHeaders(token, csrf), ...(init.headers ?? {}) },
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function waitThreadRun(baseUrl: string, threadId: string, status: string) {
  try {
    return await waitFor(
      `run ${threadId} -> ${status}`,
      async () => json<{ thread: { runs: Array<{ status: string; error: string | null }> } }>(
        await api(baseUrl, `/api/threads/${encodeURIComponent(threadId)}`),
      ),
      (body) => body.thread.runs.at(-1)?.status === status,
    );
  } catch (error) {
    const row = psql(`
      SELECT id || '|' || status || '|' || coalesce(error, '') || '|' || coalesce(hermes_response_id, '')
      FROM runs WHERE thread_id = ${sqlString(threadId)} ORDER BY created_at DESC LIMIT 1;
    `);
    const hermesRunId = row.split("|")[3] ?? "";
    const remote = hermesRunId
      ? await hermesStatus(hermesRunId).catch(() => ({ status: "unavailable" }))
      : { status: "missing" };
    throw new Error(`${String(error)}; db_run=${row}; hermes_run=${remote.status}`);
  }
}

async function createApprovalRun(baseUrl: string, message: string, attempt = 1) {
  const response = await api(baseUrl, "/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, agentId }),
  });
  assert(response.status === 202, `création thread/run (${response.status})`);
  const created = await json<{ threadId: string; runId: string }>(response);
  const hermesRunId = await waitFor(
    "hermes_response_id",
    () => psql(`SELECT hermes_response_id FROM runs WHERE id = ${sqlString(created.runId)};`),
    (value) => Boolean(value),
  );
  hermesRunIds.push(hermesRunId);
  try {
  const observed = await waitFor(
    `run ${created.threadId} -> approval or terminal`,
    async () => json<{ thread: { runs: Array<{ status: string; error: string | null }> } }>(
      await api(baseUrl, `/api/threads/${encodeURIComponent(created.threadId)}`),
    ),
    (body) => ["awaiting_approval", "completed", "failed", "cancelled"].includes(body.thread.runs.at(-1)?.status ?? ""),
  );
  const observedStatus = observed.thread.runs.at(-1)?.status;
  if (observedStatus !== "awaiting_approval") {
    if (attempt >= 4) {
      throw new Error(`Hermes n'a pas produit de demande approval après ${attempt} tentatives (dernier état ${observedStatus}).`);
    }
    console.log(`G1-004D precondition-not-reached status=${observedStatus} retry=${attempt + 1}`);
    return createApprovalRun(baseUrl, message, attempt + 1);
  }
  } catch (error) {
    const runState = psql(`SELECT status || ':' || coalesce(error, '') FROM runs WHERE id = ${sqlString(created.runId)};`);
    const remoteState = await hermesStatus(hermesRunId).catch(() => ({ status: "unavailable" }));
    throw new Error(`${String(error)}; console_run=${runState}; hermes_run=${remoteState.status}`);
  }
  const snapshot = await json<{
    thread: {
      events: Array<{ type: string; payload: Record<string, unknown> }>;
    };
  }>(await api(baseUrl, `/api/threads/${encodeURIComponent(created.threadId)}`));
  const approval = [...snapshot.thread.events]
    .reverse()
    .find((event) => event.type === "approval.requested");
  const approvalRequestId = approval?.payload.approvalRequestId;
  assert(typeof approvalRequestId === "string", "approvalRequestId Hermes présent");
  return { ...created, approvalRequestId, hermesRunId };
}

async function hermesStatus(hermesRunId: string) {
  const response = await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(hermesRunId)}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${runtimeToken}` },
  });
  assert(response.ok, `état Hermes (${response.status})`);
  return (await response.json()) as { status: string; output?: string | null };
}

async function stopHermesRun(hermesRunId: string) {
  await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(hermesRunId)}/stop`, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${runtimeToken}` },
  }).catch(() => undefined);
}

async function main() {
  assert(spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0, "Docker disponible");
  const health = await fetch(`${runtimeBaseUrl}/health`, {
    headers: { Authorization: `Bearer ${runtimeToken}` },
  });
  assert(health.ok, `Hermes health (${health.status})`);
  const capabilities = await fetch(`${runtimeBaseUrl}/v1/capabilities`, {
    headers: { Authorization: `Bearer ${runtimeToken}` },
  });
  assert(capabilities.ok, `Hermes capabilities (${capabilities.status})`);
  assert(!await Bun.file(probePath).exists(), "probe absent avant recette");

  docker([
    "run", "--detach", "--rm", "--name", containerName,
    "--publish", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=384m",
    "--env", "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
  ]);
  await waitFor(
    "PostgreSQL",
    () => spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"]).status,
    (status) => status === 0,
  );
  await waitFor(
    "PostgreSQL SQL",
    () => spawnSync(
      "docker",
      ["exec", containerName, "psql", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1"],
      { encoding: "utf8" },
    ).status,
    (status) => status === 0,
  );
  docker(["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE "${databaseName}";`]);
  applyMigrations();
  postgresPort = docker(["port", containerName, "5432/tcp"]).match(/:(\d+)$/)?.[1] ?? "";
  assert(postgresPort, "port PostgreSQL lisible");

  process.env.APP_ENCRYPTION_KEY = "p-int-g1-004-real-e2e";
  const { encryptSecret } = await import("../src/lib/crypto");
  const encryptedRuntimeToken = encryptSecret(runtimeToken);
  const databaseUrl = `postgres://postgres@127.0.0.1:${postgresPort}/${databaseName}`;
  const disclosureVersion = "2026-08-01.v2";
  psql(`
    INSERT INTO organizations (id, name, slug, kind)
      VALUES (${sqlString(organizationId)}, 'G1-004 real', 'g1-004-real', 'client');
    INSERT INTO sites (id, client_organization_id, name, slug)
      VALUES (${sqlString(siteId)}, ${sqlString(organizationId)}, 'G1-004 real', 'g1-004-real');
    INSERT INTO console_users (id, email, google_subject, ai_disclosure_version, ai_disclosure_accepted_at)
      VALUES (${sqlString(requesterId)}, 'g1-004-real@example.invalid', 'sub-g1-004-real', ${sqlString(disclosureVersion)}, now()),
             (${sqlString(approverId)}, 'g1-004-real-approver@example.invalid', 'sub-g1-004-real-approver', ${sqlString(disclosureVersion)}, now());
    INSERT INTO organization_memberships (user_id, organization_id)
      VALUES (${sqlString(requesterId)}, ${sqlString(organizationId)}), (${sqlString(approverId)}, ${sqlString(organizationId)});
    INSERT INTO site_memberships (user_id, site_id, organization_id, role)
      VALUES (${sqlString(requesterId)}, ${sqlString(siteId)}, ${sqlString(organizationId)}, 'requester'),
             (${sqlString(approverId)}, ${sqlString(siteId)}, ${sqlString(organizationId)}, 'approver');
    INSERT INTO agents (id, site_id, owner_user_id, author_user_id, name, slug, instructions, model)
      VALUES (${sqlString(agentId)}, ${sqlString(siteId)}, ${sqlString(requesterId)}, ${sqlString(requesterId)}, 'G1-004 real', 'g1-004-real', 'Controlled verification. Use the terminal tool exactly once to run the command from the user. This is the only requested command. Do not use any other tool.', 'hermes-agent');
    INSERT INTO console_sessions (token_hash, user_id, site_id, csrf_token, expires_at)
      VALUES (${sqlString(sessionHash(requesterToken))}, ${sqlString(requesterId)}, ${sqlString(siteId)}, ${sqlString(requesterCsrf)}, now() + interval '1 day'),
             (${sqlString(sessionHash(approverToken))}, ${sqlString(approverId)}, ${sqlString(siteId)}, ${sqlString(approverCsrf)}, now() + interval '1 day');
    INSERT INTO runtime_config (id, name, base_url, encrypted_token, transport, config_revision)
      VALUES ('default', 'Hermes local real G1-004', ${sqlString(runtimeBaseUrl)}, ${sqlString(encryptedRuntimeToken)}, 'direct', 1);
    INSERT INTO console_setup (id, step, completed_at, runtime_verified_at, runtime_config_version)
      VALUES ('default', 'completed', now(), now(), 'database:1');
  `);

  const serverPort = 35_000 + Math.floor(Math.random() * 900);
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  try {
    await startConsole(serverPort, databaseUrl, true);
    const allowed = await createApprovalRun(
      baseUrl,
      `Use the terminal tool exactly once to run: rm -rf -- ${probePath}. Then report its output.`,
    );
    assert(!await Bun.file(probePath).exists(), "probe absent avant refus policy");
    const allowedResponse = await api(baseUrl, `/api/runs/${allowed.runId}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice: "deny", approvalRequestId: allowed.approvalRequestId }),
    }, approverToken, approverCsrf);
    assert(allowedResponse.ok, `refus via route Console (${allowedResponse.status})`);
    await waitThreadRun(baseUrl, allowed.threadId, "completed");
    assert(!await Bun.file(probePath).exists(), "refus autorisé sans effet terminal");
    const policyAudit = psql(`
      SELECT reason_code || '|' || coalesce(after_state -> 'policyDecision' ->> 'actionKind', '')
      FROM audit_ledger_entries
      WHERE resource_id = ${sqlString(allowed.runId)}
      ORDER BY sequence;
    `);
    assert(policyAudit.includes("RUN_APPROVAL_DENIED|hermes.run.approval"), "audit policy corrélée");
    console.log("G1-004D positive=real-console-route policy=pass no-terminal-effect=pass");

    await stopConsole();
    await startConsole(serverPort, databaseUrl, false);
    const unavailable = await createApprovalRun(
      baseUrl,
      `Use the terminal tool exactly once to run: rm -rf -- ${probePath}. Then report its output.`,
    );
    const deniedByPolicy = await api(baseUrl, `/api/runs/${unavailable.runId}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice: "deny", approvalRequestId: unavailable.approvalRequestId }),
    }, approverToken, approverCsrf);
    assert(deniedByPolicy.status === 503, `policy absente refusée (${deniedByPolicy.status})`);
    assert((await hermesStatus(unavailable.hermesRunId)).status === "waiting_for_approval", "Hermes inchangé avant policy");
    assert(!await Bun.file(probePath).exists(), "policy absente sans effet");
    console.log("G1-004D negative=real-console-route policy-unavailable=pass remote-untouched=pass");

    await stopConsole();
    await startConsole(serverPort, databaseUrl, true);
    const recovery = await api(baseUrl, `/api/runs/${unavailable.runId}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice: "deny", approvalRequestId: unavailable.approvalRequestId }),
    }, approverToken, approverCsrf);
    assert(recovery.ok, `rejeu après restauration policy (${recovery.status})`);
    await waitThreadRun(baseUrl, unavailable.threadId, "completed");
    assert(!await Bun.file(probePath).exists(), "probe absent après nettoyage");
    console.log(JSON.stringify({
      story: "US-G1-004D-real-console-local",
      positive: { route: "pass", postgresClaim: "pass", signedPolicy: "pass", hermesApproval: "pass", noTerminalEffect: "pass" },
      negative: { policyUnavailable: "pass", remoteUntouched: "pass", recovery: "pass" },
      limitations: ["Hermes runtime target supplied by the caller", "provider token supplied outside repository", "independent reviewer/operator 2 still required"],
    }, null, 2));
  } finally {
    await stopConsole();
    for (const hermesRunId of hermesRunIds) {
      if ((await hermesStatus(hermesRunId).catch(() => ({ status: "unknown" }))).status === "waiting_for_approval") {
        await stopHermesRun(hermesRunId);
      }
    }
  }
}

try {
  await main();
} finally {
  delete process.env.DATABASE_URL;
  delete process.env.APP_ENCRYPTION_KEY;
  docker(["rm", "--force", containerName]);
  await rm(sharedRoot, { recursive: true, force: true });
  await rm(artifactRoot, { recursive: true, force: true });
}
