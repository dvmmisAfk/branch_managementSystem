import { prisma } from "../lib/prisma.js";
import type { VisitPdfModel } from "./pdfGeneration.service.js";
import { queryVisitDetailForReportOrThrow } from "../queries/branchVisitDetail.query.js";

export async function loadVisitPdfModel(visitId: string): Promise<VisitPdfModel> {
  const visit = await queryVisitDetailForReportOrThrow(visitId);
  const fy = visit.quarter.financialYear;

  const fyQuarters = await prisma.quarter.findMany({
    where: { financialYear: fy },
    orderBy: { quarterNumber: "asc" },
  });

  const qNums = fyQuarters.map((q) => q.quarterNumber);
  const utils = await prisma.utilityConsumption.findMany({
    where: {
      branchId: visit.branchId,
      financialYear: fy,
      ...(qNums.length ? { quarterNumber: { in: qNums } } : {}),
    },
    orderBy: { quarterNumber: "asc" },
  });

  const utilityByQ: VisitPdfModel["utilityByQ"] = fyQuarters.map(() => undefined);
  const utilityQuarterLabels = fyQuarters.map((q) => q.label ?? `Q${q.quarterNumber}`);

  for (const u of utils) {
    const i = fyQuarters.findIndex((q) => q.quarterNumber === u.quarterNumber);
    if (i < 0) continue;
    utilityByQ[i] = {
      electricityBillAmount: u.electricityBillAmount ? Number(u.electricityBillAmount) : null,
      unitsConsumed: u.unitsConsumed ? Number(u.unitsConsumed) : null,
      otExpenses: u.otExpenses ? Number(u.otExpenses) : null,
      actionPointsExpenses: u.actionPointsExpenses ?? null,
    };
  }

  return {
    ...visit,
    utilityByQ,
    utilityQuarterLabels,
  };
}
