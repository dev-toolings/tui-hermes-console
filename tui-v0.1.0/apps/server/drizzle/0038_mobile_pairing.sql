CREATE TABLE "console_mobile_pairings" (
  "code_hash" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "console_users"("id") ON DELETE CASCADE,
  "site_id" text,
  "mandate_id" text REFERENCES "msp_mandates"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "console_mobile_pairings_user_site_membership_fk"
    FOREIGN KEY ("user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id") ON DELETE CASCADE,
  CONSTRAINT "console_mobile_pairings_site_mandate_fk"
    FOREIGN KEY ("site_id", "mandate_id") REFERENCES "msp_mandates"("site_id", "id") ON DELETE SET NULL
);

CREATE INDEX "console_mobile_pairings_expires_idx"
  ON "console_mobile_pairings" ("expires_at");
