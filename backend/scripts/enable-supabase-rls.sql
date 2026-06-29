-- One-shot Supabase hardening (also applied via Prisma migration 20260630220000_supabase_rls_and_fk_indexes).
-- Safe to re-run: ENABLE ROW LEVEL SECURITY is idempotent; REVOKE is idempotent.
-- Run in Supabase SQL Editor if migration has not been deployed yet.

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sfh_password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.state_facility_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sfh_branch_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quarters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.assessment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.assessment_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.branch_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visit_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.utility_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.visit_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scorecard_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
  END IF;
END
$$;
