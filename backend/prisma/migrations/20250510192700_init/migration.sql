-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('supervisor', 'sfh', 'branch_staff');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('vistaar', 'non_vistaar');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('physical', 'virtual');

-- CreateEnum
CREATE TYPE "ScoreStatus" AS ENUM ('yes', 'no', 'not_applicable');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('excellent', 'good', 'satisfactory', 'needs_improvement', 'critical');

-- CreateEnum
CREATE TYPE "DgOwnership" AS ENUM ('rented', 'company_owned', 'na');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_facility_heads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_code" VARCHAR(50),
    "phone" VARCHAR(20),
    "state_region" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_facility_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "branch_code" VARCHAR(20) NOT NULL,
    "sap_code" VARCHAR(20),
    "branch_name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "zone" VARCHAR(100),
    "branch_type" "BranchType" NOT NULL,
    "date_of_operationalization" DATE,
    "carpet_area_sqft" DECIMAL(10,2),
    "boi_name" VARCHAR(255),
    "branch_manager_name" VARCHAR(255),
    "branch_operation_incharge" VARCHAR(255),
    "premise_owner" VARCHAR(255),
    "staff_outsource" INTEGER NOT NULL DEFAULT 0,
    "staff_company_roll" INTEGER NOT NULL DEFAULT 0,
    "staff_hk_resources" INTEGER NOT NULL DEFAULT 0,
    "staff_talic_employees" INTEGER NOT NULL DEFAULT 0,
    "workstations_linear" INTEGER NOT NULL DEFAULT 0,
    "workstations_lshape" INTEGER NOT NULL DEFAULT 0,
    "workstations_cubical" INTEGER NOT NULL DEFAULT 0,
    "ups_capacity_kva" DECIMAL(6,2),
    "ups_backup_time_mins" INTEGER,
    "ac_tonnage" DECIMAL(6,2),
    "electricity_load_kw" DECIMAL(6,2),
    "rms_vendor_present" BOOLEAN NOT NULL DEFAULT false,
    "rms_vendor_name" VARCHAR(255),
    "fire_extinguisher_count" INTEGER NOT NULL DEFAULT 0,
    "dg_ownership" "DgOwnership" NOT NULL DEFAULT 'na',
    "dg_capacity_kva" DECIMAL(6,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sfh_branch_mapping" (
    "id" UUID NOT NULL,
    "sfh_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "approved_by" UUID,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "approval_remarks" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sfh_branch_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarters" (
    "id" UUID NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "quarter_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "label" VARCHAR(20),

    CONSTRAINT "quarters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "weight_percent" DECIMAL(5,2),
    "max_points" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_subcategories" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_score" INTEGER NOT NULL DEFAULT 5,
    "weight_within_category" DECIMAL(5,2),
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assessment_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_visits" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sfh_id" UUID NOT NULL,
    "quarter_id" UUID NOT NULL,
    "mapping_id" UUID,
    "visit_date_actual" DATE,
    "visit_date_locked_at" TIMESTAMP(3),
    "previous_visit_date" DATE,
    "previous_visit_score" DECIMAL(5,2),
    "visit_type" "VisitType" NOT NULL,
    "virtual_staff_contact_name" VARCHAR(255),
    "virtual_staff_contact_phone" VARCHAR(20),
    "reason_for_no_visit" TEXT,
    "boi_name_snapshot" VARCHAR(255),
    "location_head_snapshot" VARCHAR(255),
    "branch_ops_incharge_snapshot" VARCHAR(255),
    "staff_outsource_snapshot" INTEGER,
    "staff_company_snapshot" INTEGER,
    "staff_hk_resources_snapshot" INTEGER,
    "staff_talic_employees_snapshot" INTEGER,
    "workstations_linear_snapshot" INTEGER,
    "workstations_lshape_snapshot" INTEGER,
    "workstations_cubical_snapshot" INTEGER,
    "is_infra_upgrade" BOOLEAN NOT NULL DEFAULT false,
    "landlord_issue" BOOLEAN NOT NULL DEFAULT false,
    "landlord_issue_details" TEXT,
    "incident_previous_visit" BOOLEAN NOT NULL DEFAULT false,
    "incident_previous_visit_details" TEXT,
    "audit_points_observed" BOOLEAN NOT NULL DEFAULT false,
    "audit_points_details" TEXT,
    "major_escalation" BOOLEAN NOT NULL DEFAULT false,
    "escalation_details" TEXT,
    "escalation_closure_date" DATE,
    "is_submitted" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "signed_sfh_at" TIMESTAMP(3),
    "signed_ops_incharge_at" TIMESTAMP(3),
    "signed_location_head_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_scores" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "subcategory_id" UUID NOT NULL,
    "status" "ScoreStatus" NOT NULL,
    "score_given" INTEGER,
    "max_score" INTEGER NOT NULL,
    "observations" TEXT,
    "rems_number" VARCHAR(100),
    "remarks" TEXT,

    CONSTRAINT "visit_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_issues" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "issue_description" TEXT NOT NULL,
    "scheduled_closure_date" DATE,
    "issue_status" "IssueStatus" NOT NULL DEFAULT 'open',
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "visit_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_snapshots" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "total_points_earned" INTEGER NOT NULL,
    "total_max_points" INTEGER NOT NULL,
    "score_percentage" DECIMAL(5,2) NOT NULL,
    "score_band" "ScoreBand" NOT NULL,
    "category_breakdown" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_consumption" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "quarter_number" INTEGER NOT NULL,
    "electricity_bill_amount" DECIMAL(12,2),
    "units_consumed" DECIMAL(10,2),
    "ot_expenses" DECIMAL(12,2),
    "action_points_expenses" TEXT,
    "remarks" TEXT,

    CONSTRAINT "utility_consumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "state_facility_heads_user_id_key" ON "state_facility_heads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_branch_code_key" ON "branches"("branch_code");

-- CreateIndex
CREATE INDEX "sfh_branch_mapping_sfh_id_branch_id_is_current_idx" ON "sfh_branch_mapping"("sfh_id", "branch_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "quarters_financial_year_quarter_number_key" ON "quarters"("financial_year", "quarter_number");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_subcategories_category_id_display_order_key" ON "assessment_subcategories"("category_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "branch_visits_branch_id_quarter_id_key" ON "branch_visits"("branch_id", "quarter_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_scores_visit_id_subcategory_id_key" ON "visit_scores"("visit_id", "subcategory_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_snapshots_visit_id_key" ON "score_snapshots"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_consumption_branch_id_financial_year_quarter_number_key" ON "utility_consumption"("branch_id", "financial_year", "quarter_number");

-- AddForeignKey
ALTER TABLE "state_facility_heads" ADD CONSTRAINT "state_facility_heads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sfh_branch_mapping" ADD CONSTRAINT "sfh_branch_mapping_sfh_id_fkey" FOREIGN KEY ("sfh_id") REFERENCES "state_facility_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sfh_branch_mapping" ADD CONSTRAINT "sfh_branch_mapping_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sfh_branch_mapping" ADD CONSTRAINT "sfh_branch_mapping_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_subcategories" ADD CONSTRAINT "assessment_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "assessment_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_visits" ADD CONSTRAINT "branch_visits_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_visits" ADD CONSTRAINT "branch_visits_sfh_id_fkey" FOREIGN KEY ("sfh_id") REFERENCES "state_facility_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_visits" ADD CONSTRAINT "branch_visits_quarter_id_fkey" FOREIGN KEY ("quarter_id") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_visits" ADD CONSTRAINT "branch_visits_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "sfh_branch_mapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_scores" ADD CONSTRAINT "visit_scores_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "branch_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_scores" ADD CONSTRAINT "visit_scores_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "assessment_subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_issues" ADD CONSTRAINT "visit_issues_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "branch_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_issues" ADD CONSTRAINT "visit_issues_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "assessment_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "branch_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_consumption" ADD CONSTRAINT "utility_consumption_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce at most one currently active mapping per branch
CREATE UNIQUE INDEX "sfh_branch_mapping_one_current_per_branch_idx" ON "sfh_branch_mapping"("branch_id") WHERE ("is_current" = true);
