import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-site-roles-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };
const artifactRoot = await mkdtemp(join(tmpdir(), "hermes-site-roles-"));

const sessions = {
  admin: { userId: "usr_admin", token: "token-admin", csrf: "csrf-admin" },
  operator: { userId: "usr_operator", token: "token-operator", csrf: "csrf-operator" },
  requester: { userId: "usr_requester", token: "token-requester", csrf: "csrf-requester" },
  approver: { userId: "usr_approver", token: "token-approver", csrf: "csrf-approver" },
  auditor: { userId: "usr_auditor", token: "token-auditor", csrf: "csrf-auditor" },
} as const;

type Role = keyof typeof sessions;
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

function psql(statement: string, database = "site_roles") {
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

function applyMigrations() {
  for (const entry of journal.entries.filter(({ idx }) => idx <= 20)) {
    psql(readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

async function waitForFinalPostgres() {
  const initCompleteMarker = "PostgreSQL init process complete; ready for start up.";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", containerName], {
      encoding: "utf8",
    });
    const output = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
    const ready = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    ).status === 0;
    if (output.includes(initCompleteMarker) && ready) return;
    await Bun.sleep(250);
  }
  throw new Error(
    "PostgreSQL final n’est pas prêt après 15 secondes (initialisation temporaire ou serveur final indisponible).",
  );
}

