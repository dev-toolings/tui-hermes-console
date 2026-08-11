CREATE OR REPLACE FUNCTION public.append_audit_ledger_entry(
  p_event_id text,
  p_actor_site_id text,
  p_target_site_id text,
  p_actor_user_id text,
  p_actor_role text,
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
    event_id,
    actor_site_id,
    target_site_id,
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    decision,
    reason_code,
    before_state,
    after_state,
    correlation_id,
    occurred_at,
    recorded_at,
    sequence,
    previous_hash,
    entry_hash
  ) VALUES (
    p_event_id,
    p_actor_site_id,
    p_target_site_id,
    p_actor_user_id,
    p_actor_role,
    p_action,
    p_resource_type,
    p_resource_id,
    p_decision,
    p_reason_code,
    p_before_state,
    p_after_state,
    p_correlation_id,
    p_occurred_at,
    p_recorded_at,
    p_sequence,
    p_previous_hash,
    p_entry_hash
  )
  RETURNING *
$$;
--> statement-breakpoint
ALTER FUNCTION public.advance_audit_ledger_head() SECURITY DEFINER;
ALTER FUNCTION public.reject_audit_ledger_mutation() SECURITY DEFINER;
ALTER FUNCTION public.guard_audit_ledger_head() SECURITY DEFINER;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.append_audit_ledger_entry(
  text, text, text, text, text, text, text, text, text, text, jsonb, jsonb,
  text, timestamp with time zone, timestamp with time zone, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_audit_ledger_head() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_audit_ledger_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_audit_ledger_head() FROM PUBLIC;
