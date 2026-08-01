-- US-G1-004B — durable compare-and-set ownership for one approval relay.
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "approval_claim_id" text;
CREATE INDEX IF NOT EXISTS "runs_approval_claim_idx"
  ON "runs" ("site_id", "approval_claim_id");
