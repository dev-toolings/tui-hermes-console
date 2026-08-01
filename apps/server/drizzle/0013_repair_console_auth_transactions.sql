-- Répare les installations où 0011 a été marquée comme appliquée après une
-- création partielle : sans cette table, l'amorçage OIDC échoue avant même la
-- redirection vers Google.
CREATE TABLE IF NOT EXISTS "console_auth_transactions" (
  "state_hash" text PRIMARY KEY NOT NULL,
  "nonce" text NOT NULL,
  "code_verifier" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_auth_transactions_expires_idx"
ON "console_auth_transactions" USING btree ("expires_at");
