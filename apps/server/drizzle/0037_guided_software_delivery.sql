ALTER TABLE "threads"
ADD COLUMN "workflow" text DEFAULT 'general' NOT NULL;

ALTER TABLE "threads"
ADD CONSTRAINT "threads_workflow_check"
CHECK ("workflow" IN ('general', 'software_delivery'));

CREATE INDEX "threads_workflow_idx" ON "threads" USING btree ("workflow");

CREATE TABLE "project_repositories" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "root_path" text NOT NULL,
  "base_ref" text DEFAULT 'HEAD' NOT NULL,
  "test_commands" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "network_policy" text DEFAULT 'none' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_repositories_site_project_fk"
    FOREIGN KEY ("site_id", "project_id") REFERENCES "projects"("site_id", "id") ON DELETE CASCADE,
  CONSTRAINT "project_repositories_network_policy_check"
    CHECK ("network_policy" IN ('none', 'host')),
  CONSTRAINT "project_repositories_test_commands_array_check"
    CHECK (jsonb_typeof("test_commands") = 'array')
);
CREATE UNIQUE INDEX "project_repositories_site_project_idx"
  ON "project_repositories" ("site_id", "project_id");

CREATE TABLE "guided_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "author_user_id" text NOT NULL REFERENCES "console_users"("id"),
  "idempotency_key" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "current_revision_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guided_tasks_site_project_fk"
    FOREIGN KEY ("site_id", "project_id") REFERENCES "projects"("site_id", "id"),
  CONSTRAINT "guided_tasks_owner_site_membership_fk"
    FOREIGN KEY ("owner_user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id"),
  CONSTRAINT "guided_tasks_status_check"
    CHECK ("status" IN ('draft', 'ready', 'running', 'awaiting_validation', 'completed', 'failed'))
);
CREATE UNIQUE INDEX "guided_tasks_site_id_idx" ON "guided_tasks" ("site_id", "id");
CREATE UNIQUE INDEX "guided_tasks_project_scope_idx"
  ON "guided_tasks" ("site_id", "project_id", "id");
CREATE UNIQUE INDEX "guided_tasks_idempotency_idx"
  ON "guided_tasks" ("site_id", "idempotency_key");
CREATE INDEX "guided_tasks_owner_idx" ON "guided_tasks" ("site_id", "owner_user_id");

CREATE TABLE "guided_task_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "task_id" text NOT NULL,
  "number" integer NOT NULL,
  "author_user_id" text NOT NULL REFERENCES "console_users"("id"),
  "idempotency_key" text NOT NULL,
  "content" jsonb NOT NULL,
  "content_sha256" text NOT NULL,
  "state" text DEFAULT 'draft' NOT NULL,
  "requires_technical_approval" boolean DEFAULT false NOT NULL,
  "validated_at" timestamp with time zone,
  "validated_by_user_id" text REFERENCES "console_users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guided_task_revisions_task_scope_fk"
    FOREIGN KEY ("site_id", "project_id", "task_id")
    REFERENCES "guided_tasks"("site_id", "project_id", "id") ON DELETE CASCADE,
  CONSTRAINT "guided_task_revisions_state_check"
    CHECK ("state" IN ('draft', 'validated')),
  CONSTRAINT "guided_task_revisions_validation_check"
    CHECK (("state" = 'draft' AND "validated_at" IS NULL AND "validated_by_user_id" IS NULL)
      OR ("state" = 'validated' AND "validated_at" IS NOT NULL AND "validated_by_user_id" IS NOT NULL)),
  CONSTRAINT "guided_task_revisions_number_check" CHECK ("number" > 0),
  CONSTRAINT "guided_task_revisions_sha_check" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "guided_task_revisions_site_task_id_idx"
  ON "guided_task_revisions" ("site_id", "task_id", "id");
CREATE UNIQUE INDEX "guided_task_revisions_task_number_idx"
  ON "guided_task_revisions" ("site_id", "task_id", "number");
CREATE UNIQUE INDEX "guided_task_revisions_idempotency_idx"
  ON "guided_task_revisions" ("site_id", "idempotency_key");

ALTER TABLE "guided_tasks"
  ADD CONSTRAINT "guided_tasks_current_revision_fk"
  FOREIGN KEY ("site_id", "id", "current_revision_id")
  REFERENCES "guided_task_revisions"("site_id", "task_id", "id");

CREATE FUNCTION "guided_task_revisions_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GUIDED_TASK_REVISION_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "guided_task_revisions_immutable"
  BEFORE UPDATE ON "guided_task_revisions"
  FOR EACH ROW EXECUTE FUNCTION "guided_task_revisions_immutable"();

