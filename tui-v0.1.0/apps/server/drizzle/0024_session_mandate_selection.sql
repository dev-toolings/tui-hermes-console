-- US-G2-004 — sélection explicite du mandat MSP dans la session.
--
-- La sélection reste révocable et revalidée contre les affectations actives à
-- chaque requête. Une session historique sans mandat sélectionné conserve le
-- comportement existant et ne choisit jamais arbitrairement entre plusieurs
-- mandats.

ALTER TABLE "console_sessions"
  ADD COLUMN IF NOT EXISTS "mandate_id" text
    REFERENCES "msp_mandates"("id") ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'msp_mandates_site_id_unique'
  ) THEN
    ALTER TABLE "msp_mandates"
      ADD CONSTRAINT "msp_mandates_site_id_unique" UNIQUE ("site_id", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'console_sessions_site_mandate_fk'
  ) THEN
    ALTER TABLE "console_sessions"
      ADD CONSTRAINT "console_sessions_site_mandate_fk"
      FOREIGN KEY ("site_id", "mandate_id")
      REFERENCES "msp_mandates"("site_id", "id")
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "console_sessions_mandate_idx"
  ON "console_sessions" ("mandate_id");
