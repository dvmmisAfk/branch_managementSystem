import {
  ApprovalStatus,
  Prisma,
  ScoreStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { queryVisitDetail } from "../queries/branchVisitDetail.query.js";
import { HttpError } from "../utils/HttpError.js";

export async function getSfhRecordForUser(userId: string, role: UserRole) {
  if (role !== UserRole.sfh) return null;
  return prisma.stateFacilityHead.findUnique({
    where: { userId },
    select: { id: true, userId: true, employeeCode: true },
  });
}

export async function assertBranchAssignedToSfh(branchId: string, sfhId: string) {
  const ok = await prisma.sfhBranchMapping.findFirst({
    where: {
      branchId,
      sfhId,
      approvalStatus: ApprovalStatus.approved,
      isCurrent: true,
    },
  });
  if (!ok) throw new HttpError("Branch not assigned to you", 403);
}

export async function findPreviousSubmittedVisit(branchId: string, quarterStart: Date) {
  return prisma.branchVisit.findFirst({
    where: {
      branchId,
      isSubmitted: true,
      quarter: { endDate: { lt: quarterStart } },
    },
    select: {
      id: true,
      visitDateActual: true,
      submittedAt: true,
      quarter: true,
      scoreSnapshot: { select: { scorePercentage: true } },
    },
    orderBy: { quarter: { endDate: "desc" } },
  });
}

export async function createVisitDraft(opts: {
  branchId: string;
  quarterId: string;
  sfhId: string;
  sfhUserId: string;
}) {
  await assertBranchAssignedToSfh(opts.branchId, opts.sfhId);
  const existing = await prisma.branchVisit.findUnique({
    where: {
      branchId_quarterId: { branchId: opts.branchId, quarterId: opts.quarterId },
    },
    select: { id: true },
  });
  if (existing) throw new HttpError("Visit already exists for this branch and quarter", 409);

  const quarter = await prisma.quarter.findUniqueOrThrow({
    where: { id: opts.quarterId },
  });
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: opts.branchId },
  });
  const mapping = await prisma.sfhBranchMapping.findFirst({
    where: {
      branchId: opts.branchId,
      sfhId: opts.sfhId,
      approvalStatus: ApprovalStatus.approved,
      isCurrent: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const prev = await findPreviousSubmittedVisit(opts.branchId, quarter.startDate);

  const subs = await prisma.assessmentSubcategory.findMany({
    where: { isActive: true, category: { isActive: true } },
    orderBy: [{ category: { displayOrder: "asc" } }, { displayOrder: "asc" }],
  });

  const visit = await prisma.branchVisit.create({
    data: {
      branchId: opts.branchId,
      sfhId: opts.sfhId,
      quarterId: opts.quarterId,
      mappingId: mapping?.id ?? null,
      visitType: "physical",
      previousVisitDate: prev?.visitDateActual ?? prev?.submittedAt ?? null,
      previousVisitScore:
        prev?.scoreSnapshot ?
          prev.scoreSnapshot.scorePercentage
        : null,
      boiNameSnapshot: branch.boiName ?? null,
      locationHeadSnapshot: branch.branchManagerName ?? null,
      staffOutsourceSnapshot: branch.staffOutsource,
      staffCompanySnapshot: branch.staffCompanyRoll,
      staffHkResourcesSnapshot: branch.staffHkResources,
      staffTalicEmployeesSnapshot: branch.staffTalicEmployees,
      workstationsLinearSnapshot: branch.workstationsLinear,
      workstationsLshapeSnapshot: branch.workstationsLshape,
      workstationsCubicalSnapshot: branch.workstationsCubical,
      scores: {
        createMany: {
          data: subs.map((sub) => ({
            subcategoryId: sub.id,
            status: ScoreStatus.not_applicable,
            scoreGiven: null,
            maxScore: sub.maxScore,
            observations: null,
            remsNumber: null,
            remarks: null,
          })),
        },
      },
    },
  });

  return visit;
}

/** SFH editable facility fields synced to branch master for Step 2 of visit form */
export const branchFacilityPatchSchema = [
  "upsCapacityKva",
  "upsBackupTimeMins",
  "acTonnage",
  "electricityLoadKw",
  "rmsVendorPresent",
  "rmsVendorName",
  "fireExtinguisherCount",
  "dgOwnership",
  "dgCapacityKva",
] as const satisfies readonly (keyof Prisma.BranchUncheckedUpdateInput)[];

export async function applyBranchFacilitySlice(
  branchId: string,
  slice: Partial<
    Pick<
      Prisma.BranchUpdateInput,
      | "upsCapacityKva"
      | "upsBackupTimeMins"
      | "acTonnage"
      | "electricityLoadKw"
      | "rmsVendorPresent"
      | "rmsVendorName"
      | "fireExtinguisherCount"
      | "dgOwnership"
      | "dgCapacityKva"
    >
  >
) {
  await prisma.branch.update({
    where: { id: branchId },
    data: slice,
  });
}

export async function assertVisitReadable(
  visitId: string,
  user: { id: string; role: UserRole }
) {
  const visit = await queryVisitDetail(visitId);
  if (!visit) throw new HttpError("Visit not found", 404);

  if (user.role === UserRole.supervisor) return visit;

  if (user.role === UserRole.sfh && visit.sfh.userId === user.id) return visit;

  throw new HttpError("Forbidden", 403);
}

export async function assertVisitEditableDraft(
  visitId: string,
  user: { id: string; role: UserRole }
) {
  const visit = await assertVisitReadable(visitId, user);
  if (visit.isSubmitted) throw new HttpError("Visit is submitted and cannot be edited", 403);
  if (user.role !== UserRole.sfh || visit.sfh.userId !== user.id) throw new HttpError("Forbidden", 403);
  return visit;
}
