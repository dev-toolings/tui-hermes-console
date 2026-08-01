-- US-G1-006 — versioned site retention policy and persisted dry-run previews.
-- No executor or destructive operation is introduced by this migration.

CREATE TABLE IF NOT EXISTS "site_data_lifecycle_policies" (
  "site_id" text PRIMARY KEY REFERENCES "sites"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "retention_days" integer NOT NULL,
  "legal_hold_enabled" boolean NOT NULL DEFAULT false,
  "legal_hold_reason" text,
  "updated_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "site_data_lifecycle_retention_days_check" CHECK ("retention_days" BETWEEN 1 AND 3650),
  CONSTRAINT "site_data_lifecycle_version_check" CHECK ("version" > 0),
  CONSTRAINT "site_data_lifecycle_hold_reason_check" CHECK (
    NOT "legal_hold_enabled" OR btrim("legal_hold_reason") <> ''
  ),
  CONSTRAINT "site_data_lifecycle_policy_author_fk"
    FOREIGN KEY ("updated_by_user_id", "site_id")
    REFERENCES "site_memberships"("user_id", "site_id")
);

CREATE TABLE IF NOT EXISTS "data_lifecycle_previews" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "policy_version" integer NOT NULL,
  "retention_days" integer NOT NULL,
  "cutoff_at" timestamp with time zone NOT NULL,
  "manifest_sha256" text NOT NULL,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "data_lifecycle_previews_manifest_hash_check" CHECK ("manifest_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "data_lifecycle_preview_author_fk"
    FOREIGN KEY ("created_by_user_id", "site_id")
    REFERENCES "site_memberships"("user_id", "site_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_lifecycle_previews_site_id_idx"
  ON "data_lifecycle_previews" ("site_id", "id");
CREATE INDEX IF NOT EXISTS "data_lifecycle_previews_site_created_idx"
  ON "data_lifecycle_previews" ("site_id", "created_at");

CREATE TABLE IF NOT EXISTS "data_lifecycle_preview_items" (
  "preview_id" text NOT NULL REFERENCES "data_lifecycle_previews"("id") ON DELETE CASCADE,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "resource_type" text NOT NULL DEFAULT 'thread',
  "resource_id" text NOT NULL,
  "activity_at" timestamp with time zone NOT NULL,
  "run_count" integer NOT NULL,
  "message_count" integer NOT NULL,
  "artifact_count" integer NOT NULL,
  "artifact_bytes" bigint NOT NULL,
  "run_ids" jsonb NOT NULL,
  "artifact_hashes" jsonb NOT NULL,
  PRIMARY KEY ("preview_id", "resource_type", "resource_id"),
  CONSTRAINT "data_lifecycle_preview_items_preview_site_fk"
    FOREIGN KEY ("site_id", "preview_id")
    REFERENCES "data_lifecycle_previews"("site_id", "id")
);
CREATE INDEX IF NOT EXISTS "data_lifecycle_preview_items_site_idx"
  ON "data_lifecycle_preview_items" ("site_id", "resource_id");