CREATE TABLE "guided_task_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "task_id" text NOT NULL,
  "revision_id" text NOT NULL,
  "author_user_id" text NOT NULL REFERENCES "console_users"("id"),
  "attempt_number" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "repository_path" text NOT NULL,
  "base_commit" text NOT NULL,
  "branch_name" text NOT NULL,
  "sandbox_path" text,
  "hermes_session_id" text,
  "hermes_output" text,
  "error" text,
  "tests_passed" boolean,
  "evidence_complete" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "cleaned_up_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guided_task_attempts_project_scope_fk"
    FOREIGN KEY ("site_id", "project_id", "task_id")
    REFERENCES "guided_tasks"("site_id", "project_id", "id") ON DELETE CASCADE,
  CONSTRAINT "guided_task_attempts_task_revision_fk"
    FOREIGN KEY ("site_id", "task_id", "revision_id")
    REFERENCES "guided_task_revisions"("site_id", "task_id", "id"),
  CONSTRAINT "guided_task_attempts_status_check"
    CHECK ("status" IN ('pending', 'running', 'awaiting_functional_validation', 'completed', 'failed')),
  CONSTRAINT "guided_task_attempts_number_check" CHECK ("attempt_number" > 0),
  CONSTRAINT "guided_task_attempts_base_commit_check" CHECK ("base_commit" ~ '^[0-9a-f]{40,64}$')
);
CREATE UNIQUE INDEX "guided_task_attempts_site_task_id_idx"
  ON "guided_task_attempts" ("site_id", "task_id", "id");
CREATE UNIQUE INDEX "guided_task_attempts_task_number_idx"
  ON "guided_task_attempts" ("site_id", "task_id", "attempt_number");
CREATE UNIQUE INDEX "guided_task_attempts_idempotency_idx"
  ON "guided_task_attempts" ("site_id", "idempotency_key");
CREATE INDEX "guided_task_attempts_status_idx" ON "guided_task_attempts" ("site_id", "status");

CREATE TABLE "guided_task_decisions" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL,
  "task_id" text NOT NULL,
  "revision_id" text NOT NULL,
  "attempt_id" text,
  "decision_number" integer NOT NULL,
  "kind" text NOT NULL,
  "outcome" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "console_users"("id"),
  "actor_role" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guided_task_decisions_task_revision_fk"
    FOREIGN KEY ("site_id", "task_id", "revision_id")
    REFERENCES "guided_task_revisions"("site_id", "task_id", "id"),
  CONSTRAINT "guided_task_decisions_attempt_fk"
    FOREIGN KEY ("site_id", "task_id", "attempt_id")
    REFERENCES "guided_task_attempts"("site_id", "task_id", "id"),
  CONSTRAINT "guided_task_decisions_kind_check"
    CHECK ("kind" IN ('plan', 'technical', 'tool', 'functional')),
  CONSTRAINT "guided_task_decisions_outcome_check"
    CHECK ("outcome" IN ('approved', 'rejected')),
  CONSTRAINT "guided_task_decisions_actor_role_check"
    CHECK ("actor_role" IN ('admin', 'operator', 'requester', 'approver', 'auditor')),
  CONSTRAINT "guided_task_decisions_attempt_kind_check"
    CHECK (("kind" = 'functional' AND "attempt_id" IS NOT NULL)
      OR ("kind" <> 'functional' AND "attempt_id" IS NULL)),
  CONSTRAINT "guided_task_decisions_number_check" CHECK ("decision_number" > 0)
);
CREATE UNIQUE INDEX "guided_task_decisions_idempotency_idx"
  ON "guided_task_decisions" ("site_id", "idempotency_key");
CREATE INDEX "guided_task_decisions_task_idx"
  ON "guided_task_decisions" ("site_id", "task_id", "created_at");
CREATE UNIQUE INDEX "guided_task_decisions_task_number_idx"
  ON "guided_task_decisions" ("site_id", "task_id", "decision_number");

CREATE TABLE "guided_task_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "task_id" text NOT NULL,
  "attempt_id" text NOT NULL,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "payload" jsonb NOT NULL,
  "checksum_sha256" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guided_task_evidence_attempt_fk"
    FOREIGN KEY ("site_id", "task_id", "attempt_id")
    REFERENCES "guided_task_attempts"("site_id", "task_id", "id") ON DELETE CASCADE,
  CONSTRAINT "guided_task_evidence_kind_check"
    CHECK ("kind" IN ('diff', 'files', 'tests', 'commands', 'preview', 'summary', 'hermes_output', 'cleanup')),
  CONSTRAINT "guided_task_evidence_sha_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "guided_task_evidence_attempt_idx"
  ON "guided_task_evidence" ("site_id", "attempt_id", "created_at");
