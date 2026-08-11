ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "ssh_auth" text DEFAULT 'agent' NOT NULL;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "remote_workdir" text;
