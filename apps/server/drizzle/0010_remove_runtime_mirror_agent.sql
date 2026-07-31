CREATE TABLE "runtime_model_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" text,
	"model" text,
	"reasoning_effort" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "runtime_model_settings" ("id", "provider", "model", "reasoning_effort")
SELECT 'default', "provider", "model", "reasoning_effort"
FROM "agents"
WHERE "id" = 'agent_hermes_runtime'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
DELETE FROM "agents" WHERE "id" = 'agent_hermes_runtime';
