CREATE TABLE "runtime_update_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"runtime_id" text DEFAULT 'default' NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"phase" text DEFAULT 'preflight' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text NOT NULL,
	"method" text NOT NULL,
	"expected_revision" integer,
	"previous_version" text,
	"target_version" text,
	"target_tag" text NOT NULL,
	"current_version" text,
	"checkpoint" jsonb,
	"error_code" text,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_update_operations_trigger_check" CHECK ("runtime_update_operations"."trigger" IN ('manual', 'automatic')),
	CONSTRAINT "runtime_update_operations_status_check" CHECK ("runtime_update_operations"."status" IN ('queued', 'running', 'succeeded', 'rolled_back', 'failed', 'recovery_required')),
	CONSTRAINT "runtime_update_operations_progress_check" CHECK ("runtime_update_operations"."progress" >= 0 AND "runtime_update_operations"."progress" <= 100)
);
--> statement-breakpoint
ALTER TABLE "runtime_update_operations" ADD CONSTRAINT "runtime_update_operations_runtime_id_runtime_config_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtime_config"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "runtime_update_operations_runtime_idx" ON "runtime_update_operations" USING btree ("runtime_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_update_operations_active_idx" ON "runtime_update_operations" USING btree ("runtime_id") WHERE "runtime_update_operations"."status" IN ('queued', 'running', 'recovery_required');
