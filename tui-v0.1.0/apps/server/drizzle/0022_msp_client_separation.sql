-- US-G2-004 — identité organisationnelle et mandat MSP/client.
--
-- Cette migration reste volontairement coarse : un mandat peut couvrir un site
-- entier ou un projet, mais aucun outil, chemin, modèle ou budget n'est évalué
-- ici (G2-005 hors périmètre). L'authentification reste Google-only (G2-006).

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "organizations_kind_check" CHECK ("kind" IN ('client', 'msp')),
  CONSTRAINT "organizations_slug_unique" UNIQUE ("slug")
);

CREATE TABLE IF NOT EXISTS "organization_memberships" (
  "user_id" text NOT NULL REFERENCES "console_users"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "organization_id")
);
CREATE INDEX IF NOT EXISTS "organization_memberships_organization_idx"
  ON "organization_memberships" ("organization_id");

ALTER TABLE "sites"
  ADD COLUMN IF NOT EXISTS "client_organization_id" text;
ALTER TABLE "site_memberships"
  ADD COLUMN IF NOT EXISTS "organization_id" text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sites") THEN
    -- 0017 crée systématiquement un site legacy vide. Pour ce seul cas
    -- déterministe, une organisation cliente locale est créée; aucune
    -- membership operator n'est convertie en mandat MSP. Toute installation
    -- legacy réelle (operator, plusieurs sites ou ressources) doit fournir un
    -- bootstrap explicite et échoue fermement en son absence.
    IF to_regclass('msp_client_bootstrap') IS NULL
      AND (SELECT count(*) FROM "sites") = 1
      AND EXISTS (SELECT 1 FROM "sites" WHERE "id" = 'legacy-default')
      AND NOT EXISTS (
        SELECT 1 FROM "site_memberships"
        WHERE "site_id" = 'legacy-default' AND "role" = 'operator'
      )
    THEN
      INSERT INTO "organizations" ("id", "name", "slug", "kind")
      VALUES ('org_client_legacy_default', 'Legacy client', 'client-legacy-default', 'client')
      ON CONFLICT ("id") DO NOTHING;
      UPDATE "sites"
      SET "client_organization_id" = 'org_client_legacy_default'
      WHERE "id" = 'legacy-default';
      UPDATE "site_memberships"
      SET "organization_id" = 'org_client_legacy_default'
      WHERE "site_id" = 'legacy-default';
    ELSIF to_regclass('msp_client_bootstrap') IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'MSP_CLIENT_BOOTSTRAP_REQUIRED',
        DETAIL = 'Create msp_client_bootstrap and msp_organization_bootstrap explicitly before migrating existing sites.';
    ELSE
      IF to_regclass('msp_organization_bootstrap') IS NOT NULL THEN
        EXECUTE $sql$
          INSERT INTO "organizations" ("id", "name", "slug", "kind")
          SELECT "id", "name", "slug", "kind"
          FROM "msp_organization_bootstrap"
          ON CONFLICT ("id") DO UPDATE
          SET "name" = EXCLUDED."name", "slug" = EXCLUDED."slug", "kind" = EXCLUDED."kind"
        $sql$;
      END IF;
      IF EXISTS (
        SELECT 1
        FROM "msp_client_bootstrap" bootstrap
        LEFT JOIN "organizations" org ON org."id" = bootstrap."client_organization_id"
        WHERE org."id" IS NULL
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'check_violation',
          MESSAGE = 'MSP_ORGANIZATION_BOOTSTRAP_REQUIRED';
      END IF;
      UPDATE "sites" AS site
      SET "client_organization_id" = bootstrap."client_organization_id"
      FROM "msp_client_bootstrap" bootstrap
      WHERE bootstrap."site_id" = site."id";
      IF EXISTS (
        SELECT 1 FROM "sites" WHERE "client_organization_id" IS NULL
      ) OR (
        SELECT count(*) FROM "msp_client_bootstrap"
      ) <> (SELECT count(*) FROM "sites") THEN
        RAISE EXCEPTION USING
          ERRCODE = 'check_violation',
          MESSAGE = 'MSP_CLIENT_BOOTSTRAP_INCOMPLETE';
      END IF;
    END IF;
  END IF;
END
$$;

ALTER TABLE "sites"
  ALTER COLUMN "client_organization_id" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_client_organization_fk'
  ) THEN
    ALTER TABLE "sites" ADD CONSTRAINT "sites_client_organization_fk"
      FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id");
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "msp_mandates" (
  "id" text PRIMARY KEY,
  "operator_organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "client_organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "project_id" text,
  "starts_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "msp_mandates_distinct_organizations_check"
    CHECK ("operator_organization_id" <> "client_organization_id"),
  CONSTRAINT "msp_mandates_time_window_check"
    CHECK ("expires_at" IS NULL OR "expires_at" > "starts_at")
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'msp_mandates_site_project_fk'
  ) THEN
    ALTER TABLE "msp_mandates" ADD CONSTRAINT "msp_mandates_site_project_fk"
      FOREIGN KEY ("site_id", "project_id") REFERENCES "projects"("site_id", "id");
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS "msp_mandates_scope_idx"
  ON "msp_mandates" ("site_id", "project_id", "operator_organization_id");

