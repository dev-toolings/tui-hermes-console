CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"instructions" text NOT NULL,
	"model" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"name" text DEFAULT 'Hermes' NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"detected_version" text,
	"capabilities" jsonb,
	"last_health_status" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_idx" ON "agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agents_archived_idx" ON "agents" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "threads_agent_idx" ON "threads" USING btree ("agent_id");
