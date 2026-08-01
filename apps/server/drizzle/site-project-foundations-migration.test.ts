import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-sites-${randomUUID().slice(0, 12)}`;
const dockerAvailable =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

type Journal = { entries: Array<{ idx: number; tag: string }> };
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as Journal;

function migration(name: string) {
  return readFileSync(join(import.meta.dir, name), "utf8");
}

function applyJournal(database: string, from: number, through: number) {
  const entries = journal.entries.filter(
    ({ idx }) => idx >= from && idx <= through,
  );
  for (const { tag } of entries) psql(database, migration(`${tag}.sql`));
}

function docker(args: string[], input?: string) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function psql(database: string, sql: string) {
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
    sql,
  );
}

const describeWithDocker = dockerAvailable ? describe : describe.skip;

if (!dockerAvailable) {
  test.skip(
    "P-INT non exécuté : daemon Docker indisponible, aucune preuve PostgreSQL réelle",
    () => undefined,
  );
}

describeWithDocker("site and project foundations migration on PostgreSQL", () => {
  beforeAll(async () => {
    docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--tmpfs",
      "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      POSTGRES_IMAGE,
    ]);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = spawnSync(
        "docker",
        ["exec", containerName, "pg_isready", "-U", "postgres"],
        { stdio: "ignore" },
      );
      if (ready.status === 0) return;
      await Bun.sleep(250);
    }
    throw new Error("PostgreSQL éphémère indisponible après 15 secondes.");
  }, 20_000);

  afterAll(() => {
    spawnSync("docker", ["rm", "--force", containerName], {
      stdio: "ignore",
    });
  });

  test("0017 backfills every existing business resource into one idempotent legacy site", () => {
    expect(journal.entries.find((entry) => entry.idx === 17)?.tag).toBe(
      "0017_site_project_foundations",
    );
    psql("postgres", 'CREATE DATABASE "site_legacy";');
    applyJournal("site_legacy", 0, 16);
    psql(
      "site_legacy",
      `INSERT INTO "agents" ("id", "name", "slug", "instructions")
       VALUES ('agt_legacy', 'Legacy agent', 'legacy-agent', 'instructions');
       INSERT INTO "connectors"
         ("id", "type", "label", "email", "imap_host", "encrypted_password")
       VALUES
         ('con_legacy', 'gmail', 'Inbox', 'legacy@example.com',
          'imap.example.com', 'cipher');
       INSERT INTO "threads"
         ("id", "title", "agent_name", "instructions", "hermes_conversation")
       VALUES
         ('thr_legacy', 'Legacy thread', 'Legacy agent', 'instructions',
          'console:thr_legacy');
       INSERT INTO "runs" ("id", "thread_id", "input")
       VALUES ('run_legacy', 'thr_legacy', 'hello');
       INSERT INTO "artifacts"
         ("id", "run_id", "direction", "filename", "storage_path",
          "size_bytes", "checksum_sha256")
       VALUES
         ('art_legacy', 'run_legacy', 'output', 'result.txt',
          '/data/result.txt', 1, 'sha');`,
    );

    applyJournal("site_legacy", 17, 17);
    psql("site_legacy", migration("0017_site_project_foundations.sql"));

    expect(
      psql(
        "site_legacy",
        `SELECT count(*) FROM "sites" WHERE "id" = 'legacy-default';`,
      ),
    ).toBe("1");
    expect(
      psql(
        "site_legacy",
        `SELECT string_agg(resource || ':' || site_id, ',' ORDER BY resource)
         FROM (
           SELECT 'agent' AS resource, site_id FROM agents WHERE id = 'agt_legacy'
           UNION ALL
           SELECT 'artifact', site_id FROM artifacts WHERE id = 'art_legacy'
           UNION ALL
           SELECT 'connector', site_id FROM connectors WHERE id = 'con_legacy'
           UNION ALL
           SELECT 'run', site_id FROM runs WHERE id = 'run_legacy'
           UNION ALL
           SELECT 'thread', site_id FROM threads WHERE id = 'thr_legacy'
         ) resources;`,
      ),
    ).toBe(
      "agent:legacy-default,artifact:legacy-default,connector:legacy-default,run:legacy-default,thread:legacy-default",
    );
    expect(
      psql(
        "site_legacy",
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('agents', 'connectors', 'threads', 'runs', 'artifacts')
           AND column_name = 'site_id'
           AND is_nullable = 'NO'
           AND column_default LIKE '%legacy-default%';`,
      ),
    ).toBe("5");
  });

  test("0017 enforces site, project, scoped uniqueness, and membership integrity", () => {
    psql("postgres", 'CREATE DATABASE "site_integrity";');
    applyJournal("site_integrity", 0, 17);
    psql(
      "site_integrity",
      `INSERT INTO "sites" ("id", "name", "slug")
       VALUES ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon');
       INSERT INTO "projects" ("id", "site_id", "name", "slug")
       VALUES
         ('prj_paris', 'paris', 'Project Paris', 'project-paris'),
         ('prj_paris_2', 'paris', 'Project Paris 2', 'project-paris-2'),
         ('prj_lyon', 'lyon', 'Project Lyon', 'project-lyon');
       INSERT INTO "console_users" ("id", "email", "google_subject") VALUES
         ('usr_admin', 'admin@example.com', 'sub-admin'),
         ('usr_operator', 'operator@example.com', 'sub-operator'),
         ('usr_requester', 'requester@example.com', 'sub-requester'),
         ('usr_approver', 'approver@example.com', 'sub-approver'),
         ('usr_auditor', 'auditor@example.com', 'sub-auditor'),
         ('usr_invalid', 'invalid@example.com', 'sub-invalid');
       INSERT INTO "site_memberships" ("user_id", "site_id", "role") VALUES
         ('usr_admin', 'paris', 'admin'),
         ('usr_operator', 'paris', 'operator'),
         ('usr_requester', 'paris', 'requester'),
         ('usr_approver', 'paris', 'approver'),
         ('usr_auditor', 'paris', 'auditor');
       INSERT INTO "agents"
         ("id", "site_id", "project_id", "name", "slug", "instructions")
       VALUES
         ('agt_paris', 'paris', 'prj_paris', 'Paris agent', 'shared-agent', 'instructions'),
         ('agt_lyon', 'lyon', 'prj_lyon', 'Lyon agent', 'shared-agent', 'instructions');
       INSERT INTO "connectors"
         ("id", "site_id", "project_id", "type", "label", "email",
          "imap_host", "encrypted_password")
       VALUES
         ('con_paris', 'paris', 'prj_paris', 'gmail', 'Paris inbox',
          'paris@example.com', 'imap.example.com', 'cipher'),
         ('con_lyon', 'lyon', 'prj_lyon', 'gmail', 'Lyon inbox',
          'lyon@example.com', 'imap.example.com', 'cipher');
       INSERT INTO "threads"
         ("id", "site_id", "project_id", "title", "agent_id", "agent_name",
          "instructions", "hermes_conversation")
       VALUES
         ('thr_paris', 'paris', 'prj_paris', 'Paris thread', 'agt_paris',
          'Paris agent', 'instructions', 'console:thr_paris'),
         ('thr_lyon', 'lyon', 'prj_lyon', 'Lyon thread', 'agt_lyon',
          'Lyon agent', 'instructions', 'console:thr_lyon');
       INSERT INTO "runs" ("id", "site_id", "project_id", "thread_id", "input")
       VALUES
         ('run_paris', 'paris', 'prj_paris', 'thr_paris', 'hello'),
         ('run_lyon', 'lyon', 'prj_lyon', 'thr_lyon', 'hello');
       INSERT INTO "artifacts"
         ("id", "site_id", "project_id", "run_id", "direction", "filename",
          "storage_path", "size_bytes", "checksum_sha256")
       VALUES
         ('art_paris', 'paris', 'prj_paris', 'run_paris', 'output', 'result.txt',
          '/data/result.txt', 1, 'sha');
       INSERT INTO "agents"
         ("id", "site_id", "name", "slug", "instructions")
       VALUES ('agt_null_project', 'paris', 'Null project agent',
               'null-project-agent', 'instructions');
       INSERT INTO "threads"
         ("id", "site_id", "title", "agent_id", "agent_name", "instructions",
          "hermes_conversation")
       VALUES ('thr_null_project', 'paris', 'Null project thread',
               'agt_null_project', 'Null project agent', 'instructions',
               'console:thr_null_project');
       INSERT INTO "runs" ("id", "site_id", "thread_id", "input")
       VALUES ('run_null_project', 'paris', 'thr_null_project', 'hello');
       INSERT INTO "artifacts"
         ("id", "site_id", "run_id", "direction", "filename", "storage_path",
          "size_bytes", "checksum_sha256")
       VALUES ('art_null_project', 'paris', 'run_null_project', 'output',
               'null.txt', '/data/null.txt', 1, 'sha');`,
    );

    expect(
      psql(
        "site_integrity",
        `SELECT string_agg(role, ',' ORDER BY role)
         FROM "site_memberships" WHERE "site_id" = 'paris';`,
      ),
    ).toBe("admin,approver,auditor,operator,requester");
    expect(
      psql(
        "site_integrity",
        `SELECT
           (SELECT count(*) FROM agents WHERE slug = 'shared-agent') || ':' ||
           (SELECT count(*) FROM connectors WHERE type = 'gmail') || ':' ||
           (SELECT count(*) FROM agents WHERE project_id IS NOT NULL) || ':' ||
           (SELECT count(*) FROM connectors WHERE project_id IS NOT NULL) || ':' ||
           (SELECT count(*) FROM threads WHERE project_id IS NOT NULL) || ':' ||
           (SELECT count(*) FROM runs WHERE project_id IS NOT NULL) || ':' ||
           (SELECT count(*) FROM artifacts WHERE project_id IS NOT NULL);`,
      ),
    ).toBe("2:2:2:2:2:2:1");
    expect(
      psql(
        "site_integrity",
        `SELECT count(*) FROM (
           SELECT project_scope FROM agents WHERE id = 'agt_null_project'
           UNION ALL
           SELECT project_scope FROM threads WHERE id = 'thr_null_project'
           UNION ALL
           SELECT project_scope FROM runs WHERE id = 'run_null_project'
           UNION ALL
           SELECT project_scope FROM artifacts WHERE id = 'art_null_project'
         ) null_scopes WHERE project_scope = '';`,
      ),
    ).toBe("4");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "site_memberships" ("user_id", "site_id", "role")
         VALUES ('usr_invalid', 'paris', 'owner');`,
      ),
    ).toThrow("site_memberships_role_check");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "projects" ("id", "site_id", "name", "slug")
         VALUES ('prj_missing', 'missing-site', 'Missing', 'missing');`,
      ),
    ).toThrow("projects_site_id_sites_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "agents"
           ("id", "site_id", "name", "slug", "instructions")
         VALUES
           ('agt_missing', 'missing-site', 'Missing', 'missing', 'instructions');`,
      ),
    ).toThrow("agents_site_id_sites_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "agents"
           ("id", "site_id", "name", "slug", "instructions")
         VALUES ('agt_paris_duplicate', 'paris', 'Duplicate', 'shared-agent', 'instructions');`,
      ),
    ).toThrow("agents_site_slug_idx");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "connectors"
           ("id", "site_id", "type", "label", "email", "imap_host",
            "encrypted_password")
         VALUES ('con_paris_duplicate', 'paris', 'gmail', 'Duplicate',
                 'duplicate@example.com', 'imap.example.com', 'cipher');`,
      ),
    ).toThrow("connectors_site_type_idx");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "agents"
           ("id", "site_id", "project_id", "name", "slug", "instructions")
         VALUES ('agt_wrong_project', 'paris', 'prj_lyon', 'Wrong project',
                 'wrong-project', 'instructions');`,
      ),
    ).toThrow("agents_site_project_id_projects_site_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "threads"
           ("id", "site_id", "project_id", "title", "agent_id", "agent_name",
            "instructions", "hermes_conversation")
         VALUES ('thr_cross_site', 'lyon', 'prj_lyon', 'Cross site', 'agt_paris',
                 'Paris agent', 'instructions', 'console:thr_cross_site');`,
      ),
    ).toThrow("threads_site_agent_id_agents_site_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "runs" ("id", "site_id", "project_id", "thread_id", "input")
         VALUES ('run_cross_site', 'lyon', 'prj_lyon', 'thr_paris', 'hello');`,
      ),
    ).toThrow("runs_site_thread_id_threads_site_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "artifacts"
           ("id", "site_id", "project_id", "run_id", "direction", "filename",
            "storage_path", "size_bytes", "checksum_sha256")
         VALUES ('art_cross_site', 'lyon', 'prj_lyon', 'run_paris', 'output',
                 'cross.txt', '/data/cross.txt', 1, 'sha');`,
      ),
    ).toThrow("artifacts_site_run_id_runs_site_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "threads"
           ("id", "site_id", "project_id", "title", "agent_id", "agent_name",
            "instructions", "hermes_conversation")
         VALUES ('thr_wrong_project', 'paris', 'prj_paris_2', 'Wrong project',
                 'agt_paris', 'Paris agent', 'instructions',
                 'console:thr_wrong_project');`,
      ),
    ).toThrow("threads_site_project_scope_agent_id_agents_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "runs" ("id", "site_id", "project_id", "thread_id", "input")
         VALUES ('run_wrong_project', 'paris', 'prj_paris_2', 'thr_paris', 'hello');`,
      ),
    ).toThrow("runs_site_project_scope_thread_id_threads_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "artifacts"
           ("id", "site_id", "project_id", "run_id", "direction", "filename",
            "storage_path", "size_bytes", "checksum_sha256")
         VALUES ('art_wrong_project', 'paris', 'prj_paris_2', 'run_paris', 'output',
                 'wrong.txt', '/data/wrong.txt', 1, 'sha');`,
      ),
    ).toThrow("artifacts_site_project_scope_run_id_runs_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "threads"
           ("id", "site_id", "title", "agent_id", "agent_name", "instructions",
            "hermes_conversation")
         VALUES ('thr_null_child', 'paris', 'Null child', 'agt_paris',
                 'Paris agent', 'instructions', 'console:thr_null_child');`,
      ),
    ).toThrow("threads_site_project_scope_agent_id_agents_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "threads"
           ("id", "site_id", "project_id", "title", "agent_id", "agent_name",
            "instructions", "hermes_conversation")
         VALUES ('thr_projected_child', 'paris', 'prj_paris', 'Projected child',
                 'agt_null_project', 'Null project agent', 'instructions',
                 'console:thr_projected_child');`,
      ),
    ).toThrow("threads_site_project_scope_agent_id_agents_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "runs" ("id", "site_id", "thread_id", "input")
         VALUES ('run_null_child', 'paris', 'thr_paris', 'hello');`,
      ),
    ).toThrow("runs_site_project_scope_thread_id_threads_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "runs"
           ("id", "site_id", "project_id", "thread_id", "input")
         VALUES ('run_projected_child', 'paris', 'prj_paris',
                 'thr_null_project', 'hello');`,
      ),
    ).toThrow("runs_site_project_scope_thread_id_threads_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "artifacts"
           ("id", "site_id", "run_id", "direction", "filename", "storage_path",
            "size_bytes", "checksum_sha256")
         VALUES ('art_null_child', 'paris', 'run_paris', 'output', 'null-child.txt',
                 '/data/null-child.txt', 1, 'sha');`,
      ),
    ).toThrow("artifacts_site_project_scope_run_id_runs_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `INSERT INTO "artifacts"
           ("id", "site_id", "project_id", "run_id", "direction", "filename",
            "storage_path", "size_bytes", "checksum_sha256")
         VALUES ('art_projected_child', 'paris', 'prj_paris', 'run_null_project',
                 'output', 'projected-child.txt', '/data/projected-child.txt', 1, 'sha');`,
      ),
    ).toThrow("artifacts_site_project_scope_run_id_runs_scope_id_fk");
    expect(() =>
      psql(
        "site_integrity",
        `UPDATE "agents" SET "project_id" = 'prj_paris_2'
         WHERE "id" = 'agt_paris';`,
      ),
    ).toThrow("threads_site_project_scope_agent_id_agents_scope_id_fk");
  });

  test("0020 binds only single-membership sessions and removes resource defaults", () => {
    expect(journal.entries.find((entry) => entry.idx === 20)?.tag).toBe(
      "0020_session_site_context",
    );
    psql("postgres", 'CREATE DATABASE "site_session_context";');
    applyJournal("site_session_context", 0, 19);
    psql(
      "site_session_context",
      `INSERT INTO sites (id, name, slug) VALUES
         ('paris', 'Paris', 'paris'), ('lyon', 'Lyon', 'lyon');
       INSERT INTO console_users (id, email, google_subject) VALUES
         ('usr_none', 'none@example.com', 'sub-none'),
         ('usr_one', 'one@example.com', 'sub-one'),
         ('usr_many', 'many@example.com', 'sub-many');
       INSERT INTO site_memberships (user_id, site_id, role) VALUES
         ('usr_one', 'paris', 'operator'),
         ('usr_many', 'paris', 'operator'),
         ('usr_many', 'lyon', 'auditor');
       INSERT INTO console_sessions (token_hash, user_id, csrf_token, expires_at)
       VALUES
         ('ses_none', 'usr_none', 'csrf', now() + interval '1 day'),
         ('ses_one', 'usr_one', 'csrf', now() + interval '1 day'),
         ('ses_many', 'usr_many', 'csrf', now() + interval '1 day');`,
    );

    applyJournal("site_session_context", 20, 20);
    psql("site_session_context", migration("0020_session_site_context.sql"));

    expect(
      psql(
        "site_session_context",
        `SELECT string_agg(user_id || ':' || site_id || ':' || role, ',' ORDER BY user_id, site_id)
         FROM site_memberships WHERE user_id IN ('usr_none', 'usr_one', 'usr_many');`,
      ),
    ).toBe(
      "usr_many:lyon:auditor,usr_many:paris:operator,usr_none:legacy-default:admin,usr_one:paris:operator",
    );
    expect(
      psql(
        "site_session_context",
        `SELECT string_agg(token_hash || ':' || coalesce(site_id, 'NULL'), ',' ORDER BY token_hash)
         FROM console_sessions;`,
      ),
    ).toBe("ses_many:NULL,ses_none:legacy-default,ses_one:paris");
    expect(
      psql(
        "site_session_context",
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('agents', 'connectors', 'threads', 'runs', 'artifacts')
           AND column_name = 'site_id' AND column_default IS NULL;`,
      ),
    ).toBe("5");
    expect(() =>
      psql(
        "site_session_context",
        `UPDATE console_sessions SET site_id = 'lyon' WHERE token_hash = 'ses_one';`,
      ),
    ).toThrow("console_sessions_user_site_membership_fk");
  });
});
