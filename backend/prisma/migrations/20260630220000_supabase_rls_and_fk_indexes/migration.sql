-- Supabase Advisor remediation:
-- 1) Index foreign-key columns flagged as unindexed.
-- 2) Enable RLS on all public tables (no policies = deny anon/authenticated via PostgREST).
--    Prisma connects as the postgres/pooler role and bypasses RLS.

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "branch_visits_mapping_id_idx" ON "branch_visits"("mapping_id");

-- CreateIndex
CREATE INDEX "sfh_branch_mapping_approved_by_idx" ON "sfh_branch_mapping"("approved_by");

-- CreateIndex
CREATE INDEX "sfh_password_reset_requests_fulfilled_by_id_idx" ON "sfh_password_reset_requests"("fulfilled_by_id");

-- CreateIndex
CREATE INDEX "visit_edit_requests_sfh_id_idx" ON "visit_edit_requests"("sfh_id");

-- CreateIndex
CREATE INDEX "visit_edit_requests_reviewed_by_id_idx" ON "visit_edit_requests"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "visit_issues_visit_id_idx" ON "visit_issues"("visit_id");

-- CreateIndex
CREATE INDEX "visit_issues_category_id_idx" ON "visit_issues"("category_id");

-- Enable Row Level Security (defense-in-depth when Supabase hosts Postgres)
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sfh_password_reset_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "state_facility_heads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sfh_branch_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quarters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_subcategories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branch_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "score_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "utility_consumption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_edit_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scorecard_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Revoke direct API-role access (Supabase only — skip when anon/authenticated roles are absent).
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
