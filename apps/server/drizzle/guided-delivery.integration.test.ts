import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GuidedTaskDraft } from "@console/core/modules/guided-task/spec";
import type { SiteRequestContext } from "@/modules/auth/service";
import {
  createGuidedTask,
  createGuidedTaskRevision,
  decideGuidedTask,
  getGuidedTask,
  listGuidedTaskSummaries,
} from "@/modules/guided-task/repository";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-guided-delivery-${randomUUID().slice(0, 12)}`;
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as { entries: Array<{ tag: string }> };

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

function psql(statement: string, database = "guided_delivery") {
  return docker([
    "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-Atq",
  ], statement).stdout.trim();
}

function context(
  siteId: string,
  userId: string,
  role: SiteRequestContext["role"],
  organizationId: string,
): SiteRequestContext {
  return {
    siteId,
    userId,
    role,
    actorOrganizationId: organizationId,
    clientOrganizationId: organizationId,
    mandateId: null,
    mandateProjectId: null,
    correlationId: `corr-${siteId}-${role}`,
  };
}

const requester = context("site_a", "user_requester", "requester", "org_a");
const approver = context("site_a", "user_approver", "approver", "org_a");
const foreignAdmin = context("site_b", "user_foreign", "admin", "org_b");

const draft: GuidedTaskDraft = {
  intent: "feature",
  objective: "Ajouter une preuve persistante au parcours guidé",
  audience: "Demandeur métier",
  expectedResult: "La tâche revient après fermeture avec la même révision",
  exclusions: "Ne pas modifier Hermes Agent",
  example: "Tâche guidée TASK-42",
  touchesAuthentication: false,
  deletesData: false,
  allowsDependencies: true,
  changesDatabase: false,
  touchesPayments: false,
  touchesInfrastructure: false,
};

const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker("guided delivery persistence and isolation on PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run", "--detach", "--rm", "--name", containerName,
      "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", POSTGRES_IMAGE,
    ]);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (docker([
        "exec", containerName, "psql", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;",
      ], undefined, true).status === 0) break;
      await Bun.sleep(250);
    }
    psql('CREATE DATABASE "guided_delivery";', "postgres");
    for (const entry of journal.entries) {
      psql(readFileSync(join(import.meta.dir, `${entry.tag}.sql`), "utf8"));
    }
    psql(`
      INSERT INTO organizations (id, name, slug, kind) VALUES
        ('org_a', 'Guided A', 'guided-a', 'client'),
        ('org_b', 'Guided B', 'guided-b', 'client');
      INSERT INTO sites (id, client_organization_id, name, slug) VALUES
        ('site_a', 'org_a', 'Guided A', 'guided-a'),
        ('site_b', 'org_b', 'Guided B', 'guided-b');
      INSERT INTO projects (id, site_id, name, slug) VALUES
        ('project_a', 'site_a', 'Project A', 'project-a'),
        ('project_b', 'site_b', 'Project B', 'project-b');
      INSERT INTO console_users (id, email, google_subject) VALUES
        ('user_requester', 'requester@example.invalid', 'guided-requester'),
        ('user_approver', 'approver@example.invalid', 'guided-approver'),
        ('user_foreign', 'foreign@example.invalid', 'guided-foreign');
      INSERT INTO organization_memberships (user_id, organization_id) VALUES
        ('user_requester', 'org_a'), ('user_approver', 'org_a'), ('user_foreign', 'org_b');
      INSERT INTO site_memberships (user_id, site_id, organization_id, role) VALUES
        ('user_requester', 'site_a', 'org_a', 'requester'),
        ('user_approver', 'site_a', 'org_a', 'approver'),
        ('user_foreign', 'site_b', 'org_b', 'admin');
    `);
    const binding = docker(["port", containerName, "5432/tcp"]).stdout.trim();
    const port = binding.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Port PostgreSQL illisible: ${binding}`);
    process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${port}/guided_delivery`;
    process.env.APP_ENCRYPTION_KEY = "guided-delivery-integration-test";
  }, 30_000);

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
    docker(["rm", "--force", containerName], undefined, true);
  });

  test("persists immutable revisions, resumes by id and deduplicates mutations", async () => {
    const created = await createGuidedTask(requester, {
      projectId: "project_a",
      draft: { ...draft, expectedResult: "", exclusions: "" },
      idempotencyKey: "create-task-network-retry",
    });
    const replay = await createGuidedTask(requester, {
      projectId: "project_a",
      draft: { ...draft, expectedResult: "", exclusions: "" },
      idempotencyKey: "create-task-network-retry",
    });
    expect(replay.id).toBe(created.id);
    expect(replay.revisions).toHaveLength(1);

    const validated = await createGuidedTaskRevision(requester, created.id, {
      draft,
      validate: true,
      idempotencyKey: "validate-revision-network-retry",
    });
    const validatedReplay = await createGuidedTaskRevision(requester, created.id, {
      draft,
      validate: true,
      idempotencyKey: "validate-revision-network-retry",
    });
    expect(validatedReplay.revisions).toHaveLength(2);
    expect(validated.currentRevisionId).toBe(validatedReplay.currentRevisionId);
    expect((await getGuidedTask(requester, created.id)).status).toBe("ready");

    const immutable = docker([
      "exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "guided_delivery", "-Atq",
    ], `UPDATE guided_task_revisions SET content_sha256 = '${"b".repeat(64)}' WHERE id = '${validated.currentRevisionId}';`, true);
    expect(immutable.status).not.toBe(0);
    expect(immutable.stderr).toContain("GUIDED_TASK_REVISION_IMMUTABLE");
  });

  test("requires an attributed developer decision and refuses cross-project access", async () => {
    const [taskId, revisionId] = psql(
      "SELECT id, current_revision_id FROM guided_tasks WHERE site_id = 'site_a' ORDER BY created_at LIMIT 1;",
    ).split("|");
    expect(taskId).toBeTruthy();
    expect(revisionId).toBeTruthy();

    const technical = await decideGuidedTask(approver, taskId!, {
      revisionId,
      kind: "technical",
      outcome: "approved",
      idempotencyKey: "technical-network-retry",
    });
    const replay = await decideGuidedTask(approver, taskId!, {
      revisionId,
      kind: "technical",
      outcome: "approved",
      idempotencyKey: "technical-network-retry",
    });
    expect(replay.decisions).toHaveLength(technical.decisions.length);
    expect(replay.decisions.at(-1)).toMatchObject({
      kind: "technical",
      actorUserId: "user_approver",
      actorRole: "approver",
    });

    await expect(getGuidedTask(foreignAdmin, taskId!)).rejects.toMatchObject({
      code: "GUIDED_TASK_NOT_FOUND",
      status: 404,
    });
    expect(psql("SELECT count(*) FROM audit_ledger_entries WHERE action = 'guided.task.read' AND decision = 'denied';"))
      .toBe("1");
  });

  test("refuses functional acceptance without proofs and deduplicates the network retry", async () => {
    const [taskId, revisionId] = psql(
      "SELECT id, current_revision_id FROM guided_tasks WHERE site_id = 'site_a' ORDER BY created_at LIMIT 1;",
    ).split("|");
    psql(`
      INSERT INTO guided_task_attempts (
        id, site_id, project_id, task_id, revision_id, author_user_id,
        attempt_number, idempotency_key, status, repository_path, base_commit,
        branch_name, evidence_complete, tests_passed
      ) VALUES (
        'attempt_functional', 'site_a', 'project_a', '${taskId}', '${revisionId}', 'user_requester',
        1, 'attempt-functional-fixture', 'awaiting_functional_validation', '/workspace',
        '${"a".repeat(40)}', 'hermes/functional-proof', false, false
      );
    `);
    const decision = {
      revisionId,
      attemptId: "attempt_functional",
      kind: "functional" as const,
      outcome: "approved" as const,
      idempotencyKey: "functional-network-retry",
    };
    await expect(decideGuidedTask(requester, taskId!, decision)).rejects.toMatchObject({
      code: "GUIDED_DECISION_CONFLICT",
    });
    psql(`
      UPDATE guided_task_attempts
      SET evidence_complete = true, tests_passed = true
      WHERE id = 'attempt_functional';
    `);
    await decideGuidedTask(requester, taskId!, decision);
    const replay = await decideGuidedTask(requester, taskId!, decision);
    expect(replay.status).toBe("completed");
    expect(replay.attempts.at(-1)?.status).toBe("completed");
    expect(replay.decisions.filter((item) => item.idempotencyKey === decision.idempotencyKey))
      .toHaveLength(1);
  });

  test("lists a bounded current-revision Inbox summary with stable pagination and scopes", async () => {
    psql(`
      INSERT INTO projects (id, site_id, name, slug) VALUES
        ('inbox_project', 'site_a', 'Projet Inbox', 'projet-inbox');
      INSERT INTO guided_tasks (id, site_id, project_id, owner_user_id, author_user_id, idempotency_key, title, status, current_revision_id, created_at, updated_at) VALUES
        ('inbox_b', 'site_a', 'inbox_project', 'user_requester', 'user_requester', 'inbox-1-key', 'Premier', 'ready', NULL, '2099-08-09T08:00:00Z', '2099-08-09T12:00:00Z'),
        ('inbox_a', 'site_a', 'inbox_project', 'user_requester', 'user_requester', 'inbox-2-key', 'Second', 'ready', NULL, '2099-08-09T08:00:00Z', '2099-08-09T12:00:00Z'),
        ('inbox_hidden', 'site_a', 'inbox_project', 'user_approver', 'user_approver', 'inbox-hidden-key', 'Autrui', 'ready', NULL, '2099-08-09T08:00:00Z', '2099-08-09T11:00:00Z');
      INSERT INTO guided_task_revisions (id, site_id, project_id, task_id, number, author_user_id, idempotency_key, content, content_sha256, state, requires_technical_approval, validated_at, validated_by_user_id, created_at) VALUES
        ('inbox_b_r1', 'site_a', 'inbox_project', 'inbox_b', 1, 'user_requester', 'inbox-1-r1', '{}'::jsonb, '${"1".repeat(64)}', 'validated', false, '2099-08-09T08:00:00Z', 'user_requester', '2099-08-09T08:00:00Z'),
        ('inbox_b_r2', 'site_a', 'inbox_project', 'inbox_b', 2, 'user_requester', 'inbox-1-r2', '{}'::jsonb, '${"2".repeat(64)}', 'validated', false, '2099-08-09T09:00:00Z', 'user_requester', '2099-08-09T09:00:00Z'),
        ('inbox_a_r1', 'site_a', 'inbox_project', 'inbox_a', 1, 'user_requester', 'inbox-2-r1', '{}'::jsonb, '${"3".repeat(64)}', 'validated', false, '2099-08-09T08:00:00Z', 'user_requester', '2099-08-09T08:00:00Z'),
        ('inbox_hidden_r1', 'site_a', 'inbox_project', 'inbox_hidden', 1, 'user_approver', 'inbox-hidden-r1', '{}'::jsonb, '${"4".repeat(64)}', 'validated', false, '2099-08-09T08:00:00Z', 'user_approver', '2099-08-09T08:00:00Z');
      UPDATE guided_tasks SET current_revision_id = CASE id
        WHEN 'inbox_b' THEN 'inbox_b_r2'
        WHEN 'inbox_a' THEN 'inbox_a_r1'
        WHEN 'inbox_hidden' THEN 'inbox_hidden_r1'
      END WHERE id IN ('inbox_b', 'inbox_a', 'inbox_hidden');
      INSERT INTO guided_task_attempts (id, site_id, project_id, task_id, revision_id, author_user_id, attempt_number, idempotency_key, status, repository_path, base_commit, branch_name, evidence_complete, tests_passed) VALUES
        ('inbox_b_old_attempt', 'site_a', 'inbox_project', 'inbox_b', 'inbox_b_r1', 'user_requester', 1, 'inbox-1-old-attempt', 'awaiting_functional_validation', '/private/r1', '${"a".repeat(40)}', 'private/r1', true, true),
        ('inbox_b_current_attempt', 'site_a', 'inbox_project', 'inbox_b', 'inbox_b_r2', 'user_requester', 2, 'inbox-1-current-attempt', 'completed', '/private/r2', '${"b".repeat(40)}', 'private/r2', true, true);
      INSERT INTO guided_task_decisions (id, site_id, project_id, task_id, revision_id, attempt_id, decision_number, kind, outcome, actor_user_id, actor_role, idempotency_key, created_at) VALUES
        ('inbox_b_old_tool', 'site_a', 'inbox_project', 'inbox_b', 'inbox_b_r1', NULL, 1, 'tool', 'rejected', 'user_requester', 'requester', 'inbox-1-old-tool', '2099-08-09T08:30:00Z'),
        ('inbox_b_current_tool', 'site_a', 'inbox_project', 'inbox_b', 'inbox_b_r2', NULL, 2, 'tool', 'approved', 'user_requester', 'requester', 'inbox-1-current-tool', '2099-08-09T09:30:00Z');
    `);
    const inboxRequester = { ...requester, mandateProjectId: "inbox_project" };
    const first = await listGuidedTaskSummaries(inboxRequester, { limit: 1 });
    expect(first.tasks.map((item) => item.id)).toEqual(["inbox_b"]);
    expect(first.page.hasMore).toBe(true);
    expect(first.tasks[0]).toMatchObject({
      currentRevision: { id: "inbox_b_r2" },
      latestAttempt: { id: "inbox_b_current_attempt", revisionId: "inbox_b_r2" },
      decisions: [{ kind: "tool", outcome: "approved", attemptId: null }],
    });
    expect(first.tasks[0]).not.toHaveProperty("repositoryPath");
    expect(first.tasks[0]).not.toHaveProperty("evidence");
    const second = await listGuidedTaskSummaries(inboxRequester, { limit: 1, cursor: first.page.nextCursor! });
    expect(second.tasks.map((item) => item.id)).toEqual(["inbox_a"]);
    expect(second.page.hasMore).toBe(false);
    const mandateScoped = await listGuidedTaskSummaries({ ...requester, mandateProjectId: "project_missing" }, { limit: 10 });
    expect(mandateScoped.tasks).toEqual([]);
    const foreignSite = await listGuidedTaskSummaries(foreignAdmin, { limit: 10 });
    expect(foreignSite.tasks).toEqual([]);
  });
});