CREATE TABLE IF NOT EXISTS "msp_mandate_assignments" (
  "mandate_id" text NOT NULL REFERENCES "msp_mandates"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "console_users"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("mandate_id", "user_id")
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'msp_mandate_assignments_user_organization_fk'
  ) THEN
    ALTER TABLE "msp_mandate_assignments"
      ADD CONSTRAINT "msp_mandate_assignments_user_organization_fk"
      FOREIGN KEY ("user_id", "organization_id")
      REFERENCES "organization_memberships"("user_id", "organization_id");
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS "msp_mandate_assignments_user_idx"
  ON "msp_mandate_assignments" ("user_id", "organization_id");

DO $$
BEGIN
  IF to_regclass('msp_membership_bootstrap') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE "site_memberships" AS membership
      SET "organization_id" = bootstrap."organization_id"
      FROM "msp_membership_bootstrap" bootstrap
      WHERE bootstrap."user_id" = membership."user_id"
        AND bootstrap."site_id" = membership."site_id"
    $sql$;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "site_memberships" WHERE "organization_id" IS NULL)
    AND to_regclass('msp_membership_bootstrap') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'MSP_MEMBERSHIP_BOOTSTRAP_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM "site_memberships" WHERE "organization_id" IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'MSP_MEMBERSHIP_BOOTSTRAP_INCOMPLETE';
  END IF;
END
$$;

INSERT INTO "organization_memberships" ("user_id", "organization_id")
SELECT DISTINCT "user_id", "organization_id"
FROM "site_memberships"
WHERE "organization_id" IS NOT NULL
ON CONFLICT ("user_id", "organization_id") DO NOTHING;

ALTER TABLE "site_memberships"
  ALTER COLUMN "organization_id" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_memberships_organization_fk'
  ) THEN
    ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_organization_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_memberships_user_organization_membership_fk'
  ) THEN
    ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_user_organization_membership_fk"
      FOREIGN KEY ("user_id", "organization_id")
      REFERENCES "organization_memberships"("user_id", "organization_id");
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "validate_msp_mandate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  operator_kind text;
  client_kind text;
  site_client_id text;
BEGIN
  SELECT "kind" INTO operator_kind FROM "organizations" WHERE "id" = NEW."operator_organization_id";
  SELECT "kind" INTO client_kind FROM "organizations" WHERE "id" = NEW."client_organization_id";
  SELECT "client_organization_id" INTO site_client_id FROM "sites" WHERE "id" = NEW."site_id";
  IF operator_kind <> 'msp' OR client_kind <> 'client' OR site_client_id IS DISTINCT FROM NEW."client_organization_id" THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'MSP_MANDATE_ORGANIZATION_INVALID';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS "msp_mandates_organization_guard" ON "msp_mandates";
CREATE TRIGGER "msp_mandates_organization_guard"
  BEFORE INSERT OR UPDATE OF "operator_organization_id", "client_organization_id", "site_id"
  ON "msp_mandates" FOR EACH ROW EXECUTE FUNCTION "validate_msp_mandate"();

CREATE OR REPLACE FUNCTION "validate_site_membership_organization"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  org_kind text;
  client_id text;
BEGIN
  SELECT "kind" INTO org_kind FROM "organizations" WHERE "id" = NEW."organization_id";
  SELECT "client_organization_id" INTO client_id FROM "sites" WHERE "id" = NEW."site_id";
  IF org_kind IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'SITE_MEMBERSHIP_ORGANIZATION_INVALID';
  END IF;
  IF NEW."role" IN ('admin', 'requester', 'approver', 'auditor')
    AND NEW."organization_id" IS DISTINCT FROM client_id THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'CLIENT_MEMBER_ORGANIZATION_INVALID';
  END IF;
  IF NEW."role" = 'operator' AND org_kind <> 'msp' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'MSP_MEMBER_ORGANIZATION_INVALID';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS "site_memberships_z_organization_guard" ON "site_memberships";
