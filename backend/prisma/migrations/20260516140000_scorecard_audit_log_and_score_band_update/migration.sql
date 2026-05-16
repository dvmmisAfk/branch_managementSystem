-- Add not_applicable value to ScoreBand enum
ALTER TYPE "ScoreBand" ADD VALUE 'not_applicable';

-- Make score_percentage nullable (all-NA visits store null instead of 0)
ALTER TABLE "score_snapshots" ALTER COLUMN "score_percentage" DROP NOT NULL;

-- Create scorecard_audit_log table
CREATE TABLE "scorecard_audit_log" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "action"       TEXT        NOT NULL,
    "entity_type"  TEXT        NOT NULL,
    "entity_id"    UUID        NOT NULL,
    "changed_by"   UUID        NOT NULL,
    "before_value" JSONB,
    "after_value"  JSONB,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "scorecard_audit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scorecard_audit_log_changed_by_fkey"
        FOREIGN KEY ("changed_by")
        REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_scorecard_audit_entity"     ON "scorecard_audit_log"("entity_type", "entity_id");
CREATE INDEX "idx_scorecard_audit_changed_by" ON "scorecard_audit_log"("changed_by");
