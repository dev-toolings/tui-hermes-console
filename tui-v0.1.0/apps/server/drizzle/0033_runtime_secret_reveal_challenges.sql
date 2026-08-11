CREATE TABLE IF NOT EXISTS "runtime_secret_reveal_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "runtime_id" text DEFAULT 'default' NOT NULL,
  "user_id" text NOT NULL REFERENCES "console_users"("id") ON DELETE CASCADE,
  "session_hash" text NOT NULL,
  "secret_name" text DEFAULT 'API_SERVER_KEY' NOT NULL,
  "runtime_version" text NOT NULL,
  "otp_digest" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_sent_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "runtime_secret_reveal_challenges_secret_check"
    CHECK ("secret_name" = 'API_SERVER_KEY'),
  CONSTRAINT "runtime_secret_reveal_challenges_attempts_check"
    CHECK ("attempts" >= 0 AND "attempts" <= 5)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_secret_reveal_challenges_session_idx"
  ON "runtime_secret_reveal_challenges" ("session_hash", "runtime_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_secret_reveal_challenges_expiry_idx"
  ON "runtime_secret_reveal_challenges" ("expires_at");
