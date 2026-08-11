-- Les ressources existantes ne reçoivent jamais un auteur inventé. Avant une
-- migration legacy, l'opérateur doit créer et remplir cette table de staging :
--   resource_type: agent | connector | thread | run | artifact
--   resource_id: identifiant métier existant
--   author_user_id: auteur historique explicitement vérifié
--   owner_user_id: propriétaire explicite; peut rester NULL uniquement si le
--                  site possède exactement un admin déjà désigné.
CREATE TABLE IF NOT EXISTS "resource_ownership_bootstrap" (
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "owner_user_id" text,
  "author_user_id" text NOT NULL,
  PRIMARY KEY ("resource_type", "resource_id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "author_user_id" text;
ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "connectors" ADD COLUMN IF NOT EXISTS "author_user_id" text;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "author_user_id" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "author_user_id" text;
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "author_user_id" text;
--> statement-breakpoint
WITH unique_admin AS (
  SELECT "site_id", (array_agg("user_id" ORDER BY "user_id"))[1] AS "user_id"
  FROM "site_memberships"
  WHERE "role" = 'admin'
  GROUP BY "site_id"
  HAVING count(*) = 1
)
UPDATE "agents" AS resource
SET "owner_user_id" = coalesce(
      bootstrap."owner_user_id",
      (SELECT "user_id" FROM unique_admin WHERE "site_id" = resource."site_id")
    ),
    "author_user_id" = bootstrap."author_user_id"
FROM "resource_ownership_bootstrap" AS bootstrap
WHERE bootstrap."resource_type" = 'agent'
  AND bootstrap."resource_id" = resource."id";
--> statement-breakpoint
WITH unique_admin AS (
  SELECT "site_id", (array_agg("user_id" ORDER BY "user_id"))[1] AS "user_id"
  FROM "site_memberships"
  WHERE "role" = 'admin'
  GROUP BY "site_id"
  HAVING count(*) = 1
)
UPDATE "connectors" AS resource
SET "owner_user_id" = coalesce(
      bootstrap."owner_user_id",
      (SELECT "user_id" FROM unique_admin WHERE "site_id" = resource."site_id")
    ),
    "author_user_id" = bootstrap."author_user_id"
FROM "resource_ownership_bootstrap" AS bootstrap
WHERE bootstrap."resource_type" = 'connector'
  AND bootstrap."resource_id" = resource."id";
--> statement-breakpoint
WITH unique_admin AS (
  SELECT "site_id", (array_agg("user_id" ORDER BY "user_id"))[1] AS "user_id"
  FROM "site_memberships"
  WHERE "role" = 'admin'
  GROUP BY "site_id"
  HAVING count(*) = 1
)
UPDATE "threads" AS resource
SET "owner_user_id" = coalesce(
      bootstrap."owner_user_id",
      (SELECT "user_id" FROM unique_admin WHERE "site_id" = resource."site_id")
    ),
    "author_user_id" = bootstrap."author_user_id"
FROM "resource_ownership_bootstrap" AS bootstrap
WHERE bootstrap."resource_type" = 'thread'
  AND bootstrap."resource_id" = resource."id";
--> statement-breakpoint
UPDATE "runs" AS resource
SET "owner_user_id" = parent."owner_user_id",
    "author_user_id" = bootstrap."author_user_id"
FROM "resource_ownership_bootstrap" AS bootstrap,
     "threads" AS parent
WHERE bootstrap."resource_type" = 'run'
  AND bootstrap."resource_id" = resource."id"
  AND parent."site_id" = resource."site_id"
  AND parent."id" = resource."thread_id";
--> statement-breakpoint
UPDATE "artifacts" AS resource
SET "owner_user_id" = parent."owner_user_id",
    "author_user_id" = bootstrap."author_user_id"
FROM "resource_ownership_bootstrap" AS bootstrap,
     "runs" AS parent
WHERE bootstrap."resource_type" = 'artifact'
  AND bootstrap."resource_id" = resource."id"
  AND parent."site_id" = resource."site_id"
  AND parent."id" = resource."run_id";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "resource_ownership_bootstrap" bootstrap
    JOIN "runs" resource
      ON bootstrap."resource_type" = 'run'
     AND bootstrap."resource_id" = resource."id"
    JOIN "threads" parent
      ON parent."site_id" = resource."site_id"
     AND parent."id" = resource."thread_id"
    WHERE bootstrap."owner_user_id" IS NOT NULL
      AND bootstrap."owner_user_id" <> parent."owner_user_id"
  ) OR EXISTS (
    SELECT 1
    FROM "resource_ownership_bootstrap" bootstrap
    JOIN "artifacts" resource
      ON bootstrap."resource_type" = 'artifact'
     AND bootstrap."resource_id" = resource."id"
    JOIN "runs" parent
      ON parent."site_id" = resource."site_id"
     AND parent."id" = resource."run_id"
    WHERE bootstrap."owner_user_id" IS NOT NULL
      AND bootstrap."owner_user_id" <> parent."owner_user_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'RESOURCE_OWNERSHIP_AGGREGATE_DIVERGENCE',
      DETAIL = 'Run ownership must match its thread; artifact ownership must match its run.';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT "owner_user_id", "author_user_id" FROM "agents"
      UNION ALL SELECT "owner_user_id", "author_user_id" FROM "connectors"
      UNION ALL SELECT "owner_user_id", "author_user_id" FROM "threads"
      UNION ALL SELECT "owner_user_id", "author_user_id" FROM "runs"
      UNION ALL SELECT "owner_user_id", "author_user_id" FROM "artifacts"
    ) AS resource
    WHERE resource."owner_user_id" IS NULL OR resource."author_user_id" IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'RESOURCE_OWNERSHIP_BOOTSTRAP_REQUIRED',
      DETAIL = 'Every legacy resource needs an explicit author; owner also needs an explicit value unless its site has exactly one designated admin.';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "site_id", "owner_user_id" FROM "agents"
      UNION ALL SELECT "site_id", "owner_user_id" FROM "connectors"
      UNION ALL SELECT "site_id", "owner_user_id" FROM "threads"
      UNION ALL SELECT "site_id", "owner_user_id" FROM "runs"
      UNION ALL SELECT "site_id", "owner_user_id" FROM "artifacts"
    ) resource
    LEFT JOIN "site_memberships" membership
      ON membership."site_id" = resource."site_id"
     AND membership."user_id" = resource."owner_user_id"
     AND membership."role" IN ('admin', 'operator', 'requester')
    WHERE membership."user_id" IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'RESOURCE_OWNER_ROLE_INVALID',
      DETAIL = 'A resource owner must be an admin, operator, or requester member of its site.';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "agents" ALTER COLUMN "author_user_id" SET NOT NULL;
