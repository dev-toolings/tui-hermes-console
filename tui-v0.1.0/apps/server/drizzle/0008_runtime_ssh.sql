ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "transport" text DEFAULT 'direct' NOT NULL;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "ssh_host" text;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "ssh_port" integer DEFAULT 22 NOT NULL;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "ssh_user" text;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "encrypted_ssh_password" text;
