-- Speed SFH/supervisor visit lists and quarter-scoped queries.
CREATE INDEX IF NOT EXISTS "branch_visits_sfh_id_is_submitted_idx" ON "branch_visits" ("sfh_id", "is_submitted");
CREATE INDEX IF NOT EXISTS "branch_visits_quarter_id_idx" ON "branch_visits" ("quarter_id");
