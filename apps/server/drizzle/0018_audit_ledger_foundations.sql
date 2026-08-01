CREATE UNIQUE INDEX IF NOT EXISTS "site_memberships_actor_scope_idx"
ON "site_memberships" USING btree ("user_id", "site_id", "role");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_ledger_heads" (
  "target_site_id" text PRIMARY KEY NOT NULL,
  "next_sequence" bigint DEFAULT 1 NOT NULL,
  "last_entry_hash" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_ledger_heads_target_site_id_sites_id_fk"
    FOREIGN KEY ("target_site_id") REFERENCES "sites"("id"),
  CONSTRAINT "audit_ledger_heads_sequence_check" CHECK ("next_sequence" > 0),
  CONSTRAINT "audit_ledger_heads_hash_check"
    CHECK ("last_entry_hash" IS NULL OR "last_entry_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_ledger_entries" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "event_id" text NOT NULL,
  "actor_site_id" text NOT NULL,
  "target_site_id" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "actor_role" text NOT NULL,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "decision" text NOT NULL,
  "reason_code" text NOT NULL,
  "before_state" jsonb NOT NULL,
  "after_state" jsonb NOT NULL,
  "correlation_id" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sequence" bigint NOT NULL,
  "previous_hash" text,
  "entry_hash" text NOT NULL,
  CONSTRAINT "audit_ledger_actor_site_id_sites_id_fk"
    FOREIGN KEY ("actor_site_id") REFERENCES "sites"("id"),
  CONSTRAINT "audit_ledger_target_site_id_sites_id_fk"
    FOREIGN KEY ("target_site_id") REFERENCES "sites"("id"),
  CONSTRAINT "audit_ledger_sequence_positive_check" CHECK ("sequence" > 0),
  CONSTRAINT "audit_ledger_previous_hash_check"
    CHECK (
      ("sequence" = 1 AND "previous_hash" IS NULL)
      OR ("sequence" > 1 AND "previous_hash" IS NOT NULL)
    ),
  CONSTRAINT "audit_ledger_entry_hash_check"
    CHECK (
      "entry_hash" ~ '^[0-9a-f]{64}$'
      AND ("previous_hash" IS NULL OR "previous_hash" ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT "audit_ledger_decision_check"
    CHECK ("decision" IN ('allowed', 'denied')),
  CONSTRAINT "audit_ledger_reason_code_check"
    CHECK (btrim("reason_code") <> ''),
  CONSTRAINT "audit_ledger_non_empty_fields_check"
    CHECK (
      btrim("event_id") <> ''
      AND btrim("action") <> ''
      AND btrim("resource_type") <> ''
      AND btrim("resource_id") <> ''
      AND btrim("correlation_id") <> ''
    ),
  CONSTRAINT "audit_ledger_denied_state_check"
    CHECK ("decision" <> 'denied' OR "before_state" = "after_state")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_ledger_target_event_idx"
ON "audit_ledger_entries" USING btree ("target_site_id", "event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "audit_ledger_target_sequence_idx"
ON "audit_ledger_entries" USING btree ("target_site_id", "sequence");
CREATE INDEX IF NOT EXISTS "audit_ledger_target_occurred_idx"
ON "audit_ledger_entries" USING btree ("target_site_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "audit_ledger_correlation_idx"
ON "audit_ledger_entries" USING btree ("target_site_id", "correlation_id");
CREATE INDEX IF NOT EXISTS "audit_ledger_resource_idx"
ON "audit_ledger_entries" USING btree ("target_site_id", "resource_type", "resource_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "advance_audit_ledger_head"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_sequence bigint;
  expected_previous_hash text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.site_memberships
    WHERE user_id = NEW.actor_user_id
      AND site_id = NEW.actor_site_id
      AND role = NEW.actor_role
  ) THEN
    RAISE EXCEPTION 'audit_ledger_actor_membership_missing'
      USING ERRCODE = '23503', CONSTRAINT = 'audit_ledger_actor_membership_check';
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_audit_ledger_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- P0 opérationnel non résolu : DATABASE_URL sert encore au migrateur et au
  -- runtime avec le même rôle propriétaire. Ces triggers sont une garde de
  -- fondation, pas une frontière append-only contre ce propriétaire.
  RAISE EXCEPTION 'audit_ledger_append_only' USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "guard_audit_ledger_head"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_ledger_head_managed' USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_ledger_advance_head" ON "audit_ledger_entries";
CREATE TRIGGER "audit_ledger_advance_head"
BEFORE INSERT ON "audit_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "advance_audit_ledger_head"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_ledger_reject_mutation" ON "audit_ledger_entries";
CREATE TRIGGER "audit_ledger_reject_mutation"
BEFORE UPDATE OR DELETE ON "audit_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_audit_ledger_mutation"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_ledger_reject_truncate" ON "audit_ledger_entries";
CREATE TRIGGER "audit_ledger_reject_truncate"
BEFORE TRUNCATE ON "audit_ledger_entries"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_ledger_mutation"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_ledger_guard_head" ON "audit_ledger_heads";
CREATE TRIGGER "audit_ledger_guard_head"
BEFORE INSERT OR UPDATE OR DELETE ON "audit_ledger_heads"
FOR EACH ROW EXECUTE FUNCTION "guard_audit_ledger_head"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_ledger_heads_reject_truncate" ON "audit_ledger_heads";
CREATE TRIGGER "audit_ledger_heads_reject_truncate"
BEFORE TRUNCATE ON "audit_ledger_heads"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_ledger_mutation"();
