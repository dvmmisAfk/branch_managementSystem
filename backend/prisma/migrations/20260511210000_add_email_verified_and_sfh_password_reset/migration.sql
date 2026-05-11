-- Align DB with schema: user email verification + SFH password reset queue (+ token tables used by schema).

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SfhPasswordResetRequestStatus" AS ENUM ('pending', 'fulfilled', 'dismissed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "sfh_password_reset_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "SfhPasswordResetRequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMP(3),
    "fulfilled_by_id" UUID,

    CONSTRAINT "sfh_password_reset_requests_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "sfh_password_reset_requests" ADD CONSTRAINT "sfh_password_reset_requests_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "sfh_password_reset_requests" ADD CONSTRAINT "sfh_password_reset_requests_fulfilled_by_id_fkey"
        FOREIGN KEY ("fulfilled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "sfh_password_reset_requests_status_idx" ON "sfh_password_reset_requests"("status");
CREATE INDEX IF NOT EXISTS "sfh_password_reset_requests_user_id_idx" ON "sfh_password_reset_requests"("user_id");

-- CreateTable (schema parity; not all routes use these yet)
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_idx" ON "password_reset_tokens"("token_hash");

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_user_id_key" ON "email_verification_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_token_hash_idx" ON "email_verification_tokens"("token_hash");

-- Prisma @unique on StateFacilityHead.employeeCode (multiple NULLs allowed in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS "state_facility_heads_employee_code_key" ON "state_facility_heads"("employee_code");
