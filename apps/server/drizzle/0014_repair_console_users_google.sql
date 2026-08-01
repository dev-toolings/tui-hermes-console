-- Les premières installations avaient un compte admin/password dans cette
-- table. Conserver cette ligne évite une suppression silencieuse, tandis que
-- les nouvelles identités Google reçoivent les champs ci-dessous.
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "email" text;
--> statement-breakpoint
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "google_subject" text;
--> statement-breakpoint
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "display_name" text;
--> statement-breakpoint
-- Une identité password historique ne fournit ni email Google ni subject.
-- Des valeurs réservées et déterministes conservent la ligne sans lui inventer
-- une identité Google utilisable ; le hash historique reste intact en 0015.
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
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "console_users_email_unique"
ON "console_users" USING btree ("email") WHERE "email" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "console_users_google_subject_unique"
ON "console_users" USING btree ("google_subject") WHERE "google_subject" IS NOT NULL;
