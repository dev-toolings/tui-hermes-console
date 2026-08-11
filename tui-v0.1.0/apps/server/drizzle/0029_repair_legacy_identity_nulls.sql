-- Repair installations where the historical password user survived with a
-- nullable Google identity despite migration 0014 being recorded as applied.
UPDATE "console_users"
SET "email" = 'legacy+' || "id" || '@legacy.invalid'
WHERE "email" IS NULL;
--> statement-breakpoint
UPDATE "console_users"
SET "google_subject" = 'legacy:' || "id"
WHERE "google_subject" IS NULL;
--> statement-breakpoint
ALTER TABLE "console_users" ALTER COLUMN "email" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "console_users" ALTER COLUMN "google_subject" SET NOT NULL;
