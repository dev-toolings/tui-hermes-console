ALTER TABLE "console_sessions" ADD COLUMN IF NOT EXISTS "site_id" text;
--> statement-breakpoint
-- Les utilisateurs antérieurs au modèle de sites conservent leurs droits
-- historiques, mais un utilisateur déjà provisionné ailleurs ne reçoit jamais
-- implicitement le site legacy.
INSERT INTO "site_memberships" ("user_id", "site_id", "role")
SELECT "console_users"."id", 'legacy-default', 'admin'
FROM "console_users"
WHERE NOT EXISTS (
  SELECT 1 FROM "site_memberships"
  WHERE "site_memberships"."user_id" = "console_users"."id"
)
ON CONFLICT ("user_id", "site_id") DO NOTHING;
--> statement-breakpoint
-- Une session n'est auto-liée que lorsque le choix est non ambigu.
UPDATE "console_sessions" AS session
SET "site_id" = membership."site_id"
FROM (
  SELECT "user_id", min("site_id") AS "site_id"
  FROM "site_memberships"
  GROUP BY "user_id"
  HAVING count(*) = 1
) AS membership
WHERE membership."user_id" = session."user_id"
  AND session."site_id" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'console_sessions_user_site_membership_fk'
      AND conrelid = 'console_sessions'::regclass
  ) THEN
    ALTER TABLE "console_sessions"
      ADD CONSTRAINT "console_sessions_user_site_membership_fk"
      FOREIGN KEY ("user_id", "site_id")
      REFERENCES "site_memberships"("user_id", "site_id")
      ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "console_sessions_site_idx"
ON "console_sessions" USING btree ("site_id");
--> statement-breakpoint
-- Le code de cette version fournit désormais site_id sur les cinq chaînes
-- d'écriture. Ces defaults sont retirés en dernier afin qu'aucune nouvelle
-- donnée ne puisse retomber silencieusement dans legacy-default.
ALTER TABLE "agents" ALTER COLUMN "site_id" DROP DEFAULT;
ALTER TABLE "connectors" ALTER COLUMN "site_id" DROP DEFAULT;
ALTER TABLE "threads" ALTER COLUMN "site_id" DROP DEFAULT;
ALTER TABLE "runs" ALTER COLUMN "site_id" DROP DEFAULT;
ALTER TABLE "artifacts" ALTER COLUMN "site_id" DROP DEFAULT;
