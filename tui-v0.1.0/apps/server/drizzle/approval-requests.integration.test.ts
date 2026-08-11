import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getDatabase } from "@/db/client";
import type { SiteRequestContext } from "@/modules/auth/service";
import {
  claimApprovalRequestForScope,
  persistApprovalRequest,
  releaseApprovalRequestForScope,
  resolveApprovalRequestForScope,
} from "@/modules/runs/approval-requests";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-approval-cas-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };

const SITE_A = "site_approval_cas_a";
const SITE_B = "site_approval_cas_b";
const ORG_A = "org_approval_cas_a";
const ORG_B = "org_approval_cas_b";
const USER_A = "usr_approval_cas_a";
const USER_B = "usr_approval_cas_b";
const THREAD_A = "thread_approval_cas_a";
const RUN_A = "run_approval_cas_a";

const contextA: SiteRequestContext = {
  siteId: SITE_A,
  userId: USER_A,
  role: "approver",
  actorOrganizationId: ORG_A,
  clientOrganizationId: ORG_A,
  mandateId: null,
  mandateProjectId: null,
  correlationId: "corr-approval-cas-a",
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

function psql(statement: string, database = "approval_cas") {
  return docker([
    "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-Atq",
  ], statement);
}

function applyMigrations() {
  for (const entry of journal.entries) {
    psql(readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
  }
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync("docker", ["exec", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;"], {
      stdio: "ignore",
    }).status === 0) return;
    await Bun.sleep(250);
  }
  throw new Error("PostgreSQL approval CAS indisponible après 15 secondes.");
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("persisted approval request CAS on PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName,
      "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    await waitForPostgres();
    psql('CREATE DATABASE "approval_cas";', "postgres");
    applyMigrations();
    const binding = docker(["port", containerName, "5432/tcp"]);
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/approval_cas`;
    process.env.APP_ENCRYPTION_KEY = "p-int-approval-cas";
    psql(`
      INSERT INTO organizations (id, name, slug, kind) VALUES
        ('${ORG_A}', 'Approval CAS A', 'approval-cas-a', 'client'),
        ('${ORG_B}', 'Approval CAS B', 'approval-cas-b', 'client');
      INSERT INTO sites (id, client_organization_id, name, slug) VALUES
        ('${SITE_A}', '${ORG_A}', 'Approval CAS A', 'approval-cas-a'),
        ('${SITE_B}', '${ORG_B}', 'Approval CAS B', 'approval-cas-b');
      INSERT INTO console_users (id, email, google_subject) VALUES
        ('${USER_A}', 'approval-cas-a@example.invalid', 'approval-cas-a-subject'),
        ('${USER_B}', 'approval-cas-b@example.invalid', 'approval-cas-b-subject');
      INSERT INTO organization_memberships (user_id, organization_id) VALUES
        ('${USER_A}', '${ORG_A}'), ('${USER_B}', '${ORG_B}');
      INSERT INTO site_memberships (user_id, site_id, organization_id, role) VALUES
        ('${USER_A}', '${SITE_A}', '${ORG_A}', 'requester'),
        ('${USER_B}', '${SITE_B}', '${ORG_B}', 'requester');
      INSERT INTO threads
        (id, site_id, owner_user_id, author_user_id, title, agent_name, instructions,
         model, source, hermes_conversation)
      VALUES
        ('${THREAD_A}', '${SITE_A}', '${USER_A}', '${USER_A}', 'Approval CAS', 'agent-cas',
         'approval CAS fixture', 'hermes-agent', 'chat', 'approval-cas:thread');
      INSERT INTO runs
        (id, site_id, owner_user_id, author_user_id, thread_id, input, status,
         hermes_response_id)
      VALUES
        ('${RUN_A}', '${SITE_A}', '${USER_A}', '${USER_A}', '${THREAD_A}',
         'approval CAS fixture', 'awaiting_approval', 'hermes-cas-run');
    `);
  }, 30_000);

  beforeEach(() => {
    psql(`TRUNCATE approval_requests RESTART IDENTITY; UPDATE runs SET status = 'awaiting_approval', approval_claim_id = NULL WHERE id = '${RUN_A}';`);
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

  test("persists scope, claims once, resolves once, and rejects replay/cross-site", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const database = getDatabase();
    await persistApprovalRequest(contextA, {
      runId: RUN_A,
      hermesRunId: "hermes-cas-run",
      approvalRequestId: "approval_7",
    }, { database, now: () => now });
    const scope = {
      ...contextA,
      runId: RUN_A,
      hermesRunId: "hermes-cas-run",
      approvalRequestId: "approval_7",
    };
    const claimed = await claimApprovalRequestForScope(scope, { database, now: () => now });
    expect(claimed.claimState).toBe("claimed");
    expect(claimed.nonce).toBeString();
    await expect(claimApprovalRequestForScope(scope, { database, now: () => now }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUEST_CLAIM_UNAVAILABLE", status: 409 });
    const resolved = await resolveApprovalRequestForScope(scope, "once", { database, now: () => now });
    expect(resolved).toMatchObject({ claimState: "resolved", outcome: "once" });
    await expect(resolveApprovalRequestForScope(scope, "once", { database, now: () => now }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUEST_OUTCOME_CONFLICT", status: 409 });

    const foreignScope = {
      ...scope,
      siteId: SITE_B,
      userId: USER_B,
      actorOrganizationId: ORG_B,
      clientOrganizationId: ORG_B,
    };
    await expect(claimApprovalRequestForScope(foreignScope, { database, now: () => now }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUEST_NOT_FOUND", status: 404 });
  });

  test("allows only one concurrent claim and releases a definitive remote refusal", async () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const database = getDatabase();
    await persistApprovalRequest(contextA, {
      runId: RUN_A,
      hermesRunId: "hermes-cas-run",
      approvalRequestId: "approval_race",
    }, { database, now: () => now });
    const scope = {
      ...contextA,
      runId: RUN_A,
      hermesRunId: "hermes-cas-run",
      approvalRequestId: "approval_race",
    };
    const results = await Promise.allSettled([
      claimApprovalRequestForScope(scope, { database, now: () => now }),
      claimApprovalRequestForScope(scope, { database, now: () => now }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const released = await releaseApprovalRequestForScope(scope, { database, now: () => now });
    expect(released.claimState).toBe("pending");
    const reclaimed = await claimApprovalRequestForScope(scope, { database, now: () => now });
    expect(reclaimed.claimState).toBe("claimed");
  });

  test("expires a pending request before it can be claimed", async () => {
    const issuedAt = new Date("2026-08-01T12:00:00.000Z");
    const expiredAt = new Date("2026-08-01T12:06:00.000Z");
    const database = getDatabase();
    await persistApprovalRequest(contextA, {
      runId: RUN_A,
      hermesRunId: "hermes-cas-run",
      approvalRequestId: "approval_expired",
      ttlSeconds: 30,
    }, { database, now: () => issuedAt });
    const scope = {
      ...contextA,
      runId: RUN_A,
      hermesRunId: "hermes-cas-run",
      approvalRequestId: "approval_expired",
    };
    await expect(claimApprovalRequestForScope(scope, { database, now: () => expiredAt }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUEST_EXPIRED", status: 409 });
    expect(psql("SELECT claim_state FROM approval_requests WHERE approval_request_id = 'approval_expired';")).toBe("expired");
  });
});
