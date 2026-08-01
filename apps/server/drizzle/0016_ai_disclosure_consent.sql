-- Le consentement suit l'identité Google, pas l'installation : chaque
-- opérateur doit accepter explicitement la version courante de la notice IA.
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "ai_disclosure_version" text;
--> statement-breakpoint
ALTER TABLE "console_users" ADD COLUMN IF NOT EXISTS "ai_disclosure_accepted_at" timestamp with time zone;
--> statement-breakpoint
-- Les anciennes versions pouvaient marquer le setup terminé sans probe actif.
-- Elles reprennent à l'étape agent afin que la nouvelle transition vérifie
-- réellement le runtime avant de produire une preuve horodatée.
ALTER TABLE "console_setup" ADD COLUMN IF NOT EXISTS "runtime_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "console_setup" ADD COLUMN IF NOT EXISTS "runtime_config_version" text;
--> statement-breakpoint
ALTER TABLE "runtime_config" ADD COLUMN IF NOT EXISTS "config_revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE "console_setup"
SET "step" = 'agent',
    "completed_at" = NULL,
    "runtime_verified_at" = NULL,
    "runtime_config_version" = NULL,
    "updated_at" = now()
WHERE "step" = 'completed'
  AND "runtime_verified_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "console_setup"
ADD CONSTRAINT "console_setup_completed_proof_check"
CHECK (
  "step" <> 'completed'
  OR (
    "completed_at" IS NOT NULL
    AND "runtime_verified_at" IS NOT NULL
    AND "runtime_config_version" IS NOT NULL
  )
);
