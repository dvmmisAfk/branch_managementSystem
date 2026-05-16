import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/** Branch visit scalars except utility columns added in `visit_utility_fields` migration. */
export const branchVisitScalarCore = {
  id: true,
  branchId: true,
  sfhId: true,
  quarterId: true,
  mappingId: true,
  visitDateActual: true,
  visitDateLockedAt: true,
  previousVisitDate: true,
  previousVisitScore: true,
  visitType: true,
  virtualStaffContactName: true,
  virtualStaffContactPhone: true,
  reasonForNoVisit: true,
  boiNameSnapshot: true,
  locationHeadSnapshot: true,
  staffOutsourceSnapshot: true,
  staffCompanySnapshot: true,
  staffHkResourcesSnapshot: true,
  staffTalicEmployeesSnapshot: true,
  workstationsLinearSnapshot: true,
  workstationsLshapeSnapshot: true,
  workstationsCubicalSnapshot: true,
  isInfraUpgrade: true,
  landlordIssue: true,
  landlordIssueDetails: true,
  incidentPreviousVisit: true,
  incidentPreviousVisitDetails: true,
  auditPointsObserved: true,
  auditPointsDetails: true,
  majorEscalation: true,
  escalationDetails: true,
  escalationClosureDate: true,
  isSubmitted: true,
  submittedAt: true,
  signedSfhAt: true,
  signedOpsInchargeAt: true,
  signedLocationHeadAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchVisitSelect;

const branchVisitScalarUtility = {
  electricityLastQuarter: true,
  utilityLinesJson: true,
} satisfies Prisma.BranchVisitSelect;

export function visitDetailSelect(includeUtilityColumns: boolean): Prisma.BranchVisitSelect {
  return {
    ...(includeUtilityColumns ?
      { ...branchVisitScalarCore, ...branchVisitScalarUtility }
    : branchVisitScalarCore),
    branch: true,
    quarter: true,
    sfh: {
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
    },
    scores: {
      include: {
        subcategory: {
          include: {
            category: { select: { id: true, name: true, displayOrder: true } },
          },
        },
      },
    },
    issues: { include: { category: true } },
    scoreSnapshot: true,
    mapping: true,
  };
}

export function isMissingUtilityColumnsError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2022") return true;
    const meta = e.meta as { column?: unknown } | undefined;
    const col = typeof meta?.column === "string" ? meta.column : "";
    if (col.includes("electricity_last_quarter") || col.includes("utility_lines_json")) return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("electricity_last_quarter") || msg.includes("utility_lines_json");
}

/** Single visit for API detail / auth — retries without utility columns if DB predates that migration. */
export async function queryVisitDetail(visitId: string) {
  try {
    return await prisma.branchVisit.findUnique({
      where: { id: visitId },
      select: visitDetailSelect(true),
    });
  } catch (e) {
    if (!isMissingUtilityColumnsError(e)) throw e;
    return prisma.branchVisit.findUnique({
      where: { id: visitId },
      select: visitDetailSelect(false),
    });
  }
}

export async function queryVisitDetailOrThrow(visitId: string) {
  const v = await queryVisitDetail(visitId);
  if (!v) throw new Error(`BranchVisit not found: ${visitId}`);
  return v;
}
