import { prisma } from "../lib/prisma.js";

function financialYearStart(d: Date): number {
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? y : y - 1;
}

function label(fyStart: number, q: number): string {
  const a = String(fyStart).slice(-2);
  const b = String(fyStart + 1).slice(-2);
  return `FY${a}-${b} Q${q}`;
}

function quartersForFY(fyStart: number) {
  const y = fyStart;
  return [
    {
      financialYear: fyStart,
      quarterNumber: 1,
      startDate: new Date(Date.UTC(y, 3, 1)),
      endDate: new Date(Date.UTC(y, 6, 31)),
      label: label(fyStart, 1),
    },
    {
      financialYear: fyStart,
      quarterNumber: 2,
      startDate: new Date(Date.UTC(y, 7, 1)),
      endDate: new Date(Date.UTC(y, 10, 30)),
      label: label(fyStart, 2),
    },
    {
      financialYear: fyStart,
      quarterNumber: 3,
      startDate: new Date(Date.UTC(y, 11, 1)),
      endDate: new Date(Date.UTC(y + 1, 2, 31)),
      label: label(fyStart, 3),
    },
  ];
}

/** Ensure FY…FY+3 (4 years × 3 Q = 12 quarters) ahead of FY(financialYearStart(now)) minus 1 for history — spec: current + next 2 FY = 9 Q; bump to 12 for buffer. */
export async function ensureQuartersAhead(now = new Date()) {
  const fy0 = financialYearStart(now);
  const fys = [fy0 - 1, fy0, fy0 + 1, fy0 + 2];
  const all = fys.flatMap((fy) => quartersForFY(fy));
  for (const q of all) {
    await prisma.quarter.upsert({
      where: {
        financialYear_quarterNumber: {
          financialYear: q.financialYear,
          quarterNumber: q.quarterNumber,
        },
      },
      update: {
        startDate: q.startDate,
        endDate: q.endDate,
        label: q.label ?? undefined,
      },
      create: q,
    });
  }
}
