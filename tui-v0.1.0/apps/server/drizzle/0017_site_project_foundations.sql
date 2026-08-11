CREATE TABLE IF NOT EXISTS "sites" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sites_slug_idx" ON "sites" USING btree ("slug");
--> statement-breakpoint
-- Le site legacy est déterministe et réinsérable : toutes les installations
-- mono-site existantes convergent vers la même frontière explicite.
INSERT INTO "sites" ("id", "name", "slug")
VALUES ('legacy-default', 'Legacy site', 'legacy-default')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "projects_id_not_empty_check" CHECK ("id" <> ''),
  CONSTRAINT "projects_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_site_slug_idx"
ON "projects" USING btree ("site_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_site_id_idx"
ON "projects" USING btree ("site_id", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_site_idx" ON "projects" USING btree ("site_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_id_not_empty_check'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_id_not_empty_check"
      CHECK ("id" <> '');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_memberships" (
  "user_id" text NOT NULL,
  "site_id" text NOT NULL,
  "role" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "site_memberships_pkey" PRIMARY KEY ("user_id", "site_id"),
  CONSTRAINT "site_memberships_user_id_console_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "console_users"("id") ON DELETE CASCADE,
  CONSTRAINT "site_memberships_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE,
  CONSTRAINT "site_memberships_role_check"
    CHECK ("role" IN ('admin', 'operator', 'requester', 'approver', 'auditor'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_memberships_site_role_idx"
ON "site_memberships" USING btree ("site_id", "role");
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "site_id" text;
--> statement-breakpoint
ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "site_id" text;
--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "site_id" text;
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "site_id" text;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "site_id" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "project_id" text;
ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "project_id" text;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "project_id" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "project_id" text;
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "project_scope" text
  GENERATED ALWAYS AS (coalesce("project_id", '')) STORED;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "project_scope" text
  GENERATED ALWAYS AS (coalesce("project_id", '')) STORED;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "project_scope" text
  GENERATED ALWAYS AS (coalesce("project_id", '')) STORED;
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "project_scope" text
  GENERATED ALWAYS AS (coalesce("project_id", '')) STORED;
ALTER TABLE "agents" ALTER COLUMN "project_scope" SET NOT NULL;
ALTER TABLE "threads" ALTER COLUMN "project_scope" SET NOT NULL;
ALTER TABLE "runs" ALTER COLUMN "project_scope" SET NOT NULL;
ALTER TABLE "artifacts" ALTER COLUMN "project_scope" SET NOT NULL;
--> statement-breakpoint
UPDATE "agents" SET "site_id" = 'legacy-default' WHERE "site_id" IS NULL;
--> statement-breakpoint
UPDATE "connectors" SET "site_id" = 'legacy-default' WHERE "site_id" IS NULL;
--> statement-breakpoint
UPDATE "threads" SET "site_id" = 'legacy-default' WHERE "site_id" IS NULL;
--> statement-breakpoint
UPDATE "runs" SET "site_id" = 'legacy-default' WHERE "site_id" IS NULL;
--> statement-breakpoint
UPDATE "artifacts" SET "site_id" = 'legacy-default' WHERE "site_id" IS NULL;
--> statement-breakpoint
-- P1 différé : ce défaut maintient les écritures runtime mono-site existantes.
-- Le prochain lot de contexte site devra fournir site_id puis retirer ce défaut.
ALTER TABLE "agents" ALTER COLUMN "site_id" SET DEFAULT 'legacy-default';
ALTER TABLE "agents" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "connectors" ALTER COLUMN "site_id" SET DEFAULT 'legacy-default';
ALTER TABLE "connectors" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "threads" ALTER COLUMN "site_id" SET DEFAULT 'legacy-default';
ALTER TABLE "threads" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "runs" ALTER COLUMN "site_id" SET DEFAULT 'legacy-default';
ALTER TABLE "runs" ALTER COLUMN "site_id" SET NOT NULL;
ALTER TABLE "artifacts" ALTER COLUMN "site_id" SET DEFAULT 'legacy-default';
ALTER TABLE "artifacts" ALTER COLUMN "site_id" SET NOT NULL;
--> statement-breakpoint
DO $$
DECLARE
  resource_table text;
  constraint_name text;
BEGIN
  FOREACH resource_table IN ARRAY ARRAY['agents', 'connectors', 'threads', 'runs', 'artifacts']
  LOOP
    constraint_name := resource_table || '_site_id_sites_id_fk';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = to_regclass(current_schema() || '.' || resource_table)
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (site_id) REFERENCES sites(id)',
        resource_table,
        constraint_name
      );
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "agents_slug_idx";
DROP INDEX IF EXISTS "connectors_type_idx";
--> statement-breakpoint
ALTER TABLE "threads"
  DROP CONSTRAINT IF EXISTS "threads_site_project_agent_id_agents_site_project_id_fk";
ALTER TABLE "runs"
  DROP CONSTRAINT IF EXISTS "runs_site_project_thread_id_threads_site_project_id_fk";
ALTER TABLE "artifacts"
  DROP CONSTRAINT IF EXISTS "artifacts_site_project_run_id_runs_site_project_id_fk";
DROP INDEX IF EXISTS "agents_site_project_id_idx";
DROP INDEX IF EXISTS "threads_site_project_id_idx";
DROP INDEX IF EXISTS "runs_site_project_id_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_site_id_idx"
ON "agents" USING btree ("site_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "agents_site_project_scope_id_idx"
ON "agents" USING btree ("site_id", "project_scope", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "agents_site_slug_idx"
ON "agents" USING btree ("site_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "connectors_site_id_idx"
ON "connectors" USING btree ("site_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "connectors_site_type_idx"
ON "connectors" USING btree ("site_id", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "threads_site_id_idx"
ON "threads" USING btree ("site_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "threads_site_project_scope_id_idx"
ON "threads" USING btree ("site_id", "project_scope", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "runs_site_id_idx"
ON "runs" USING btree ("site_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "runs_site_project_scope_id_idx"
ON "runs" USING btree ("site_id", "project_scope", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "artifacts_site_id_idx"
ON "artifacts" USING btree ("site_id", "id");
--> statement-breakpoint
DO $$
DECLARE
  resource_table text;
  constraint_name text;
BEGIN
  FOREACH resource_table IN ARRAY ARRAY['agents', 'connectors', 'threads', 'runs', 'artifacts']
  LOOP
    constraint_name := resource_table || '_site_project_id_projects_site_id_fk';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = to_regclass(current_schema() || '.' || resource_table)
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (site_id, project_id) REFERENCES projects(site_id, id)',
        resource_table,
        constraint_name
      );
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'threads_site_agent_id_agents_site_id_fk'
  ) THEN
    ALTER TABLE "threads" ADD CONSTRAINT "threads_site_agent_id_agents_site_id_fk"
      FOREIGN KEY ("site_id", "agent_id") REFERENCES "agents"("site_id", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'threads_site_project_scope_agent_id_agents_scope_id_fk'
  ) THEN
    ALTER TABLE "threads"
      ADD CONSTRAINT "threads_site_project_scope_agent_id_agents_scope_id_fk"
      FOREIGN KEY ("site_id", "project_scope", "agent_id")
      REFERENCES "agents"("site_id", "project_scope", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'runs_site_thread_id_threads_site_id_fk'
  ) THEN
    ALTER TABLE "runs" ADD CONSTRAINT "runs_site_thread_id_threads_site_id_fk"
      FOREIGN KEY ("site_id", "thread_id") REFERENCES "threads"("site_id", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'runs_site_project_scope_thread_id_threads_scope_id_fk'
  ) THEN
    ALTER TABLE "runs"
      ADD CONSTRAINT "runs_site_project_scope_thread_id_threads_scope_id_fk"
      FOREIGN KEY ("site_id", "project_scope", "thread_id")
      REFERENCES "threads"("site_id", "project_scope", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_site_run_id_runs_site_id_fk'
  ) THEN
    ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_site_run_id_runs_site_id_fk"
      FOREIGN KEY ("site_id", "run_id") REFERENCES "runs"("site_id", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artifacts_site_project_scope_run_id_runs_scope_id_fk'
  ) THEN
    ALTER TABLE "artifacts"
      ADD CONSTRAINT "artifacts_site_project_scope_run_id_runs_scope_id_fk"
      FOREIGN KEY ("site_id", "project_scope", "run_id")
      REFERENCES "runs"("site_id", "project_scope", "id");
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_site_idx" ON "agents" USING btree ("site_id");
CREATE INDEX IF NOT EXISTS "connectors_site_idx" ON "connectors" USING btree ("site_id");
CREATE INDEX IF NOT EXISTS "threads_site_idx" ON "threads" USING btree ("site_id");
CREATE INDEX IF NOT EXISTS "runs_site_idx" ON "runs" USING btree ("site_id");
CREATE INDEX IF NOT EXISTS "artifacts_site_idx" ON "artifacts" USING btree ("site_id");
