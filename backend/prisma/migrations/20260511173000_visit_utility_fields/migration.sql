-- Visit-level utility (electricity last quarter + custom lines for PDF/Excel)
ALTER TABLE "branch_visits" ADD COLUMN "electricity_last_quarter" DECIMAL(12, 2);
ALTER TABLE "branch_visits" ADD COLUMN "utility_lines_json" JSONB;
