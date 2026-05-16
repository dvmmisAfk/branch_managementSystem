-- Archive table for branch_ops_incharge_snapshot before column removal
CREATE TABLE "branch_ops_incharge_archive" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "branch_ops_incharge_snapshot" VARCHAR(255),
    "archived_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "branch_ops_incharge_archive_pkey" PRIMARY KEY ("id")
);

-- Copy existing non-null values before dropping
INSERT INTO "branch_ops_incharge_archive" ("visit_id", "branch_ops_incharge_snapshot")
SELECT "id", "branch_ops_incharge_snapshot"
FROM "branch_visits"
WHERE "branch_ops_incharge_snapshot" IS NOT NULL;

-- Drop the column from branch_visits
ALTER TABLE "branch_visits" DROP COLUMN "branch_ops_incharge_snapshot";

-- Remap DgOwnership enum: company_owned -> owned, na -> NULL
-- Step 1: drop the NOT NULL constraint and default on branches.dg_ownership
ALTER TABLE "branches" ALTER COLUMN "dg_ownership" DROP DEFAULT;
ALTER TABLE "branches" ALTER COLUMN "dg_ownership" DROP NOT NULL;

-- Step 2: create new enum type with only owned/rented
CREATE TYPE "DgOwnership_new" AS ENUM ('owned', 'rented');

-- Step 3: migrate data using USING clause (company_owned -> owned, rented -> rented, na -> NULL)
ALTER TABLE "branches"
    ALTER COLUMN "dg_ownership" TYPE "DgOwnership_new"
    USING (
        CASE "dg_ownership"::text
            WHEN 'rented'       THEN 'rented'::"DgOwnership_new"
            WHEN 'company_owned' THEN 'owned'::"DgOwnership_new"
            ELSE NULL
        END
    );

-- Step 4: swap enum names
DROP TYPE "DgOwnership";
ALTER TYPE "DgOwnership_new" RENAME TO "DgOwnership";
