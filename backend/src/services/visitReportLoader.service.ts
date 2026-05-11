import { prisma } from "../lib/prisma.js";
import type { VisitPdfModel } from "./pdfGeneration.service.js";
import { queryVisitDetailOrThrow } from "../queries/branchVisitDetail.query.js";

export async function loadVisitPdfModel(visitId: string): Promise<VisitPdfModel> {
  const visit = await queryVisitDetailOrThrow(visitId);

  const fy = visit.quarter.financialYear;
  const utils = await prisma.utilityConsumption.findMany({
    where: { branchId: visit.branchId, financialYear: fy, quarterNumber: { in: [1, 2, 3] } },
    orderBy: { quarterNumber: "asc" },
  });
  const byQ: VisitPdfModel["utilityByQ"] = [undefined, undefined, undefined];
  for (const u of utils) {
    const i = u.quarterNumber - 1;
    if (i >= 0 && i < 3) {
      byQ[i] = {
        electricityBillAmount: u.electricityBillAmount ? Number(u.electricityBillAmount) : null,
        unitsConsumed: u.unitsConsumed ? Number(u.unitsConsumed) : null,
        otExpenses: u.otExpenses ? Number(u.otExpenses) : null,
        actionPointsExpenses: u.actionPointsExpenses ?? null,
      };
    }
  }

  return { ...(visit as unknown as VisitPdfModel), utilityByQ: byQ };
}
