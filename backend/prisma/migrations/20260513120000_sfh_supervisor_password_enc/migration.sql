-- Encrypted copy of SFH password for supervisor-only "show current password" (AES-256-GCM; key derived from JWT_SECRET).
ALTER TABLE "state_facility_heads" ADD COLUMN "supervisor_password_enc" TEXT;
