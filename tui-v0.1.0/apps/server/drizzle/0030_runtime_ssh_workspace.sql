ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "remote_hermes_workdir" text;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "workspace_status" text DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
UPDATE "runtime_config"
SET "workspace_status" = CASE
  WHEN "transport" <> 'ssh' THEN 'not_required'
  WHEN "remote_workdir" IS NULL OR btrim("remote_workdir") = '' THEN 'required'
  ELSE 'verification_required'
END;
--> statement-breakpoint
ALTER TABLE "runtime_config" DROP CONSTRAINT IF EXISTS "runtime_config_workspace_status_check";
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD CONSTRAINT "runtime_config_workspace_status_check"
CHECK ("workspace_status" IN ('not_required', 'required', 'verification_required', 'ready'));