function authenticatedRequest(
  role: Role,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const session = sessions[role];
  const headers = new Headers(options.headers);
  headers.set("cookie", `hc_session=${session.token}`);
  if (options.method && !["GET", "HEAD"].includes(options.method)) {
    headers.set("x-csrf-token", session.csrf);
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

async function payload(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function businessSnapshot() {
  return psql(`SELECT jsonb_build_object(
    'agents', (SELECT count(*) FROM agents),
    'threads', (SELECT count(*) FROM threads),
    'messages', (SELECT count(*) FROM messages),
    'artifacts', (SELECT count(*) FROM artifacts),
    'runs', (SELECT jsonb_object_agg(id, status ORDER BY id) FROM runs),
    'memberships', (
      SELECT jsonb_object_agg(user_id, role ORDER BY user_id)
      FROM site_memberships WHERE site_id = 'paris'
    )
  )::text;`);
}

function installationSnapshot() {
  return psql(`SELECT jsonb_build_object(
    'runtime', (
      SELECT jsonb_build_object(
        'base_url', base_url,
        'encrypted_token', encrypted_token,
        'config_revision', config_revision
      ) FROM runtime_config WHERE id = 'default'
    ),
    'setup', (
      SELECT jsonb_build_object(
        'step', step,
        'completed_at', completed_at,
        'runtime_verified_at', runtime_verified_at,
        'runtime_config_version', runtime_config_version
      ) FROM console_setup WHERE id = 'default'
    )
  )::text;`);
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("site role authorization through Hono and PostgreSQL", () => {
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
    await waitForFinalPostgres();
    psql('CREATE DATABASE "site_roles";', "postgres");
    applyMigrations();
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);

    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/site_roles`;
    process.env.APP_ENCRYPTION_KEY = "p-int-site-role-authorization";
    process.env.HERMES_CONSOLE_ARTIFACTS_DIR = artifactRoot;
    process.env.GOOGLE_ALLOWED_EMAILS = Object.keys(sessions)
      .map((role) => `${role}@example.com`)
      .concat("target@example.com", "lyon@example.com")
      .join(",");

    const { encryptSecret } = await import("@/lib/crypto");
    const encryptedRuntimeToken = encryptSecret("runtime-token");
    psql(`
      INSERT INTO sites (id, name, slug) VALUES
        ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon');
      INSERT INTO console_users
        (id, email, google_subject, ai_disclosure_version, ai_disclosure_accepted_at) VALUES
        ('usr_admin', 'admin@example.com', 'sub-admin', '2026-08-01.v2', now()),
        ('usr_operator', 'operator@example.com', 'sub-operator', '2026-08-01.v2', now()),
        ('usr_requester', 'requester@example.com', 'sub-requester', '2026-08-01.v2', now()),
        ('usr_approver', 'approver@example.com', 'sub-approver', '2026-08-01.v2', now()),
        ('usr_auditor', 'auditor@example.com', 'sub-auditor', '2026-08-01.v2', now()),
        ('usr_target', 'target@example.com', 'sub-target', '2026-08-01.v2', now()),
        ('usr_lyon', 'lyon@example.com', 'sub-lyon', '2026-08-01.v2', now());
      INSERT INTO site_memberships (user_id, site_id, role) VALUES
        ('usr_admin', 'paris', 'admin'),
        ('usr_operator', 'paris', 'operator'),
        ('usr_requester', 'paris', 'requester'),
        ('usr_approver', 'paris', 'approver'),
        ('usr_auditor', 'paris', 'auditor'),
        ('usr_target', 'paris', 'operator'),
        ('usr_lyon', 'lyon', 'admin');
      INSERT INTO console_sessions
        (token_hash, user_id, site_id, csrf_token, expires_at) VALUES
        ${Object.values(sessions)
          .map(
            ({ userId, token, csrf }) =>
              `('${createHash("sha256").update(token).digest("hex")}', ${sqlString(userId)}, 'paris', ${sqlString(csrf)}, now() + interval '1 day')`,
          )
          .join(",\n")};
      INSERT INTO runtime_config
        (id, name, base_url, encrypted_token, config_revision)
        VALUES ('default', 'Hermes test', 'http://runtime.invalid', ${sqlString(encryptedRuntimeToken)}, 1);
      INSERT INTO console_setup
        (id, step, completed_at, runtime_verified_at, runtime_config_version)
        VALUES ('default', 'completed', now(), now(), 'database:1');
    `);

    const server = (await import("@/index")).default;
    appFetch = server.fetch as AppFetch;
    await Bun.sleep(100);

    psql(`
      INSERT INTO agents (id, site_id, name, slug, instructions) VALUES
        ('agt_paris', 'paris', 'Paris agent', 'paris-agent', 'Paris'),
        ('agt_lyon', 'lyon', 'Lyon agent', 'lyon-agent', 'Lyon');
      INSERT INTO threads
        (id, site_id, title, agent_id, agent_name, instructions, hermes_conversation) VALUES
        ('thr_shared', 'paris', 'Shared', 'agt_paris', 'Paris agent', 'Paris', 'console:shared'),
        ('thr_operator', 'paris', 'Operator run', 'agt_paris', 'Paris agent', 'Paris', 'console:operator'),
        ('thr_approval', 'paris', 'Approval run', 'agt_paris', 'Paris agent', 'Paris', 'console:approval');
      INSERT INTO runs
        (id, site_id, thread_id, input, status, hermes_response_id) VALUES
        ('run_operator', 'paris', 'thr_operator', 'Cancel me', 'running', NULL),
        ('run_approval', 'paris', 'thr_approval', 'Approve me', 'awaiting_approval', 'hermes-approval'),
        ('run_denied', 'paris', 'thr_shared', 'Do not mutate', 'running', NULL);
    `);
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
    delete process.env.HERMES_CONSOLE_ARTIFACTS_DIR;
    delete process.env.GOOGLE_ALLOWED_EMAILS;
    await rm(artifactRoot, { recursive: true, force: true });
    spawnSync("docker", ["rm", "--force", containerName], { stdio: "ignore" });
  });

  test("forbidden role actions share one response, leave state unchanged, and are attributed", async () => {
    const before = businessSnapshot();
    const deniedRequests = [
      authenticatedRequest("requester", "/api/agents", {
        headers: { "x-site-role": "admin" },
      }),
      authenticatedRequest("requester", "/api/threads/thr_shared/messages", {
        method: "POST",
        body: { message: "forged request" },
      }),
      authenticatedRequest("requester", "/api/files", {
        method: "POST",
        body: { runId: "run_denied" },
      }),
      authenticatedRequest("requester", "/api/site/memberships/usr_requester", {
        method: "PUT",
        body: { role: "admin" },
        headers: { "x-site-role": "admin" },
      }),
      authenticatedRequest("operator", "/api/agents", {
        method: "POST",
        body: { name: "Forbidden", instructions: "No" },
      }),
      authenticatedRequest("operator", "/api/runs/run_approval/approval", {
        method: "POST",
        body: { choice: "once" },
      }),
      authenticatedRequest("approver", "/api/runs/run_denied/cancel", {
        method: "POST",
      }),
      authenticatedRequest("auditor", "/api/runs/run_approval/approval", {
        method: "POST",
        body: { choice: "once" },
      }),
      authenticatedRequest("operator", "/api/threads/thr_shared/commands", {
        method: "POST",
        body: { message: "/agent create Forged | Must not exist" },
      }),
      authenticatedRequest("approver", "/api/threads/thr_shared/commands", {
        method: "POST",
        body: { message: "/agent switch paris-agent" },
      }),
      authenticatedRequest("auditor", "/api/threads/thr_shared/commands", {
        method: "POST",
        body: { message: "/model gpt-5.6" },
      }),
    ];
    const responses = await Promise.all(deniedRequests.map((request) => appFetch(request)));
    const bodies = await Promise.all(responses.map(payload));
    for (const response of responses) expect(response.status).toBe(403);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({
      error: {
        code: "SITE_PERMISSION_DENIED",
        message: "Cette action n’est pas autorisée pour ce rôle.",
      },
    });
    expect(businessSnapshot()).toBe(before);
    expect(
      psql(`SELECT count(*) FROM audit_ledger_entries
        WHERE target_site_id = 'paris'
          AND decision = 'denied'
          AND reason_code = 'ROLE_PERMISSION_DENIED';`),
    ).toBe("11");
    expect(
      psql(`SELECT string_agg(DISTINCT actor_role, ',' ORDER BY actor_role)
        FROM audit_ledger_entries
        WHERE target_site_id = 'paris' AND reason_code = 'ROLE_PERMISSION_DENIED';`),
    ).toBe("approver,auditor,operator,requester");
  });

  test("self role changes and persistent approvals are denied before effect and audited", async () => {
    const before = businessSnapshot();
    const selfChange = await appFetch(
      authenticatedRequest("admin", "/api/site/memberships/usr_admin", {
        method: "PUT",
        body: { role: "operator" },
      }),
    );
    expect(selfChange.status).toBe(403);
    expect(await payload(selfChange)).toEqual({
      error: {
        code: "SELF_ROLE_CHANGE_FORBIDDEN",
        message: "Un membre ne peut pas modifier son propre rôle.",
      },
    });

    for (const choice of ["session", "always"] as const) {
      const response = await appFetch(
        authenticatedRequest("approver", "/api/runs/run_approval/approval", {
          method: "POST",
          body: { choice },
        }),
      );
      expect(response.status).toBe(403);
      expect(await payload(response)).toEqual({
        error: {
          code: "PERSISTENT_APPROVAL_UNSUPPORTED",
          message: "Les décisions persistantes ne sont pas disponibles.",
        },
      });
    }

    expect(businessSnapshot()).toBe(before);
    expect(
      psql(`SELECT reason_code || ':' || count(*)
        FROM audit_ledger_entries
        WHERE reason_code IN ('SELF_ROLE_CHANGE_FORBIDDEN', 'PERSISTENT_APPROVAL_UNSUPPORTED')
        GROUP BY reason_code ORDER BY reason_code;`),
    ).toBe("PERSISTENT_APPROVAL_UNSUPPORTED:2\nSELF_ROLE_CHANGE_FORBIDDEN:1");
  });

  test("all site roles are denied before every installation handler while setup consent stays self-service", async () => {
    const beforeBusiness = businessSnapshot();
    const beforeInstallation = installationSnapshot();
    const installationRequests = [
      ["GET", "/api/runtime"],
      ["PUT", "/api/runtime"],
      ["GET", "/api/runtime/models"],
      ["PUT", "/api/runtime/models"],
      ["GET", "/api/runtime/probe"],
      ["POST", "/api/runtime/restart"],
      ["GET", "/api/runtime/ssh-hosts"],
      ["POST", "/api/runtime/test"],
      ["POST", "/api/runtime/providers/openai/credentials"],
      ["POST", "/api/runtime/providers/openai-codex/auth"],
      ["GET", "/api/runtime/providers/openai-codex/auth"],
      ["DELETE", "/api/runtime/providers/openai-codex/auth"],
    ] as const;
    const roles = ["requester", "operator", "admin"] as const;
    const responses: Response[] = [];
    for (const role of roles) {
      for (const [method, path] of installationRequests) {
        responses.push(
          await appFetch(
            authenticatedRequest(role, path, {
              method,
              ...(method === "GET" ? {} : { body: { forged: true } }),
            }),
          ),
        );
      }
    }
    const bodies = await Promise.all(responses.map(payload));
    for (const response of responses) expect(response.status).toBe(403);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({
      error: {
        code: "INSTALLATION_ADMIN_REQUIRED",
        message: "Une autorisation d’administration de l’installation est requise.",
      },
    });
    expect(businessSnapshot()).toBe(beforeBusiness);
    expect(installationSnapshot()).toBe(beforeInstallation);
    expect(
      psql(`SELECT count(*) FROM audit_ledger_entries
        WHERE action = 'installation.access'
          AND reason_code = 'INSTALLATION_ADMIN_REQUIRED';`),
    ).toBe(String(roles.length * installationRequests.length));

    const setupRead = await appFetch(authenticatedRequest("requester", "/api/setup"));
    expect(setupRead.status).toBe(200);
    const consent = await appFetch(
      authenticatedRequest("requester", "/api/setup", {
        method: "POST",
        body: { consentVersion: "2026-08-01.v2" },
      }),
    );
    expect(consent.status).toBe(200);

    for (const role of roles) {
      const step = await appFetch(
        authenticatedRequest(role, "/api/setup", {
          method: "POST",
          body: { step: "agent" },
        }),
      );
      expect(step.status).toBe(403);
      expect(await payload(step)).toEqual(bodies[0]);
    }
    expect(installationSnapshot()).toBe(beforeInstallation);
    expect(
      psql(`SELECT count(*) FROM audit_ledger_entries
        WHERE action = 'installation.access'
          AND resource_id = 'POST /api/setup'
          AND reason_code = 'INSTALLATION_ADMIN_REQUIRED';`),
    ).toBe(String(roles.length));
  });

  test("authorized roles execute only their current responsibilities", async () => {
    const adminMemberships = await appFetch(
      authenticatedRequest("admin", "/api/site/memberships"),
    );
    expect(adminMemberships.status).toBe(200);
    const membershipBody = (await adminMemberships.json()) as {
      memberships: Array<{ userId: string }>;
    };
    expect(membershipBody.memberships.map(({ userId }) => userId)).not.toContain("usr_lyon");

    const createdAgent = await appFetch(
      authenticatedRequest("admin", "/api/agents", {
        method: "POST",
        body: { name: "RBAC agent", instructions: "Role test" },
      }),
    );
    expect(createdAgent.status).toBe(201);

    const originalFetch = globalThis.fetch;
    const runtimeCalls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      runtimeCalls.push(input instanceof Request ? input.url : String(input));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    try {
      const requester = await appFetch(
        authenticatedRequest("requester", "/api/threads", {
          method: "POST",
          body: { message: "Create my request" },
        }),
      );
      expect(requester.status).toBe(202);

      const approved = await appFetch(
        authenticatedRequest("approver", "/api/runs/run_approval/approval", {
          method: "POST",
          body: { choice: "once" },
        }),
      );
      expect(approved.status).toBe(200);
      await Bun.sleep(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(runtimeCalls.some((url) => url.endsWith("/v1/runs/hermes-approval/approval"))).toBe(true);

    const cancelled = await appFetch(
      authenticatedRequest("operator", "/api/runs/run_operator/cancel", {
        method: "POST",
      }),
    );
    expect(cancelled.status).toBe(202);
    expect(psql(`SELECT status FROM runs WHERE id = 'run_operator';`)).toBe("cancelled");

    const audit = await appFetch(authenticatedRequest("auditor", "/api/audit?limit=200"));
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as {
      entries: Array<{ targetSiteId: string }>;
    };
    expect(auditBody.entries.length).toBeGreaterThan(0);
    expect(new Set(auditBody.entries.map(({ targetSiteId }) => targetSiteId))).toEqual(
      new Set(["paris"]),
    );
  });

  test("the same session reloads an admin-assigned role and ignores forged role headers", async () => {
    const denied = await appFetch(
      authenticatedRequest("operator", "/api/audit", {
        headers: { "x-site-role": "auditor" },
      }),
    );
    expect(denied.status).toBe(403);

    const assigned = await appFetch(
      authenticatedRequest("admin", "/api/site/memberships/usr_operator", {
        method: "PUT",
        body: { role: "auditor" },
      }),
    );
    expect(assigned.status).toBe(200);
    expect(await payload(assigned)).toMatchObject({
      membership: { userId: "usr_operator", siteId: "paris", role: "auditor" },
    });

    const allowed = await appFetch(authenticatedRequest("operator", "/api/audit"));
    expect(allowed.status).toBe(200);
    expect(
      psql(`SELECT role FROM site_memberships
        WHERE site_id = 'paris' AND user_id = 'usr_operator';`),
    ).toBe("auditor");
    expect(
      psql(`SELECT actor_role || ':' || decision || ':' || reason_code
        FROM audit_ledger_entries
        WHERE action = 'membership.manage' AND resource_id = 'usr_operator'
        ORDER BY sequence DESC LIMIT 1;`),
    ).toBe("admin:allowed:SITE_ROLE_ASSIGNED");
  });

  test("membership role input cannot forge a site scope", async () => {
    const before = businessSnapshot();
    const response = await appFetch(
      authenticatedRequest("admin", "/api/site/memberships/usr_target", {
        method: "PUT",
        body: { role: "auditor", siteId: "lyon" },
      }),
    );
    expect(response.status).toBe(400);
    expect(await payload(response)).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(businessSnapshot()).toBe(before);
  });

  test("site roles cannot reach installation-global runtime mutations", async () => {
    const before = businessSnapshot();
    for (const role of ["admin", "operator", "requester", "approver", "auditor"] as const) {
      const response = await appFetch(
        authenticatedRequest(role, "/api/runtime", {
          method: "PUT",
          body: {
            baseUrl: "https://attacker.invalid/runtime",
            token: "forged-runtime-token",
          },
        }),
      );
      expect(response.status).toBe(403);
      expect(await payload(response)).toEqual({
        error: {
          code: "INSTALLATION_ADMIN_REQUIRED",
          message: "Une autorisation d’administration de l’installation est requise.",
        },
      });
    }
    expect(businessSnapshot()).toBe(before);
  });
});
