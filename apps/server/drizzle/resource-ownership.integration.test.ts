import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { runArtifactOutputDir, runOutputDir } from "@/modules/artifacts/paths";
import { scanOutputArtifacts } from "@/modules/artifacts/repository";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-ownership-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

const sessions = {
  admin: { userId: "usr_admin", token: "token-admin", csrf: "csrf-admin" },
  operator: { userId: "usr_operator", token: "token-operator", csrf: "csrf-operator" },
  alice: { userId: "usr_alice", token: "token-alice", csrf: "csrf-alice" },
  bob: { userId: "usr_bob", token: "token-bob", csrf: "csrf-bob" },
} as const;

type Actor = keyof typeof sessions;
type AppFetch = (request: Request) => Response | Promise<Response>;
let appFetch: AppFetch;

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

function psql(statement: string, database = "ownership") {
  return docker(
    [
      "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", database, "-Atq",
    ],
    statement,
  );
}

function spawnPsql(statement: string) {
  const process = Bun.spawn(
    [
      "docker", "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "ownership", "-Atq",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  process.stdin.write(statement);
  process.stdin.end();
  return process;
}

function applyMigrations() {
  for (const entry of journal.entries) {
    psql(readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

async function waitForPostgres() {
  const initCompleteMarker = "PostgreSQL init process complete; ready for start up.";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", containerName], { encoding: "utf8" });
    const output = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
    const ready = spawnSync(
      "docker",
      ["exec", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;"],
      { stdio: "ignore" },
    ).status === 0;
    if (output.includes(initCompleteMarker) && ready) return;
    await Bun.sleep(250);
  }
  throw new Error("PostgreSQL ownership indisponible après 15 secondes.");
}

function request(actor: Actor, path: string, options: { method?: string; body?: unknown } = {}) {
  const session = sessions[actor];
  const headers = new Headers({ cookie: `hc_session=${session.token}` });
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    headers.set("x-csrf-token", session.csrf);
    headers.set("origin", "http://console.test");
  }
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return new Request(`http://console.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
}

function uploadRequest(actor: Actor, runId: string) {
  const session = sessions[actor];
  const form = new FormData();
  form.set("runId", runId);
  form.set("file", new File(["x"], "proof.txt", { type: "text/plain" }));
  return new Request("http://console.test/api/files", {
    method: "POST",
    headers: {
      cookie: `hc_session=${session.token}`,
      "x-csrf-token": session.csrf,
      origin: "http://console.test",
    },
    body: form,
  });
}

async function json<T>(response: Response) {
  return response.json() as Promise<T>;
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("explicit resource ownership through Hono and PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName,
      "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    await waitForPostgres();
    psql('CREATE DATABASE "ownership";', "postgres");
    applyMigrations();
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);

    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/ownership`;
    process.env.APP_ENCRYPTION_KEY = "p-int-resource-ownership";
    process.env.CONSOLE_APP_ORIGIN = "http://console.test";
    process.env.GOOGLE_ALLOWED_EMAILS = "admin@example.com,operator@example.com,alice@example.com,bob@example.com";

    psql(`
      INSERT INTO organizations (id, name, slug, kind) VALUES
        ('org_client_paris', 'Paris client', 'client-paris', 'client'),
        ('org_client_lyon', 'Lyon client', 'client-lyon', 'client'),
        ('org_msp_default', 'Default MSP', 'default-msp', 'msp');
      INSERT INTO sites (id, client_organization_id, name, slug) VALUES
        ('paris', 'org_client_paris', 'Paris', 'paris'),
        ('lyon', 'org_client_lyon', 'Lyon', 'lyon');
      INSERT INTO console_users
        (id, email, google_subject, ai_disclosure_version, ai_disclosure_accepted_at) VALUES
        ('usr_admin', 'admin@example.com', 'sub-admin', '2026-08-01.v2', now()),
        ('usr_operator', 'operator@example.com', 'sub-operator', '2026-08-01.v2', now()),
        ('usr_alice', 'alice@example.com', 'sub-alice', '2026-08-01.v2', now()),
        ('usr_bob', 'bob@example.com', 'sub-bob', '2026-08-01.v2', now()),
        ('usr_author', 'author@example.com', 'sub-author', '2026-08-01.v2', now()),
        ('usr_race', 'race@example.com', 'sub-race', '2026-08-01.v2', now()),
        ('usr_auditor', 'auditor@example.com', 'sub-auditor', '2026-08-01.v2', now()),
        ('usr_lyon', 'lyon@example.com', 'sub-lyon', '2026-08-01.v2', now());
      INSERT INTO organization_memberships (user_id, organization_id) VALUES
        ('usr_admin', 'org_client_paris'),
        ('usr_operator', 'org_msp_default'),
        ('usr_alice', 'org_client_paris'),
        ('usr_bob', 'org_client_paris'),
        ('usr_author', 'org_client_paris'),
        ('usr_race', 'org_client_paris'),
        ('usr_auditor', 'org_client_paris'),
        ('usr_lyon', 'org_client_lyon');
      INSERT INTO site_memberships (user_id, site_id, organization_id, role) VALUES
        ('usr_admin', 'paris', 'org_client_paris', 'admin'),
        ('usr_operator', 'paris', 'org_msp_default', 'operator'),
        ('usr_alice', 'paris', 'org_client_paris', 'requester'),
        ('usr_bob', 'paris', 'org_client_paris', 'requester'),
        ('usr_author', 'paris', 'org_client_paris', 'requester'),
        ('usr_race', 'paris', 'org_client_paris', 'requester'),
        ('usr_auditor', 'paris', 'org_client_paris', 'auditor'),
        ('usr_lyon', 'lyon', 'org_client_lyon', 'admin');
      INSERT INTO msp_mandates
        (id, operator_organization_id, client_organization_id, site_id)
      VALUES ('mandate_paris', 'org_msp_default', 'org_client_paris', 'paris');
      INSERT INTO msp_mandate_assignments (mandate_id, user_id, organization_id)
        VALUES ('mandate_paris', 'usr_operator', 'org_msp_default');
      INSERT INTO console_sessions
        (token_hash, user_id, site_id, csrf_token, expires_at) VALUES
        ${Object.values(sessions).map(({ userId, token, csrf }) =>
          `('${createHash("sha256").update(token).digest("hex")}', '${userId}', 'paris', '${csrf}', now() + interval '1 day')`,
        ).join(",\n")};
      INSERT INTO runtime_config
        (id, name, base_url, encrypted_token, config_revision)
        VALUES ('default', 'Hermes test', 'http://runtime.invalid', 'cipher', 1);
      INSERT INTO console_setup
        (id, step, completed_at, runtime_verified_at, runtime_config_version)
        VALUES ('default', 'completed', now(), now(), 'database:1');

      INSERT INTO agents
        (id, site_id, owner_user_id, author_user_id, name, slug, instructions) VALUES
        ('agt_alice', 'paris', 'usr_alice', 'usr_operator', 'Alice agent', 'alice-agent', 'Alice'),
        ('agt_bob', 'paris', 'usr_bob', 'usr_operator', 'Bob agent', 'bob-agent', 'Bob');
      INSERT INTO connectors
        (id, site_id, owner_user_id, author_user_id, type, label, email, imap_host, encrypted_password) VALUES
        ('con_alice', 'paris', 'usr_alice', 'usr_operator', 'gmail_imap', 'Alice inbox', 'alice@example.com', 'imap.example.com', 'cipher'),
        ('con_bob', 'paris', 'usr_bob', 'usr_operator', 'outlook_imap', 'Bob inbox', 'bob@example.com', 'imap.example.com', 'cipher');
      INSERT INTO threads
        (id, site_id, owner_user_id, author_user_id, title, agent_id, agent_name, instructions, hermes_conversation) VALUES
        ('thr_alice', 'paris', 'usr_alice', 'usr_alice', 'Alice thread', 'agt_alice', 'Alice agent', 'Alice', 'console:alice'),
        ('thr_bob', 'paris', 'usr_bob', 'usr_bob', 'Bob thread', 'agt_bob', 'Bob agent', 'Bob', 'console:bob');
      INSERT INTO runs
        (id, site_id, owner_user_id, author_user_id, thread_id, input, status) VALUES
        ('run_alice', 'paris', 'usr_alice', 'usr_alice', 'thr_alice', 'Alice', 'completed'),
        ('run_bob', 'paris', 'usr_bob', 'usr_author', 'thr_bob', 'Bob', 'completed');
      INSERT INTO artifacts
        (id, site_id, owner_user_id, author_user_id, run_id, direction, filename, storage_path, size_bytes, checksum_sha256) VALUES
        ('file_alice', 'paris', 'usr_alice', 'usr_alice', 'run_alice', 'output', 'alice.txt', '/vault/alice.txt', 1, '00'),
        ('file_bob', 'paris', 'usr_bob', 'usr_operator', 'run_bob', 'output', 'bob.txt', '/vault/bob.txt', 1, '00');
    `);

    const server = (await import("@/index")).default;
    appFetch = server.fetch as AppFetch;
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
    delete process.env.CONSOLE_APP_ORIGIN;
    delete process.env.GOOGLE_ALLOWED_EMAILS;
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("requesters list only resources they own while operator keeps site visibility", async () => {
    const aliceAgents = await json<{ agents: Array<{ id: string }> }>(await appFetch(request("alice", "/api/agents")));
    const aliceConnectors = await json<{ connectors: Array<{ label: string }> }>(await appFetch(request("alice", "/api/connectors")));
    const aliceThreads = await json<{ threads: Array<{ id: string }> }>(await appFetch(request("alice", "/api/threads")));
    const aliceArtifacts = await json<{ artifacts: Array<{ id: string }> }>(await appFetch(request("alice", "/api/files")));
    const operatorThreads = await json<{ threads: Array<{ id: string }> }>(await appFetch(request("operator", "/api/threads")));

    expect(aliceAgents.agents.map(({ id }) => id)).toEqual(["agt_alice"]);
    expect(aliceConnectors.connectors.map(({ label }) => label)).toEqual(["Alice inbox"]);
    expect(aliceThreads.threads.map(({ id }) => id)).toEqual(["thr_alice"]);
    expect(aliceArtifacts.artifacts.map(({ id }) => id)).toEqual(["file_alice"]);
    expect(operatorThreads.threads.map(({ id }) => id).sort()).toEqual(["thr_alice", "thr_bob"]);
    expect((await appFetch(request("alice", "/api/threads/thr_alice/commands", {
      method: "POST",
      body: { message: "/help" },
    }))).status).toBe(200);
  });

  test("foreign-owned and random reads share the same audited 404", async () => {
    const foreign = await appFetch(request("alice", "/api/threads/thr_bob"));
    const random = await appFetch(request("alice", "/api/threads/thr_random"));
    expect(foreign.status).toBe(404);
    expect(random.status).toBe(404);
    expect(await foreign.json()).toEqual(await random.json());
    const foreignCommand = await appFetch(request("alice", "/api/threads/thr_bob/commands", {
      method: "POST",
      body: { message: "/help" },
    }));
    const randomCommand = await appFetch(request("alice", "/api/threads/thr_random/commands", {
      method: "POST",
      body: { message: "/help" },
    }));
    expect(foreignCommand.status).toBe(404);
    expect(await foreignCommand.json()).toEqual(await randomCommand.json());
    const foreignFile = await appFetch(request("alice", "/api/files/file_bob"));
    const randomFile = await appFetch(request("alice", "/api/files/file_random"));
    expect(foreignFile.status).toBe(404);
    expect(await foreignFile.json()).toEqual(await randomFile.json());
    const foreignEvents = await appFetch(request("alice", "/api/threads/thr_bob/events"));
    const randomEvents = await appFetch(request("alice", "/api/threads/thr_random/events"));
    expect(foreignEvents.status).toBe(404);
    expect(await foreignEvents.json()).toEqual(await randomEvents.json());

    const runsBefore = psql(`SELECT count(*) FROM runs;`);
    const foreignMessage = await appFetch(request("alice", "/api/threads/thr_bob/messages", {
      method: "POST",
      body: { message: "Must not run" },
    }));
    const randomMessage = await appFetch(request("alice", "/api/threads/thr_random/messages", {
      method: "POST",
      body: { message: "Must not run" },
    }));
    expect(foreignMessage.status).toBe(404);
    expect(await foreignMessage.json()).toEqual(await randomMessage.json());
    expect(psql(`SELECT count(*) FROM runs;`)).toBe(runsBefore);
    const artifactsBefore = psql(`SELECT count(*) FROM artifacts;`);
    const foreignUpload = await appFetch(uploadRequest("alice", "run_bob"));
    const randomUpload = await appFetch(uploadRequest("alice", "run_random"));
    expect(foreignUpload.status).toBe(404);
    expect(await foreignUpload.json()).toEqual(await randomUpload.json());
    expect(psql(`SELECT count(*) FROM artifacts;`)).toBe(artifactsBefore);
    expect(psql(`SELECT count(*) FROM audit_ledger_entries
      WHERE actor_user_id = 'usr_alice'
        AND action = 'thread.read'
        AND decision = 'denied'
        AND reason_code = 'RESOURCE_NOT_FOUND_OR_OUT_OF_SCOPE';`)).toBe("4");
  });

  test("new resources persist creator ownership and an atomic before/after audit", async () => {
    const agent = await appFetch(request("admin", "/api/agents", {
      method: "POST",
      body: { name: "Owned on create", instructions: "Creation ownership" },
    }));
    expect(agent.status).toBe(201);
    const connector = await appFetch(request("admin", "/api/connectors/pro_imap", {
      method: "PUT",
      body: {
        label: "Operator inbox",
        email: "operator@example.com",
        imapHost: "imap.example.com",
        imapPort: 993,
        password: "secret",
      },
    }));
    expect(connector.status).toBe(200);
    expect(psql(`SELECT owner_user_id || ':' || author_user_id FROM agents WHERE name = 'Owned on create';`)).toBe("usr_admin:usr_admin");
    expect(psql(`SELECT owner_user_id || ':' || author_user_id FROM connectors WHERE type = 'pro_imap';`)).toBe("usr_admin:usr_admin");
    expect(psql(`SELECT count(*) FROM audit_ledger_entries
      WHERE action = 'ownership.create'
        AND before_state = '{}'::jsonb
        AND after_state->>'ownerUserId' = actor_user_id
        AND after_state->>'authorUserId' = actor_user_id;`)).toBe("2");
  });

  test("runtime output artifacts keep ownership creation history", async () => {
    const outputDir = runOutputDir("run_bob");
    const operatorOutputDir = runOutputDir("run_operator_output");
    await mkdir(outputDir, { recursive: true });
    await mkdir(operatorOutputDir, { recursive: true });
    await writeFile(`${outputDir}/generated.txt`, "generated output");
    psql(`
      INSERT INTO threads
        (id, site_id, owner_user_id, author_user_id, title, agent_id, agent_name, instructions, hermes_conversation)
      VALUES
        ('thr_operator_output', 'paris', 'usr_bob', 'usr_operator', 'Operator output', 'agt_bob', 'Bob agent', 'Operator output', 'console:operator-output');
      INSERT INTO runs
        (id, site_id, owner_user_id, author_user_id, thread_id, input, status)
      VALUES
        ('run_operator_output', 'paris', 'usr_bob', 'usr_operator', 'thr_operator_output', 'Operator output', 'completed');
    `);
    await writeFile(`${operatorOutputDir}/operator-generated.txt`, "operator generated output");
    try {
      const created = await scanOutputArtifacts({ siteId: "paris" }, "run_bob");
      expect(created).toHaveLength(1);
      expect(psql(`SELECT count(*) FROM audit_ledger_entries
        WHERE action = 'ownership.create'
          AND resource_type = 'artifact'
          AND after_state->>'ownerUserId' = 'usr_bob'
          AND after_state->>'authorUserId' = 'usr_author'
          AND actor_user_id = 'usr_author'
          AND reason_code = 'RESOURCE_CREATED';`)).toBe("1");

      const operatorCreated = await scanOutputArtifacts({ siteId: "paris" }, "run_operator_output");
      expect(operatorCreated).toHaveLength(1);
      expect(psql(`SELECT actor_organization_id || ':' || client_organization_id || ':' || mandate_id
        FROM audit_ledger_entries
        WHERE action = 'ownership.create'
          AND resource_type = 'artifact'
          AND resource_id = '${operatorCreated[0]!.id}';`)).toBe(
        "org_msp_default:org_client_paris:mandate_paris",
      );

      // Output delivery is asynchronous: the immutable author may have been
      // revoked before Hermes writes its files. The active owner remains the
      // explicit accountable actor for this late delivery.
      psql(`DELETE FROM site_memberships WHERE site_id = 'paris' AND user_id = 'usr_author';`);
      await writeFile(`${outputDir}/after-revocation.txt`, "late output");
      await scanOutputArtifacts({ siteId: "paris" }, "run_bob");
      expect(psql(`SELECT count(*) FROM audit_ledger_entries
        WHERE action = 'ownership.create'
          AND resource_type = 'artifact'
          AND after_state->>'authorUserId' = 'usr_author'
          AND actor_user_id = 'usr_bob'
          AND reason_code = 'RESOURCE_OUTPUT_DELIVERED_AFTER_AUTHOR_REVOCATION';`)).toBe("1");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
      await rm(operatorOutputDir, { recursive: true, force: true });
    }
  });

  test("artifact audit resolves a concurrent author role change inside its transaction", async () => {
    psql(`
      INSERT INTO console_users (id, email, google_subject)
        VALUES ('usr_artifact_race', 'artifact-race@example.com', 'sub-artifact-race');
      INSERT INTO organization_memberships (user_id, organization_id)
        VALUES ('usr_artifact_race', 'org_client_paris');
      INSERT INTO site_memberships (user_id, site_id, organization_id, role)
        VALUES ('usr_artifact_race', 'paris', 'org_client_paris', 'requester');
      INSERT INTO threads
        (id, site_id, owner_user_id, author_user_id, title, agent_id, agent_name, instructions, hermes_conversation)
      VALUES
        ('thr_artifact_race', 'paris', 'usr_bob', 'usr_artifact_race', 'Artifact race', 'agt_bob', 'Bob agent', 'Bob', 'console:artifact-race');
      INSERT INTO runs
        (id, site_id, owner_user_id, author_user_id, thread_id, input, status)
      VALUES
        ('run_artifact_race', 'paris', 'usr_bob', 'usr_artifact_race', 'thr_artifact_race', 'Race', 'completed');
    `);
    const outputDir = runOutputDir("run_artifact_race");
    await mkdir(outputDir, { recursive: true });
    await writeFile(`${outputDir}/race.txt`, "race output");
    const roleChange = spawnPsql(`
      BEGIN;
      UPDATE site_memberships SET role = 'auditor'
        WHERE site_id = 'paris' AND user_id = 'usr_artifact_race';
      SELECT pg_sleep(1);
      COMMIT;
    `);
    await Bun.sleep(150);
    try {
      const created = await scanOutputArtifacts({ siteId: "paris" }, "run_artifact_race");
      expect(created).toHaveLength(1);
      await Promise.all([
        roleChange.exited,
        new Response(roleChange.stdout).text(),
        new Response(roleChange.stderr).text(),
      ]);
      expect(psql(`SELECT actor_role FROM audit_ledger_entries
        WHERE action = 'ownership.create'
          AND resource_type = 'artifact'
          AND after_state->>'authorUserId' = 'usr_artifact_race'
        ORDER BY sequence DESC LIMIT 1;`)).toBe("auditor");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("thread transfer is atomic, audited, and revokes the previous requester", async () => {
    const operatorDenied = await appFetch(request("operator", "/api/ownership/thread/thr_alice", {
      method: "PUT",
      body: { ownerUserId: "usr_bob" },
    }));
    expect(operatorDenied.status).toBe(404);

    const transfer = await appFetch(request("admin", "/api/ownership/thread/thr_alice", {
      method: "PUT",
      body: { ownerUserId: "usr_bob" },
    }));
    expect(transfer.status).toBe(200);
    expect(psql(`SELECT owner_user_id FROM threads WHERE id = 'thr_alice';`)).toBe("usr_bob");
    expect(psql(`SELECT owner_user_id FROM runs WHERE id = 'run_alice';`)).toBe("usr_bob");
    expect(psql(`SELECT owner_user_id FROM artifacts WHERE id = 'file_alice';`)).toBe("usr_bob");
    expect(psql(`SELECT author_user_id FROM threads WHERE id = 'thr_alice';`)).toBe("usr_alice");
    expect(psql(`SELECT jsonb_build_object(
      'before', before_state->>'ownerUserId',
      'after', after_state->>'ownerUserId'
    )::text FROM audit_ledger_entries
      WHERE action = 'ownership.transfer' AND resource_id = 'thr_alice';`)).toBe(
      '{"after": "usr_bob", "before": "usr_alice"}',
    );

    expect((await appFetch(request("alice", "/api/threads/thr_alice"))).status).toBe(404);
    expect((await appFetch(request("bob", "/api/threads/thr_alice"))).status).toBe(200);
  });

  test("invalid targets and unavailable audit leave ownership unchanged", async () => {
    const ineligibleTarget = await appFetch(request("admin", "/api/ownership/agent/agt_bob", {
      method: "PUT",
      body: { ownerUserId: "usr_auditor" },
    }));
    expect(ineligibleTarget.status).toBe(404);
    const crossSiteTarget = await appFetch(request("admin", "/api/ownership/agent/agt_bob", {
      method: "PUT",
      body: { ownerUserId: "usr_lyon" },
    }));
    expect(crossSiteTarget.status).toBe(404);
    expect(psql(`SELECT owner_user_id FROM agents WHERE id = 'agt_bob';`)).toBe("usr_bob");

    const hmacKey = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    try {
      const unavailableAudit = await appFetch(request("admin", "/api/ownership/agent/agt_bob", {
        method: "PUT",
        body: { ownerUserId: "usr_alice" },
      }));
      expect(unavailableAudit.status).toBe(503);
    } finally {
      process.env.APP_ENCRYPTION_KEY = hmacKey;
    }
    expect(psql(`SELECT owner_user_id FROM agents WHERE id = 'agt_bob';`)).toBe("usr_bob");

    const outputDir = runOutputDir("run_bob");
    const privateOutputDir = runArtifactOutputDir("run_bob");
    await mkdir(outputDir, { recursive: true });
    await mkdir(privateOutputDir, { recursive: true });
    await writeFile(`${outputDir}/audit-fail.txt`, "must be cleaned");
    const artifactsBefore = psql(`SELECT count(*) FROM artifacts;`);
    const privateBefore = await readdir(privateOutputDir);
    const auditKey = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    try {
      await expect(scanOutputArtifacts({ siteId: "paris" }, "run_bob")).rejects.toThrow();
    } finally {
      process.env.APP_ENCRYPTION_KEY = auditKey;
      await rm(`${outputDir}/audit-fail.txt`, { force: true });
    }
    expect(psql(`SELECT count(*) FROM artifacts;`)).toBe(artifactsBefore);
    expect(await readdir(privateOutputDir)).toEqual(privateBefore);
  });

  test("an owner membership cannot be revoked before its resources are transferred", async () => {
    const response = await appFetch(request("admin", "/api/site/memberships/usr_alice", {
      method: "PUT",
      body: { role: "auditor" },
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "OWNED_RESOURCES_REQUIRE_TRANSFER",
        message: "Transférez les ressources possédées avant de modifier ce rôle.",
      },
    });
    expect(psql(`SELECT role FROM site_memberships WHERE site_id = 'paris' AND user_id = 'usr_alice';`)).toBe("requester");
    expect(() => psql(`UPDATE site_memberships SET role = 'auditor' WHERE site_id = 'paris' AND user_id = 'usr_alice';`)).toThrow();
  });

  test("database serializes concurrent owner creation and role degradation", async () => {
    const roleChange = spawnPsql(`
      BEGIN;
      UPDATE site_memberships SET role = 'auditor'
        WHERE site_id = 'paris' AND user_id = 'usr_race';
      SELECT pg_sleep(1);
      COMMIT;
    `);
    await Bun.sleep(150);
    const resourceInsert = spawnPsql(`
      BEGIN;
      INSERT INTO agents
        (id, site_id, owner_user_id, author_user_id, name, slug, instructions)
      VALUES ('agt_race', 'paris', 'usr_race', 'usr_admin', 'Race', 'race-agent', 'Race');
      COMMIT;
    `);
    await Promise.all([
      roleChange.exited,
      resourceInsert.exited,
      new Response(roleChange.stdout).text(),
      new Response(resourceInsert.stdout).text(),
    ]);
    expect(await resourceInsert.exited).not.toBe(0);
    expect(psql(`SELECT role FROM site_memberships WHERE site_id = 'paris' AND user_id = 'usr_race';`)).toBe("auditor");
    expect(psql(`SELECT count(*) FROM agents WHERE id = 'agt_race';`)).toBe("0");
  });

  test("database rejects null, non-member, and aggregate owner divergence", () => {
    expect(() => psql(`UPDATE agents SET owner_user_id = NULL WHERE id = 'agt_alice';`)).toThrow();
    expect(() => psql(`UPDATE agents SET owner_user_id = 'usr_lyon' WHERE id = 'agt_alice';`)).toThrow();
    expect(() => psql(`UPDATE runs SET owner_user_id = 'usr_alice' WHERE id = 'run_alice';`)).toThrow();
    expect(() => psql(`UPDATE threads SET author_user_id = 'usr_admin' WHERE id = 'thr_alice';`)).toThrow();
    expect(() => psql(`UPDATE connectors SET site_id = 'lyon' WHERE id = 'con_alice';`)).toThrow();
  });
});