CREATE TRIGGER "site_memberships_z_organization_guard"
  BEFORE INSERT OR UPDATE OF "organization_id", "role", "site_id"
  ON "site_memberships" FOR EACH ROW EXECUTE FUNCTION "validate_site_membership_organization"();

CREATE INDEX IF NOT EXISTS "sites_client_organization_idx"
  ON "sites" ("client_organization_id");
CREATE INDEX IF NOT EXISTS "site_memberships_organization_idx"
  ON "site_memberships" ("organization_id", "site_id");

-- Le ledger conserve ses enveloppes historiques v1 : les nouvelles écritures
-- portent le snapshot organisationnel v2, sans réécrire ni re-hasher l'historique.
ALTER TABLE "audit_ledger_entries"
  ADD COLUMN IF NOT EXISTS "actor_organization_id" text,
  ADD COLUMN IF NOT EXISTS "client_organization_id" text,
  ADD COLUMN IF NOT EXISTS "mandate_id" text,
  ADD COLUMN IF NOT EXISTS "envelope_version" integer NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_ledger_actor_organization_fk'
  ) THEN
    ALTER TABLE "audit_ledger_entries" ADD CONSTRAINT "audit_ledger_actor_organization_fk"
      FOREIGN KEY ("actor_organization_id") REFERENCES "organizations"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_ledger_client_organization_fk'
  ) THEN
    ALTER TABLE "audit_ledger_entries" ADD CONSTRAINT "audit_ledger_client_organization_fk"
      FOREIGN KEY ("client_organization_id") REFERENCES "organizations"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_ledger_mandate_fk'
  ) THEN
    ALTER TABLE "audit_ledger_entries" ADD CONSTRAINT "audit_ledger_mandate_fk"
      FOREIGN KEY ("mandate_id") REFERENCES "msp_mandates"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_ledger_envelope_version_check'
  ) THEN
    ALTER TABLE "audit_ledger_entries" ADD CONSTRAINT "audit_ledger_envelope_version_check"
      CHECK ("envelope_version" IN (1, 2));
  END IF;
END
$$;

-- Le trigger de chaîne est remplacé en v2 : SECURITY DEFINER ne doit pas
-- permettre à un appelant runtime de forger le snapshot organisationnel.
CREATE OR REPLACE FUNCTION "advance_audit_ledger_head"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_sequence bigint;
  expected_previous_hash text;
  membership_organization_id text;
  site_client_organization_id text;
BEGIN
  SELECT sm."organization_id", site."client_organization_id"
  INTO membership_organization_id, site_client_organization_id
  FROM public."site_memberships" sm
  JOIN public."sites" site ON site."id" = sm."site_id"
  WHERE sm."user_id" = NEW."actor_user_id"
    AND sm."site_id" = NEW."actor_site_id"
    AND sm."role" = NEW."actor_role";
  IF membership_organization_id IS NULL THEN
    RAISE EXCEPTION 'audit_ledger_actor_membership_missing'
      USING ERRCODE = '23503', CONSTRAINT = 'audit_ledger_actor_membership_check';
  END IF;
  IF NEW."envelope_version" = 2 THEN
    IF NEW."actor_organization_id" IS NULL
      OR NEW."client_organization_id" IS NULL
      OR NEW."actor_organization_id" IS DISTINCT FROM membership_organization_id
      OR NEW."client_organization_id" IS DISTINCT FROM site_client_organization_id
    THEN
      RAISE EXCEPTION 'audit_ledger_organization_snapshot_invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'audit_ledger_organization_snapshot_check';
    END IF;
    IF NEW."actor_role" <> 'operator' THEN
      IF NEW."actor_organization_id" IS DISTINCT FROM NEW."client_organization_id"
        OR NEW."mandate_id" IS NOT NULL
      THEN
        RAISE EXCEPTION 'audit_ledger_client_mandate_invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'audit_ledger_client_mandate_check';
      END IF;
    ELSIF NOT (
      NEW."decision" = 'denied'
      AND NEW."mandate_id" IS NULL
      AND NEW."reason_code" IN (
        'MSP_MANDATE_REQUIRED',
        'MSP_ORGANIZATION_REQUIRED'
      )
    ) AND (NEW."mandate_id" IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public."msp_mandates" mandate
      JOIN public."msp_mandate_assignments" assignment
        ON assignment."mandate_id" = mandate."id"
       AND assignment."user_id" = NEW."actor_user_id"
       AND assignment."organization_id" = NEW."actor_organization_id"
      WHERE mandate."id" = NEW."mandate_id"
        AND mandate."site_id" = NEW."actor_site_id"
        AND mandate."operator_organization_id" = NEW."actor_organization_id"
        AND mandate."client_organization_id" = NEW."client_organization_id"
        AND mandate."starts_at" <= now()
        AND (mandate."expires_at" IS NULL OR mandate."expires_at" > now())
        AND mandate."revoked_at" IS NULL
        AND assignment."revoked_at" IS NULL
        AND (assignment."expires_at" IS NULL OR assignment."expires_at" > now())
    )) THEN
      RAISE EXCEPTION 'audit_ledger_operator_mandate_invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'audit_ledger_operator_mandate_check';
    END IF;
  END IF;
  INSERT INTO public.audit_ledger_heads (target_site_id)
  VALUES (NEW.target_site_id)
  ON CONFLICT (target_site_id) DO NOTHING;
  SELECT next_sequence, last_entry_hash
  INTO expected_sequence, expected_previous_hash
  FROM public.audit_ledger_heads
  WHERE target_site_id = NEW.target_site_id
  FOR UPDATE;
  IF NEW.sequence IS DISTINCT FROM expected_sequence THEN
    RAISE EXCEPTION 'audit_ledger_sequence_out_of_order'
      USING ERRCODE = '23514', CONSTRAINT = 'audit_ledger_sequence_chain_check';
  END IF;
  IF NEW.previous_hash IS DISTINCT FROM expected_previous_hash THEN
    RAISE EXCEPTION 'audit_ledger_previous_hash_mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'audit_ledger_sequence_chain_check';
  END IF;
  UPDATE public.audit_ledger_heads
  SET next_sequence = expected_sequence + 1,
      last_entry_hash = NEW.entry_hash,
      updated_at = now()
  WHERE target_site_id = NEW.target_site_id;
  RETURN NEW;
