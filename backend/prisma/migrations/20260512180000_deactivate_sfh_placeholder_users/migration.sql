-- Deactivate legacy seed SFH placeholder accounts (no longer created by seed.ts).
UPDATE "users"
SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "role" = 'sfh'::"UserRole"
  AND (
    "email" IN ('sfh.placeholder6@company.com', 'sfh.placeholder7@company.com')
    OR "name" ILIKE 'SFH Placeholder%'
  );
