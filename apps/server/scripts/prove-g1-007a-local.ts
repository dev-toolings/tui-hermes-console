import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { HermesG1A007AFixture } from "./fixtures/hermes-g1-007a";

/**
 * G1-007A — parcours post-setup local inter-process.
 *
 * Ce harness ne simule pas le runner : il démarre le serveur Hono dans un
 * processus séparé, parle à une vraie base PostgreSQL et remplace uniquement
 * Hermes par un faux serveur HTTP qui expose les mêmes endpoints observés.
 * Il est volontairement borné à une installation déjà configurée : le code
 * actuel ne possède pas encore de rôle `installation_admin` capable de
 * franchir `/api/setup` et `/api/runtime` via l'API publique.
 */

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const root = resolve(import.meta.dir, "../../..");
const fixturePrefix = `g1-007a-${Date.now()}`;
const containerName = `${fixturePrefix}-postgres`;
const databaseName = "g1_007a";
const sessionToken = "fixture-g1-007a-session";
const approverSessionToken = "fixture-g1-007a-approver-session";
const expiredToken = "fixture-g1-007a-expired";
const csrfToken = "fixture-g1-007a-csrf";
const approverCsrfToken = "fixture-g1-007a-approver-csrf";
const sharedRoot = await mkdtemp(join(tmpdir(), `${fixturePrefix}-work-`));
const artifactRoot = await mkdtemp(join(tmpdir(), `${fixturePrefix}-artifacts-`));

const SITE_ID = "site_g1_007a";
const ORG_ID = "org_g1_007a";
const USER_ID = "usr_g1_007a";
const APPROVER_ID = "usr_g1_007a_approver";
const AGENT_ID = "agent_g1_007a";

let postgresPort = "";
let consoleProcess: ReturnType<typeof Bun.spawn> | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`G1-007A assertion failed: ${message}`);
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

async function waitFor<T>(
  label: string,
  read: () => Promise<T> | T,
  predicate: (value: T) => boolean,
  timeoutMs = 20_000,
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
    await Bun.sleep(150);
  }
  throw new Error(
    `${label} indisponible après ${timeoutMs} ms${lastError ? `: ${String(lastError)}` : ""}`,
  );
}

