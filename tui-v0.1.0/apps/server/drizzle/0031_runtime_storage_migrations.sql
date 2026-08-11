CREATE TABLE IF NOT EXISTS "runtime_storage_migrations" (
  "id" text PRIMARY KEY NOT NULL,
  "runtime_id" text NOT NULL REFERENCES "runtime_config"("id") ON DELETE CASCADE,
  "expected_revision" integer NOT NULL,
  "status" text NOT NULL,
  "phase" text NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "message" text NOT NULL,
  "source_snapshot" jsonb NOT NULL,
  "target_snapshot" jsonb NOT NULL,
  "confirmation_hash" text NOT NULL,
  "source_manifest_sha256" text,
  "target_manifest_sha256" text,
  "rollback_available" boolean DEFAULT false NOT NULL,
  "error_code" text,
  "error_message" text,
  "expires_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "runtime_storage_migrations_status_check"
    CHECK ("status" IN ('planned', 'queued', 'running', 'succeeded', 'rolled_back', 'failed', 'recovery_required')),
  CONSTRAINT "runtime_storage_migrations_progress_check"
    CHECK ("progress" >= 0 AND "progress" <= 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_storage_migrations_runtime_idx"
  ON "runtime_storage_migrations" ("runtime_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runtime_storage_migrations_active_idx"
  ON "runtime_storage_migrations" ("runtime_id")
  WHERE "status" IN ('planned', 'queued', 'running', 'recovery_required');
