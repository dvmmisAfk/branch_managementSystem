-- Refresh session store (rotation + revocation)
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions"("family_id");

ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- visit_scores FK lookup index
CREATE INDEX IF NOT EXISTS "visit_scores_subcategory_id_idx" ON "visit_scores"("subcategory_id");

-- visitType default for raw inserts
ALTER TABLE "branch_visits" ALTER COLUMN "visit_type" SET DEFAULT 'physical';
