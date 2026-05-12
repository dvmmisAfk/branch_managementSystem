-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "visit_edit_requests" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "sfh_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_edit_requests_visit_id_idx" ON "visit_edit_requests"("visit_id");

-- CreateIndex
CREATE INDEX "visit_edit_requests_status_idx" ON "visit_edit_requests"("status");

-- AddForeignKey
ALTER TABLE "visit_edit_requests" ADD CONSTRAINT "visit_edit_requests_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "branch_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_edit_requests" ADD CONSTRAINT "visit_edit_requests_sfh_id_fkey" FOREIGN KEY ("sfh_id") REFERENCES "state_facility_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_edit_requests" ADD CONSTRAINT "visit_edit_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