END
$$;
ALTER FUNCTION public.advance_audit_ledger_head() SECURITY DEFINER;

-- 0019 expose une fonction SECURITY DEFINER à 18 paramètres. On remplace
-- explicitement sa signature afin que le service v2 ne puisse pas retomber sur
-- une insertion sans attribution organisationnelle.
DROP FUNCTION IF EXISTS public.append_audit_ledger_entry(
  text, text, text, text, text, text, text, text, text, text, jsonb, jsonb,
  text, timestamp with time zone, timestamp with time zone, bigint, text, text
);
CREATE OR REPLACE FUNCTION public.append_audit_ledger_entry(
  p_event_id text,
  p_actor_site_id text,
  p_target_site_id text,
  p_actor_user_id text,
  p_actor_role text,
  p_actor_organization_id text,
  p_client_organization_id text,
  p_mandate_id text,
  p_envelope_version integer,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_decision text,
  p_reason_code text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_correlation_id text,
  p_occurred_at timestamp with time zone,
  p_recorded_at timestamp with time zone,
  p_sequence bigint,
  p_previous_hash text,
  p_entry_hash text
)
RETURNS public.audit_ledger_entries
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.audit_ledger_entries (
    event_id, actor_site_id, target_site_id, actor_user_id, actor_role,
    actor_organization_id, client_organization_id, mandate_id, envelope_version,
    action, resource_type, resource_id, decision, reason_code, before_state,
    after_state, correlation_id, occurred_at, recorded_at, sequence,
    previous_hash, entry_hash
  ) VALUES (
    p_event_id, p_actor_site_id, p_target_site_id, p_actor_user_id, p_actor_role,
    p_actor_organization_id, p_client_organization_id, p_mandate_id,
    p_envelope_version, p_action, p_resource_type, p_resource_id, p_decision,
    p_reason_code, p_before_state, p_after_state, p_correlation_id,
    p_occurred_at, p_recorded_at, p_sequence, p_previous_hash, p_entry_hash
  )
  RETURNING *
$$;
REVOKE ALL ON FUNCTION public.append_audit_ledger_entry(
  text, text, text, text, text, text, text, text, integer, text, text, text,
  text, text, jsonb, jsonb, text, timestamp with time zone,
  timestamp with time zone, bigint, text, text
) FROM PUBLIC;

-- Les tables de staging sont des entrées de migration, pas des tables runtime.
-- Leur suppression intervient seulement après validation complète de ce lot;
-- une erreur précédente rollbacke l'ensemble de la migration.
DROP TABLE IF EXISTS "msp_membership_bootstrap";
DROP TABLE IF EXISTS "msp_client_bootstrap";
DROP TABLE IF EXISTS "msp_organization_bootstrap";
