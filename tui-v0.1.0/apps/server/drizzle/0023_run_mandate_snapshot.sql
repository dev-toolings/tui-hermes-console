-- US-G2-004 — snapshot d'autorisation sur les missions.
--
-- Les anciennes missions restent lisibles (colonnes nullable). Toute nouvelle
-- mission créée dans un contexte MSP conserve le mandat et les organisations
-- qui ont autorisé son lancement, afin qu'une révocation puisse aussi agir
-- après redémarrage du processus Console.

ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "mandate_id" text
    REFERENCES "msp_mandates"("id") ON DELETE SET NULL;
ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "operator_organization_id" text
    REFERENCES "organizations"("id");
ALTER TABLE "runs"
  ADD COLUMN IF NOT EXISTS "client_organization_id" text
    REFERENCES "organizations"("id");

CREATE INDEX IF NOT EXISTS "runs_site_mandate_status_idx"
  ON "runs" ("site_id", "mandate_id", "status");
