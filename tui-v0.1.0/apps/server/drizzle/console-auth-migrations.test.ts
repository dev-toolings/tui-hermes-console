import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const POSTGRES_IMAGE =
  "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94";
const containerName = `hermes-migrations-${randomUUID().slice(0, 12)}`;
const dockerAvailable =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

type Journal = { entries: Array<{ idx: number; tag: string }> };
const journal = JSON.parse(
  readFileSync(join(import.meta.dir, "meta", "_journal.json"), "utf8"),
) as Journal;
const expectedAuthJournal = [
  "0011_console_auth",
  "0012_console_setup",
  "0013_repair_console_auth_transactions",
  "0014_repair_console_users_google",
  "0015_relax_legacy_console_password",
  "0016_ai_disclosure_consent",
];

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

describeWithDocker("console auth migrations on PostgreSQL", () => {
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
        ["exec", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atqc", "SELECT 1;"],
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

  test("0011 through 0016 converge on a fresh database", () => {
    expect(journal.entries.slice(11, 17).map(({ tag }) => tag)).toEqual(
      expectedAuthJournal,
    );
    psql("postgres", 'CREATE DATABASE "fresh_console";');
    applyJournal("fresh_console", 0, 16);

    expect(
      psql(
        "fresh_console",
        `SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('console_users', 'console_sessions',
                              'console_auth_transactions', 'console_setup');`,
      ),
    ).toBe("4");
    expect(
      psql(
        "fresh_console",
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_users'
           AND column_name = 'password_hash';`,
      ),
    ).toBe("0");
    expect(
      psql(
        "fresh_console",
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_users'
           AND column_name IN ('ai_disclosure_version',
                               'ai_disclosure_accepted_at')
           AND is_nullable = 'YES';`,
      ),
    ).toBe("2");
    expect(
      psql(
        "fresh_console",
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_setup'
           AND column_name IN ('runtime_verified_at', 'runtime_config_version')
           AND is_nullable = 'YES';`,
      ),
    ).toBe("2");
    expect(
      psql(
        "fresh_console",
        `SELECT column_default || ':' || is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'runtime_config'
           AND column_name = 'config_revision';`,
      ),
    ).toBe("1:NO");
  });

  test("0016 repairs an unproven legacy completion and enforces future proof", () => {
    psql("postgres", 'CREATE DATABASE "unproven_setup";');
    applyJournal("unproven_setup", 0, 15);
    psql(
      "unproven_setup",
      `INSERT INTO "console_setup" ("id", "step", "completed_at")
       VALUES ('default', 'completed', now());`,
    );
    applyJournal("unproven_setup", 16, 16);

    expect(
      psql(
        "unproven_setup",
        `SELECT step || ':' || (completed_at IS NULL)::text || ':' ||
                (runtime_verified_at IS NULL)::text || ':' ||
                (runtime_config_version IS NULL)::text
         FROM "console_setup" WHERE id = 'default';`,
      ),
    ).toBe("agent:true:true:true");
    expect(() =>
      psql(
        "unproven_setup",
        `UPDATE "console_setup"
         SET step = 'completed', completed_at = now()
         WHERE id = 'default';`,
      ),
    ).toThrow("console_setup_completed_proof_check");
    psql(
      "unproven_setup",
      `UPDATE "console_setup"
       SET step = 'completed', completed_at = now(), runtime_verified_at = now(),
           runtime_config_version = 'database:1'
       WHERE id = 'default';`,
    );
  });

  test("0029 repairs a drifted legacy identity and restores non-null constraints", () => {
    psql("postgres", 'CREATE DATABASE "legacy_null_identity";');
    psql(
      "legacy_null_identity",
      `CREATE TABLE "console_users" (
         "id" text PRIMARY KEY,
         "email" text,
         "google_subject" text
       );
       INSERT INTO "console_users" ("id") VALUES ('admin');`,
    );

    psql(
      "legacy_null_identity",
      migration("0029_repair_legacy_identity_nulls.sql"),
    );

    expect(
      psql(
        "legacy_null_identity",
        `SELECT email || ':' || google_subject
         FROM console_users WHERE id = 'admin';`,
      ),
    ).toBe("legacy+admin@legacy.invalid:legacy:admin");
    expect(
      psql(
        "legacy_null_identity",
        `SELECT string_agg(column_name || ':' || is_nullable, ',' ORDER BY column_name)
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_users'
           AND column_name IN ('email', 'google_subject');`,
      ),
    ).toBe("email:NO,google_subject:NO");
  });

  test("a runtime revision changed after probe cannot complete setup", () => {
    psql("postgres", 'CREATE DATABASE "runtime_cas";');
    applyJournal("runtime_cas", 0, 16);
    psql(
      "runtime_cas",
      `INSERT INTO "runtime_config" ("id", "base_url", "encrypted_token")
       VALUES ('default', 'http://127.0.0.1:8642', 'ciphertext');
       INSERT INTO "console_setup" ("id", "step")
       VALUES ('default', 'agent');`,
    );

    // Le probe a observé database:1, puis une sauvegarde concurrente passe à 2.
    psql(
      "runtime_cas",
      `UPDATE "runtime_config"
       SET "config_revision" = "config_revision" + 1
       WHERE "id" = 'default';`,
    );
    expect(
      psql(
        "runtime_cas",
        `UPDATE "console_setup"
         SET "step" = 'completed',
             "completed_at" = now(),
             "runtime_verified_at" = now(),
             "runtime_config_version" = 'database:1'
         WHERE "id" = 'default'
           AND "step" = 'agent'
           AND EXISTS (
             SELECT 1 FROM "runtime_config"
             WHERE "id" = 'default' AND "config_revision" = 1
           )
         RETURNING "step";`,
      ),
    ).toBe("");
    expect(
      psql(
        "runtime_cas",
        `SELECT step || ':' || config_revision
         FROM "console_setup", "runtime_config"
         WHERE "console_setup"."id" = 'default'
           AND "runtime_config"."id" = 'default';`,
      ),
    ).toBe("agent:2");
  });

  test("the exact 0011 through 0016 journal upgrades an after-0010 legacy user", () => {
    psql("postgres", 'CREATE DATABASE "legacy_console";');
    applyJournal("legacy_console", 0, 10);
    expect(
      psql(
        "legacy_console",
        `SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('threads', 'runs', 'agents',
                              'runtime_config', 'runtime_model_settings');`,
      ),
    ).toBe("5");
    psql(
      "legacy_console",
      `CREATE TABLE "console_users" (
         "id" text PRIMARY KEY NOT NULL,
         "password_hash" text NOT NULL,
         "created_at" timestamptz DEFAULT now() NOT NULL,
         "updated_at" timestamptz DEFAULT now() NOT NULL
       );
       INSERT INTO "console_users" ("id", "password_hash")
       VALUES ('legacy-admin', 'preserved-hash');`,
    );
    applyJournal("legacy_console", 11, 16);

    expect(
      psql(
        "legacy_console",
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_users'
           AND column_name = 'password_hash';`,
      ),
    ).toBe("YES");
    expect(
      psql(
        "legacy_console",
        `SELECT id || ':' || password_hash || ':' || email || ':' || google_subject
         FROM "console_users"
         WHERE id = 'legacy-admin';`,
      ),
    ).toBe(
      "legacy-admin:preserved-hash:legacy+legacy-admin@legacy.invalid:legacy:legacy-admin",
    );
    expect(
      psql(
        "legacy_console",
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_users'
           AND column_name IN ('email', 'google_subject', 'display_name');`,
      ),
    ).toBe("3");
    expect(
      psql(
        "legacy_console",
        `SELECT ai_disclosure_version IS NULL
                AND ai_disclosure_accepted_at IS NULL
         FROM "console_users"
         WHERE id = 'legacy-admin';`,
      ),
    ).toBe("t");
    expect(
      psql(
        "legacy_console",
        `SELECT count(*) FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('console_users', 'console_sessions',
                              'console_auth_transactions', 'console_setup');`,
      ),
    ).toBe("4");

    const commonShape = (database: string) =>
      psql(
        database,
        `SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable,
                           ',' ORDER BY column_name)
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'console_users'
           AND column_name <> 'password_hash';`,
      );
    expect(commonShape("legacy_console")).toBe(commonShape("fresh_console"));
  });
});
