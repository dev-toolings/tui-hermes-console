ALTER TABLE "runtime_config"
  ADD COLUMN IF NOT EXISTS "management_mode" text DEFAULT 'external' NOT NULL;
--> statement-breakpoint
ALTER TABLE "runtime_config"
  ADD COLUMN IF NOT EXISTS "credential_adapter" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "runtime_config"
  ADD COLUMN IF NOT EXISTS "last_credential_rotated_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runtime_credential_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "runtime_id" text NOT NULL REFERENCES "runtime_config"("id") ON DELETE CASCADE,
  "operation" text NOT NULL,
  "adapter" text NOT NULL,
  "status" text NOT NULL,
  "phase" text NOT NULL,
  "expected_revision" integer NOT NULL,
  "candidate_encrypted_token" text,
  "remote_backup_ref" text,
  "confirmation_hash" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "runtime_credential_operations_status_check"
    CHECK ("status" IN ('planned', 'applying', 'verifying', 'succeeded', 'rolled_back', 'failed', 'recovery_required'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_credential_operations_runtime_idx"
  ON "runtime_credential_operations" ("runtime_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runtime_credential_operations_active_idx"
  ON "runtime_credential_operations" ("runtime_id")
  WHERE "status" IN ('planned', 'applying', 'verifying', 'recovery_required');