function applyMigrations() {
  const journal = JSON.parse(
    readFileSync(join(root, "apps/server/drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  for (const entry of journal.entries) {
    psql(readFileSync(join(root, `apps/server/drizzle/${entry.tag}.sql`), "utf8"));
  }
}

async function startConsole(port: number, databaseUrl: string) {
  consoleProcess = Bun.spawn(["bun", join(root, "apps/server/src/index.ts")], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_ENCRYPTION_KEY: "p-int-g1-007a-e2e",
      HERMES_SHARED_WORKDIR: sharedRoot,
      HERMES_CONSOLE_ARTIFACTS_DIR: artifactRoot,
      HERMES_PROTOCOL: "agent",
      CONSOLE_SERVER_HOST: "127.0.0.1",
      CONSOLE_SERVER_PORT: String(port),
      CONSOLE_SPA_DIR: join(root, "apps/console/dist"),
      GOOGLE_ALLOWED_EMAILS: "g1-007a@example.invalid,g1-007a-approver@example.invalid",
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  await waitFor(
    "serveur Console",
    async () => fetch(`http://127.0.0.1:${port}/api/healthz`),
    (response) => response.ok,
    20_000,
  );
}

async function stopConsole() {
  if (!consoleProcess) return;
  const processRef = consoleProcess;
  processRef.kill();
  await Promise.race([
    processRef.exited.catch(() => undefined),
    Bun.sleep(2_000),
  ]);
  if (processRef.exitCode === null) {
    processRef.kill(9);
    await processRef.exited.catch(() => undefined);
  }
  consoleProcess = null;
}

function apiHeaders(token = sessionToken, csrf = csrfToken) {
  return {
    cookie: `hc_session=${encodeURIComponent(token)}`,
    ...(csrf ? { "x-csrf-token": csrf } : {}),
  };
}

async function api(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  token = sessionToken,
  csrf = csrfToken,
) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...apiHeaders(token, csrf),
      ...(init.headers ?? {}),
    },
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function waitRun(baseUrl: string, threadId: string, status: string) {
  return waitFor(
    `run ${threadId} → ${status}`,
    async () => json<{ thread: { runs: Array<{ status: string; error: string | null }> } }>(await api(baseUrl, `/api/threads/${encodeURIComponent(threadId)}`, { method: "GET" })),
    (body) => body.thread.runs.at(-1)?.status === status,
  );
}

async function main() {
  console.log("G1-007A phase=docker");
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    throw new Error("Docker est requis pour la preuve G1-007A-local.");
  }

  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,noexec,nosuid,size=384m",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    POSTGRES_IMAGE,
  ]);
  await waitFor(
    "PostgreSQL",
    () => spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"]).status,
    (status) => status === 0,
    20_000,
  );
  await waitFor(
    "PostgreSQL SQL",
    () => spawnSync("docker", ["exec", containerName, "psql", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1"], { encoding: "utf8" }).status,
    (status) => status === 0,
    20_000,
  );
  docker(["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-c", `CREATE DATABASE "${databaseName}";`]);
  applyMigrations();
  const binding = docker(["port", containerName, "5432/tcp"]);
  postgresPort = binding.match(/:(\d+)$/)?.[1] ?? "";
  assert(postgresPort, "port PostgreSQL illisible");

  process.env.APP_ENCRYPTION_KEY = "p-int-g1-007a-e2e";
  const { encryptSecret } = await import("../src/lib/crypto");
  const encryptedToken = encryptSecret("fixture-hermes-token");
  const databaseUrl = `postgres://postgres@127.0.0.1:${postgresPort}/${databaseName}`;
  const sessionHash = createHash("sha256").update(sessionToken).digest("hex");
  const approverSessionHash = createHash("sha256").update(approverSessionToken).digest("hex");
  const expiredHash = createHash("sha256").update(expiredToken).digest("hex");
  const disclosureVersion = "2026-08-01.v2";

  psql(`
    INSERT INTO organizations (id, name, slug, kind)
      VALUES (${sqlString(ORG_ID)}, 'G1-007A fixture', 'g1-007a-fixture', 'client');
    INSERT INTO sites (id, client_organization_id, name, slug)
      VALUES (${sqlString(SITE_ID)}, ${sqlString(ORG_ID)}, 'G1-007A fixture', 'g1-007a-fixture');
    INSERT INTO console_users
      (id, email, google_subject, ai_disclosure_version, ai_disclosure_accepted_at)
      VALUES (${sqlString(USER_ID)}, 'g1-007a@example.invalid', 'sub-g1-007a', ${sqlString(disclosureVersion)}, now());
    INSERT INTO console_users
      (id, email, google_subject, ai_disclosure_version, ai_disclosure_accepted_at)
      VALUES (${sqlString(APPROVER_ID)}, 'g1-007a-approver@example.invalid', 'sub-g1-007a-approver', ${sqlString(disclosureVersion)}, now());
    INSERT INTO organization_memberships (user_id, organization_id)
      VALUES (${sqlString(USER_ID)}, ${sqlString(ORG_ID)}), (${sqlString(APPROVER_ID)}, ${sqlString(ORG_ID)});
    INSERT INTO site_memberships (user_id, site_id, organization_id, role)
      VALUES (${sqlString(USER_ID)}, ${sqlString(SITE_ID)}, ${sqlString(ORG_ID)}, 'requester'),
             (${sqlString(APPROVER_ID)}, ${sqlString(SITE_ID)}, ${sqlString(ORG_ID)}, 'approver');
    INSERT INTO agents
      (id, site_id, owner_user_id, author_user_id, name, slug, instructions, model)
      VALUES (${sqlString(AGENT_ID)}, ${sqlString(SITE_ID)}, ${sqlString(USER_ID)}, ${sqlString(USER_ID)}, 'G1-007A Agent', 'g1-007a-agent', 'Execute the fixture mission.', 'fixture-model');
    INSERT INTO console_sessions
      (token_hash, user_id, site_id, csrf_token, expires_at)
      VALUES (${sqlString(sessionHash)}, ${sqlString(USER_ID)}, ${sqlString(SITE_ID)}, ${sqlString(csrfToken)}, now() + interval '1 day');
    INSERT INTO console_sessions
      (token_hash, user_id, site_id, csrf_token, expires_at)
      VALUES (${sqlString(approverSessionHash)}, ${sqlString(APPROVER_ID)}, ${sqlString(SITE_ID)}, ${sqlString(approverCsrfToken)}, now() + interval '1 day');
    INSERT INTO console_sessions
      (token_hash, user_id, site_id, csrf_token, expires_at)
      VALUES (${sqlString(expiredHash)}, ${sqlString(USER_ID)}, ${sqlString(SITE_ID)}, 'expired-csrf', now() - interval '1 minute');
    INSERT INTO runtime_config
      (id, name, base_url, encrypted_token, transport, config_revision)
      VALUES ('default', 'G1-007A fake Hermes', 'http://placeholder.invalid', ${sqlString(encryptedToken)}, 'direct', 1);
    INSERT INTO console_setup
      (id, step, completed_at, runtime_verified_at, runtime_config_version)
      VALUES ('default', 'completed', now(), now(), 'database:1');
  `);

  const hermes = new HermesG1A007AFixture(sharedRoot);
  const hermesHealth = await fetch(`${hermes.baseUrl}/health`);
  assert(hermesHealth.ok, `health Hermes fixture (${hermesHealth.status})`);
  const hermesCapabilities = await fetch(`${hermes.baseUrl}/v1/capabilities`);
  assert(hermesCapabilities.ok, `capabilities Hermes fixture (${hermesCapabilities.status})`);
  psql(`UPDATE runtime_config SET base_url = ${sqlString(hermes.baseUrl)} WHERE id = 'default';`);
  const serverPort = 34_000 + Math.floor(Math.random() * 1_000);
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    console.log("G1-007A phase=console-start");
    await startConsole(serverPort, databaseUrl);

    console.log("G1-007A phase=setup-agent");
    const setup = await api(baseUrl, "/api/setup", { method: "GET" });
    assert(setup.ok, `setup seedé lisible (${setup.status})`);
    const setupBody = await json<{ setup: { step: string; consent: { current: boolean } } }>(setup);
    assert(setupBody.setup.step === "completed", "setup complet");
    assert(setupBody.setup.consent.current, "consentement IA courant");

    const agents = await api(baseUrl, "/api/agents", { method: "GET" });
    assert(agents.ok, `agent visible (${agents.status})`);
    const agentBody = await json<{ agents: Array<{ id: string }> }>(agents);
    assert(agentBody.agents.some((agent) => agent.id === AGENT_ID), "agent seedé visible");

    const firstCreation = await api(baseUrl, "/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Produce the approved fixture artifact.", agentId: AGENT_ID }),
    });
    assert(firstCreation.status === 202, `création thread/run (${firstCreation.status})`);
    const first = await json<{ threadId: string; runId: string }>(firstCreation);
    console.log(`G1-007A phase=first-run-created run=${first.runId}`);
    const firstHermesRun = await waitFor(
      "création run Hermes",
      () => hermes.latestRunId,
      (value): value is string => Boolean(value),
    );
    assert(firstHermesRun, "identifiant Hermes initial");
    hermes.bindConsoleRun(firstHermesRun, first.runId);
    await waitRun(baseUrl, first.threadId, "awaiting_approval");

    // Arrêt réel pendant un run non terminal : le second process doit relire
    // l'état Hermes `waiting_for_approval` et conserver la demande sans la
    // réémettre ni créer un second CAS.
    console.log("G1-007A phase=restart-awaiting-approval");
    await stopConsole();
    await startConsole(serverPort, databaseUrl);
    await waitRun(baseUrl, first.threadId, "awaiting_approval");

    const waiting = await json<{ thread: { events: Array<{ type: string; payload: Record<string, unknown> }>; runs: Array<{ status: string }> } }>(await api(baseUrl, `/api/threads/${first.threadId}`, { method: "GET" }));
    const approval = [...waiting.thread.events]
      .reverse()
      .find((event) => event.type === "approval.requested");
    const approvalRequestId = approval?.payload.approvalRequestId;
    assert(typeof approvalRequestId === "string", "approvalRequestId stable exposé dans le snapshot");

    const approved = await api(baseUrl, `/api/runs/${first.runId}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice: "once", approvalRequestId }),
    }, approverSessionToken, approverCsrfToken);
    assert(approved.ok, `POST approbation (${approved.status})`);
    await waitRun(baseUrl, first.threadId, "completed");
    console.log("G1-007A phase=approved-completed");
    assert(hermes.approvalCalls.length === 1, "un seul POST Hermes autorisé");
    assert(hermes.dangerousEffectCount === 1, "l'effet synthétique autorisé s'est produit une fois");
    const auditRows = psql(`
      SELECT reason_code || '|' || extract(epoch FROM recorded_at) * 1000 || '|' ||
             coalesce(after_state ->> 'approvalRequestId', '')
      FROM audit_ledger_entries
      WHERE target_site_id = ${sqlString(SITE_ID)}
        AND resource_type = 'run'
        AND resource_id = ${sqlString(first.runId)}
        AND reason_code IN ('RUN_APPROVAL_INTENT', 'RUN_APPROVAL_ALLOWED')
      ORDER BY sequence;
    `).split("\n").filter(Boolean).map((line) => {
      const [reasonCode, recordedAt, requestId] = line.split("|");
      return { reasonCode, recordedAt: Number(recordedAt), requestId };
    });
    const intentAudit = auditRows.find((row) => row.reasonCode === "RUN_APPROVAL_INTENT");
    const outcomeAudit = auditRows.find((row) => row.reasonCode === "RUN_APPROVAL_ALLOWED");
    assert(intentAudit && outcomeAudit, "audit intent et outcome présents");
    assert(intentAudit.requestId === approvalRequestId, "audit intent corrélé à approvalRequestId");
    assert(auditRows.indexOf(intentAudit) < auditRows.indexOf(outcomeAudit), "audit intent avant outcome");
    assert(intentAudit.recordedAt <= (hermes.approvalCalls[0]?.receivedAt ?? Number.POSITIVE_INFINITY), "audit intent persisté avant POST Hermes");

    const filesAfterApproval = await json<{ artifacts: Array<{ id: string; runId: string; direction: string; sizeBytes: number; checksumSha256: string }> }>(await api(baseUrl, "/api/files?limit=50", { method: "GET" }));
    const outputArtifact = filesAfterApproval.artifacts.find((artifact) => artifact.runId === first.runId && artifact.direction === "output");
    assert(outputArtifact, "artefact output indexé");
    const artifactResponse = await api(baseUrl, `/api/files/${outputArtifact.id}`, { method: "GET" });
    assert(artifactResponse.ok, `lecture artefact (${artifactResponse.status})`);
    const artifactBytes = new Uint8Array(await artifactResponse.arrayBuffer());
    assert(new TextDecoder().decode(artifactBytes) === "artifact-bytes-g1-007a", "octets artefact intacts");
    assert(createHash("sha256").update(artifactBytes).digest("hex") === outputArtifact.checksumSha256, "hash artefact cohérent");

    // Second redémarrage après completion : les corrélations et l'artefact
    // privé restent lisibles sur les mêmes racines persistantes.
    console.log("G1-007A phase=restart-completed");
    await stopConsole();
    await startConsole(serverPort, databaseUrl);
    await waitRun(baseUrl, first.threadId, "completed");
    const afterRestart = await api(baseUrl, `/api/files/${outputArtifact.id}`, { method: "GET" });
    assert(afterRestart.ok, `artefact relu après redémarrage (${afterRestart.status})`);
    assert(new TextDecoder().decode(new Uint8Array(await afterRestart.arrayBuffer())) === "artifact-bytes-g1-007a", "octets conservés après redémarrage");

    const storagePath = psql(`SELECT storage_path FROM artifacts WHERE id = ${sqlString(outputArtifact.id)};`);
    await rm(storagePath, { force: true });
    const missingArtifact = await api(baseUrl, `/api/files/${outputArtifact.id}`, { method: "GET" });
    assert(missingArtifact.status === 410, `artefact absent refusé (${missingArtifact.status})`);
    await writeFile(storagePath, "corrupt", "utf8");
    const corruptArtifact = await api(baseUrl, `/api/files/${outputArtifact.id}`, { method: "GET" });
    assert(corruptArtifact.status === 409, `artefact corrompu refusé (${corruptArtifact.status})`);

    const denyCreation = await api(baseUrl, "/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Refuse the fixture effect.", agentId: AGENT_ID }),
    });
    assert(denyCreation.status === 202, `création run deny (${denyCreation.status})`);
    const denied = await json<{ threadId: string; runId: string }>(denyCreation);
    console.log(`G1-007A phase=deny-run-created run=${denied.runId}`);
    const denyHermesRun = await waitFor("second run Hermes", () => hermes.latestRunId, (value): value is string => Boolean(value) && value !== firstHermesRun);
    assert(denyHermesRun, "identifiant Hermes deny");
    hermes.bindConsoleRun(denyHermesRun, denied.runId);
    await waitRun(baseUrl, denied.threadId, "awaiting_approval");
    const denySnapshot = await json<{ thread: { events: Array<{ type: string; payload: Record<string, unknown> }> } }>(await api(baseUrl, `/api/threads/${denied.threadId}`, { method: "GET" }));
    const denyApproval = [...denySnapshot.thread.events].reverse().find((event) => event.type === "approval.requested");
    assert(typeof denyApproval?.payload.approvalRequestId === "string", "identité deny présente");
    const denyResponse = await api(baseUrl, `/api/runs/${denied.runId}/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice: "deny", approvalRequestId: denyApproval!.payload.approvalRequestId }),
    }, approverSessionToken, approverCsrfToken);
    assert(denyResponse.ok, `POST deny (${denyResponse.status})`);
    await waitRun(baseUrl, denied.threadId, "completed");
    assert(hermes.dangerousEffectCount === 1, "deny n'exécute aucun effet");
    const deniedFiles = await json<{ artifacts: Array<{ runId: string; direction: string }> }>(await api(baseUrl, "/api/files?limit=50", { method: "GET" }));
    assert(!deniedFiles.artifacts.some((artifact) => artifact.runId === denied.runId && artifact.direction === "output"), "deny ne fabrique pas d'artefact output");

    const beforeCsrfRuns = Number(psql("SELECT count(*) FROM runs;"));
    const csrfResponse = await api(baseUrl, "/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "CSRF should fail.", agentId: AGENT_ID }),
    }, sessionToken, "wrong-csrf");
    assert(csrfResponse.status === 403, `CSRF invalide refusé (${csrfResponse.status})`);
    assert(Number(psql("SELECT count(*) FROM runs;")) === beforeCsrfRuns, "CSRF invalide sans mutation DB");

    const expiredResponse = await api(baseUrl, "/api/setup", { method: "GET" }, expiredToken, "");
    assert(expiredResponse.status === 401, `session expirée refusée (${expiredResponse.status})`);

    hermes.stop();
    console.log("G1-007A phase=runtime-unavailable");
    const unavailableCreation = await api(baseUrl, "/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Runtime unavailable should fail safely.", agentId: AGENT_ID }),
    });
    assert(unavailableCreation.status === 202, "la création asynchrone reste acceptée avant le runtime");
    const unavailable = await json<{ threadId: string }>(unavailableCreation);
    const unavailableSnapshot = await waitRun(baseUrl, unavailable.threadId, "failed");
    assert(unavailableSnapshot.thread.runs.at(-1)?.error, "runtime indisponible explique l'échec");

    console.log(JSON.stringify({
      story: "US-G1-007A-post-setup-local",
      positive: {
        setup: "completed",
        agentThreadRun: "pass",
        approvalRequestId: "pass",
        casAuditRelay: "pass",
        restartReconciliation: "pass",
        artifactBytesAndHash: "pass",
      },
      negative: {
        runtimeUnavailable: "pass",
        expiredSession: "pass",
        invalidCsrf: "pass",
        denyNoEffect: "pass",
        missingOrCorruptArtifact: "pass",
      },
      hermesApprovalPosts: hermes.approvalCalls.length,
      dangerousEffectCount: hermes.dangerousEffectCount,
      limitations: ["synthetic Hermes only", "post-setup seed", "not Gate 1 acceptance", "no real Google OIDC"],
    }, null, 2));
  } finally {
    await stopConsole();
    hermes.stop();
  }
}

try {
  await main();
} catch (error) {
  console.error("[G1-007A] FAILED", error);
  throw error;
} finally {
  delete process.env.DATABASE_URL;
  delete process.env.APP_ENCRYPTION_KEY;
  docker(["rm", "--force", containerName]);
  await rm(sharedRoot, { recursive: true, force: true });
  await rm(artifactRoot, { recursive: true, force: true });
}
