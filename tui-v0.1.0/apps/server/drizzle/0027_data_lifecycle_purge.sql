-- US-G1-006E — durable single-use purge state and retryable filesystem cleanup.
ALTER TABLE "data_lifecycle_previews"
  ADD COLUMN IF NOT EXISTS "purged_at" timestamp with time zone;
ALTER TABLE "data_lifecycle_previews"
  ADD COLUMN IF NOT EXISTS "cleanup_pending" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "data_lifecycle_previews_site_purged_idx"
  ON "data_lifecycle_previews" ("site_id", "purged_at");