ALTER TABLE "connectors" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "connectors" ALTER COLUMN "author_user_id" SET NOT NULL;
ALTER TABLE "threads" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "threads" ALTER COLUMN "author_user_id" SET NOT NULL;
ALTER TABLE "runs" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "runs" ALTER COLUMN "author_user_id" SET NOT NULL;
ALTER TABLE "artifacts" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "artifacts" ALTER COLUMN "author_user_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_author_user_id_console_users_id_fk') THEN
    ALTER TABLE "agents" ADD CONSTRAINT "agents_author_user_id_console_users_id_fk"
      FOREIGN KEY ("author_user_id") REFERENCES "console_users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_owner_site_membership_fk') THEN
    ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_site_membership_fk"
      FOREIGN KEY ("owner_user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connectors_author_user_id_console_users_id_fk') THEN
    ALTER TABLE "connectors" ADD CONSTRAINT "connectors_author_user_id_console_users_id_fk"
      FOREIGN KEY ("author_user_id") REFERENCES "console_users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connectors_owner_site_membership_fk') THEN
    ALTER TABLE "connectors" ADD CONSTRAINT "connectors_owner_site_membership_fk"
      FOREIGN KEY ("owner_user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_author_user_id_console_users_id_fk') THEN
    ALTER TABLE "threads" ADD CONSTRAINT "threads_author_user_id_console_users_id_fk"
      FOREIGN KEY ("author_user_id") REFERENCES "console_users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'threads_owner_site_membership_fk') THEN
    ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_site_membership_fk"
      FOREIGN KEY ("owner_user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runs_author_user_id_console_users_id_fk') THEN
    ALTER TABLE "runs" ADD CONSTRAINT "runs_author_user_id_console_users_id_fk"
      FOREIGN KEY ("author_user_id") REFERENCES "console_users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runs_owner_site_membership_fk') THEN
    ALTER TABLE "runs" ADD CONSTRAINT "runs_owner_site_membership_fk"
      FOREIGN KEY ("owner_user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_author_user_id_console_users_id_fk') THEN
    ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_author_user_id_console_users_id_fk"
      FOREIGN KEY ("author_user_id") REFERENCES "console_users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_owner_site_membership_fk') THEN
    ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_site_membership_fk"
      FOREIGN KEY ("owner_user_id", "site_id") REFERENCES "site_memberships"("user_id", "site_id");
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "threads_site_project_scope_id_owner_idx"
  ON "threads" ("site_id", "project_scope", "id", "owner_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "runs_site_project_scope_id_owner_idx"
  ON "runs" ("site_id", "project_scope", "id", "owner_user_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runs_thread_owner_fk') THEN
    ALTER TABLE "runs" ADD CONSTRAINT "runs_thread_owner_fk"
      FOREIGN KEY ("site_id", "project_scope", "thread_id", "owner_user_id")
      REFERENCES "threads" ("site_id", "project_scope", "id", "owner_user_id")
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artifacts_run_owner_fk') THEN
    ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_owner_fk"
      FOREIGN KEY ("site_id", "project_scope", "run_id", "owner_user_id")
      REFERENCES "runs" ("site_id", "project_scope", "id", "owner_user_id")
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_site_owner_idx" ON "agents" ("site_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "connectors_site_owner_idx" ON "connectors" ("site_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "threads_site_owner_idx" ON "threads" ("site_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "runs_site_owner_idx" ON "runs" ("site_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "artifacts_site_owner_idx" ON "artifacts" ("site_id", "owner_user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_resource_identity_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."author_user_id" IS DISTINCT FROM OLD."author_user_id" THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'RESOURCE_AUTHOR_IMMUTABLE';
  END IF;
  IF NEW."site_id" IS DISTINCT FROM OLD."site_id" THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'RESOURCE_SITE_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION "validate_resource_owner_role"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Resource creation/transfer and membership degradation share one advisory
  -- transaction lock. Without it, READ COMMITTED could validate both sides
  -- against the old role and leave a revoked member owning a resource.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW."site_id" || ':' || NEW."owner_user_id",
    0
  ));
  IF NOT EXISTS (
    SELECT 1 FROM "site_memberships"
    WHERE "user_id" = NEW."owner_user_id"
      AND "site_id" = NEW."site_id"
      AND "role" IN ('admin', 'operator', 'requester')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'RESOURCE_OWNER_ROLE_INVALID';
  END IF;
  RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION "prevent_owned_membership_revocation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id text := OLD."user_id";
  target_site_id text := OLD."site_id";
BEGIN
  IF TG_OP <> 'DELETE' AND NEW."role" IN ('admin', 'operator', 'requester') THEN
    RETURN NEW;
  END IF;
  -- Must use the same key as validate_resource_owner_role(). This serializes
  -- role degradation/revocation with concurrent owner inserts/transfers.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    OLD."site_id" || ':' || OLD."user_id",
    0
  ));
  IF EXISTS (
    SELECT 1 FROM "agents" WHERE "site_id" = target_site_id AND "owner_user_id" = target_user_id
    UNION ALL SELECT 1 FROM "connectors" WHERE "site_id" = target_site_id AND "owner_user_id" = target_user_id
    UNION ALL SELECT 1 FROM "threads" WHERE "site_id" = target_site_id AND "owner_user_id" = target_user_id
    UNION ALL SELECT 1 FROM "runs" WHERE "site_id" = target_site_id AND "owner_user_id" = target_user_id
    UNION ALL SELECT 1 FROM "artifacts" WHERE "site_id" = target_site_id AND "owner_user_id" = target_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'OWNED_RESOURCES_REQUIRE_TRANSFER';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS "agents_identity_immutable" ON "agents";
DROP TRIGGER IF EXISTS "connectors_identity_immutable" ON "connectors";
DROP TRIGGER IF EXISTS "threads_identity_immutable" ON "threads";
DROP TRIGGER IF EXISTS "runs_identity_immutable" ON "runs";
DROP TRIGGER IF EXISTS "artifacts_identity_immutable" ON "artifacts";
DROP TRIGGER IF EXISTS "agents_owner_role_valid" ON "agents";
DROP TRIGGER IF EXISTS "connectors_owner_role_valid" ON "connectors";
DROP TRIGGER IF EXISTS "threads_owner_role_valid" ON "threads";
DROP TRIGGER IF EXISTS "runs_owner_role_valid" ON "runs";
DROP TRIGGER IF EXISTS "artifacts_owner_role_valid" ON "artifacts";
DROP TRIGGER IF EXISTS "site_memberships_owned_resources_guard" ON "site_memberships";
CREATE TRIGGER "agents_identity_immutable"
  BEFORE UPDATE ON "agents" FOR EACH ROW EXECUTE FUNCTION "prevent_resource_identity_mutation"();
CREATE TRIGGER "connectors_identity_immutable"
  BEFORE UPDATE ON "connectors" FOR EACH ROW EXECUTE FUNCTION "prevent_resource_identity_mutation"();
CREATE TRIGGER "threads_identity_immutable"
  BEFORE UPDATE ON "threads" FOR EACH ROW EXECUTE FUNCTION "prevent_resource_identity_mutation"();
CREATE TRIGGER "runs_identity_immutable"
  BEFORE UPDATE ON "runs" FOR EACH ROW EXECUTE FUNCTION "prevent_resource_identity_mutation"();
CREATE TRIGGER "artifacts_identity_immutable"
  BEFORE UPDATE ON "artifacts" FOR EACH ROW EXECUTE FUNCTION "prevent_resource_identity_mutation"();
CREATE TRIGGER "agents_owner_role_valid"
  BEFORE INSERT OR UPDATE OF "owner_user_id", "site_id" ON "agents"
  FOR EACH ROW EXECUTE FUNCTION "validate_resource_owner_role"();
CREATE TRIGGER "connectors_owner_role_valid"
  BEFORE INSERT OR UPDATE OF "owner_user_id", "site_id" ON "connectors"
  FOR EACH ROW EXECUTE FUNCTION "validate_resource_owner_role"();
CREATE TRIGGER "threads_owner_role_valid"
  BEFORE INSERT OR UPDATE OF "owner_user_id", "site_id" ON "threads"
  FOR EACH ROW EXECUTE FUNCTION "validate_resource_owner_role"();
CREATE TRIGGER "runs_owner_role_valid"
  BEFORE INSERT OR UPDATE OF "owner_user_id", "site_id" ON "runs"
  FOR EACH ROW EXECUTE FUNCTION "validate_resource_owner_role"();
CREATE TRIGGER "artifacts_owner_role_valid"
  BEFORE INSERT OR UPDATE OF "owner_user_id", "site_id" ON "artifacts"
  FOR EACH ROW EXECUTE FUNCTION "validate_resource_owner_role"();
CREATE TRIGGER "site_memberships_owned_resources_guard"
  BEFORE DELETE OR UPDATE OF "role" ON "site_memberships"
  FOR EACH ROW EXECUTE FUNCTION "prevent_owned_membership_revocation"();
--> statement-breakpoint
DROP TABLE "resource_ownership_bootstrap";
