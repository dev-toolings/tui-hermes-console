-- US-G1-004C-local — persisted approval.request identity and single-use CAS.
-- This migration does not relay or execute anything in Hermes.

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "run_id" text NOT NULL,
  "hermes_run_id" text NOT NULL,
  "approval_request_id" text NOT NULL,
  "nonce" text NOT NULL,
  "claim_state" text NOT NULL DEFAULT 'pending',
  "outcome" text,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "approval_requests_site_run_fk"
    FOREIGN KEY ("site_id", "run_id")
    REFERENCES "runs"("site_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "approval_requests_state_check"
    CHECK ("claim_state" IN ('pending', 'claimed', 'resolved', 'expired')),
  CONSTRAINT "approval_requests_outcome_check"
    CHECK (
      ("claim_state" = 'resolved' AND "outcome" IN ('once', 'deny'))
      OR ("claim_state" <> 'resolved' AND "outcome" IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_scope_idx"
  ON "approval_requests" ("site_id", "run_id", "hermes_run_id", "approval_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_nonce_idx"
  ON "approval_requests" ("nonce");
CREATE INDEX IF NOT EXISTS "approval_requests_expiry_idx"
  ON "approval_requests" ("site_id", "claim_state", "expires_at");
