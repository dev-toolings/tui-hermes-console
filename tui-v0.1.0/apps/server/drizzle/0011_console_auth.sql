-- Une installation après 0010 peut déjà porter la table admin/password
-- historique. Ne jamais la remplacer : 0014 ajoute les colonnes Google et
-- 0015 détend password_hash sans supprimer le compte existant.
CREATE TABLE IF NOT EXISTS "console_users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "google_subject" text NOT NULL,
  "display_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "console_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "console_users"("id") ON DELETE CASCADE,
  "csrf_token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "console_sessions_expires_idx" ON "console_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE "console_auth_transactions" (
  "state_hash" text PRIMARY KEY NOT NULL,
  "nonce" text NOT NULL,
  "code_verifier" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "console_auth_transactions_expires_idx" ON "console_auth_transactions" USING btree ("expires_at");
