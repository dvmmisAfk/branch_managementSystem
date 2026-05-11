import ExcelJS from "exceljs";
import type { VisitPdfModel } from "./pdfGeneration.service.js";
import { fmtInr, parseVisitUtilityLinesJson } from "./pdfGeneration.service.js";
import { generatedAtLabel, PRODUCT_NAME, XL } from "./excelLayoutBranding.js";

export type ReportSheetMeta = {
  /** Second line under product name (e.g. "Visited branches report") */
  reportTitle: string;
  /** Optional third line detail (e.g. quarter label) */
  subtitle?: string;
};

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: XL.border } },
    left: { style: "thin", color: { argb: XL.border } },
    bottom: { style: "thin", color: { argb: XL.border } },
    right: { style: "thin", color: { argb: XL.border } },
  };
}

/** Rows 1–3 banner; returns 1-based row index where table headers should go (row 5). */
function addWorkbookBanner(sheet: ExcelJS.Worksheet, lastCol: number, meta: ReportSheetMeta): number {
  sheet.mergeCells(1, 1, 1, lastCol);
  const c1 = sheet.getCell(1, 1);
  c1.value = PRODUCT_NAME;
  c1.font = { bold: true, size: 16, color: { argb: XL.brandText } };
  c1.alignment = { vertical: "middle", horizontal: "center" };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.brandFill } };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, lastCol);
  const c2 = sheet.getCell(2, 1);
  c2.value = meta.reportTitle;
  c2.font = { bold: true, size: 13, color: { argb: XL.brandText } };
  c2.alignment = { vertical: "middle", horizontal: "center" };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.headerFill } };
  sheet.getRow(2).height = 24;

  const line3 = [generatedAtLabel(), meta.subtitle].filter(Boolean).join(" · ");
  sheet.mergeCells(3, 1, 3, lastCol);
  const c3 = sheet.getCell(3, 1);
  c3.value = line3;
  c3.font = { size: 10, color: { argb: XL.metaText }, italic: true };
  c3.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(3).height = 18;

  sheet.getRow(4).height = 6;
  return 5;
}

function styleTableHeaderRow(sheet: ExcelJS.Worksheet, row: number, colCount: number): void {
  for (let c = 1; c <= colCount; c++) {
    const cell = sheet.getCell(row, c);
    cell.font = { bold: true, size: 11, color: { argb: XL.headerText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.headerFill } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  }
  sheet.getRow(row).height = 22;
}

function writeDataRowsZebra(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  colCount: number,
  rows: (string | number | null)[][],
): number {
  let r = startRow;
  for (let i = 0; i < rows.length; i++) {
    const fill = i % 2 === 0 ? XL.zebraA : XL.zebraB;
    for (let c = 1; c <= colCount; c++) {
      const cell = sheet.getCell(r, c);
      const v = rows[i]![c - 1];
      cell.value = v === null || v === undefined ? "" : v;
      cell.font = { size: 10, color: { argb: XL.labelStrong } };
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = thinBorder();
    }
    sheet.getRow(r).height = 18;
    r++;
  }
  return r;
}

function addSectionTitleRow(sheet: ExcelJS.Worksheet, row: number, lastCol: number, title: string): void {
  sheet.mergeCells(row, 1, row, lastCol);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 12, color: { argb: XL.sectionText } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.sectionFill } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(row).height = 22;
}

export async function buildVisitExcelBuffer(model: VisitPdfModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT_NAME;
  wb.created = new Date();
  wb.title = "Branch visit report";

  const maxCols = 9;

  const sum = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  sum.columns = [{ width: 22 }, { width: 36 }, { width: 18 }, { width: 28 }];

  addSectionTitleRow(sum, 1, 4, "Document overview");
  let r = 2;
  const kv: [string, string | number][] = [
    ["Branch", model.branch.branchName],
    ["Branch code", model.branch.branchCode],
    ["Zone / State", `${model.branch.zone ?? ""} / ${model.branch.state ?? ""}`.replace(/^ \/ | \/ $/g, "").trim() || "—"],
    ["Visit date", model.visitDateActual?.toISOString().slice(0, 10) ?? "—"],
    ["Quarter", model.quarter.label ?? "—"],
    ["SFH", model.sfh.user.name],
    ["Visit type", model.visitType],
    [
      "Previous visit",
      model.previousVisitDate?.toISOString().slice(0, 10) ?? "—",
    ],
    ["Previous score", model.previousVisitScore != null ? String(model.previousVisitScore) : "—"],
  ];
  for (const [k, v] of kv) {
    sum.getCell(r, 1).value = k;
    sum.getCell(r, 1).font = { bold: true, color: { argb: XL.headerFill } };
    sum.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.zebraB } };
    sum.getCell(r, 1).border = thinBorder();
    sum.getCell(r, 2).value = v;
    sum.getCell(r, 2).alignment = { wrapText: true };
    sum.getCell(r, 2).border = thinBorder();
    if (r % 2 === 0) {
      sum.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.zebraA } };
    } else {
      sum.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.zebraB } };
    }
    r++;
  }
  sum.getCell(r + 1, 1).value = generatedAtLabel();
  sum.getCell(r + 1, 1).font = { italic: true, size: 9, color: { argb: XL.metaText } };

  const scoreHeaders = ["S.No", "Category", "Measurable point", "Status", "Observations", "REMS", "Given", "Max", "Remarks"];
  const scores = wb.addWorksheet("Scores", {
    views: [{ state: "frozen", ySplit: 5 }],
    properties: { defaultRowHeight: 18 },
  });
  scores.columns = scoreHeaders.map(() => ({ width: 14 }));
  scores.getColumn(3).width = 28;
  scores.getColumn(5).width = 32;
  scores.getColumn(9).width = 24;

  const hdrRow = addWorkbookBanner(scores, maxCols, {
    reportTitle: "Assessment scores (detail)",
    subtitle: `${model.branch.branchCode} · ${model.quarter.label ?? ""}`,
  });
  for (let c = 0; c < scoreHeaders.length; c++) {
    scores.getCell(hdrRow, c + 1).value = scoreHeaders[c];
  }
  styleTableHeaderRow(scores, hdrRow, scoreHeaders.length);
  const sorted = [...model.scores].sort(
    (a, b) =>
      a.subcategory.category.displayOrder - b.subcategory.category.displayOrder ||
      a.subcategory.displayOrder - b.subcategory.displayOrder
  );
  let i = 1;
  const scoreData = sorted.map((s) => [
    i++,
    s.subcategory.category.name,
    s.subcategory.name,
    s.status,
    s.observations ?? "",
    s.remsNumber ?? "",
    s.scoreGiven ?? "",
    s.maxScore,
    s.remarks ?? "",
  ]) as (string | number | null)[][];
  writeDataRowsZebra(scores, hdrRow + 1, scoreHeaders.length, scoreData);

  const util = wb.addWorksheet("Utility", { views: [{ state: "frozen", ySplit: 5 }] });
  const utilHeaders = ["Particulars", "Q1", "Q2", "Q3", "Action points"];
  util.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 40 }];
  const uHdr = addWorkbookBanner(util, utilHeaders.length, {
    reportTitle: "Utility consumption",
    subtitle: `${model.quarter.label ?? `FY-${model.quarter.financialYear}`} · ${model.branch.branchCode}`,
  });
  const q1 = model.utilityByQ[0];
  const q2 = model.utilityByQ[1];
  const q3 = model.utilityByQ[2];
  for (let c = 0; c < utilHeaders.length; c++) util.getCell(uHdr, c + 1).value = utilHeaders[c];
  styleTableHeaderRow(util, uHdr, utilHeaders.length);
  const utilRows: (string | number | null)[][] = [
    [
      "Electricity (₹)",
      q1?.electricityBillAmount != null ? fmtInr(q1.electricityBillAmount) : "",
      q2?.electricityBillAmount != null ? fmtInr(q2.electricityBillAmount) : "",
      q3?.electricityBillAmount != null ? fmtInr(q3.electricityBillAmount) : "",
      [q1?.actionPointsExpenses, q2?.actionPointsExpenses, q3?.actionPointsExpenses].filter(Boolean).join(" | "),
    ],
    [
      "Units consumed",
      q1?.unitsConsumed != null ? fmtInr(q1.unitsConsumed) : "",
      q2?.unitsConsumed != null ? fmtInr(q2.unitsConsumed) : "",
      q3?.unitsConsumed != null ? fmtInr(q3.unitsConsumed) : "",
      "",
    ],
    [
      "OT expenses (₹)",
      q1?.otExpenses != null ? fmtInr(q1.otExpenses) : "",
      q2?.otExpenses != null ? fmtInr(q2.otExpenses) : "",
      q3?.otExpenses != null ? fmtInr(q3.otExpenses) : "",
      "",
    ],
  ];
  let uRow = writeDataRowsZebra(util, uHdr + 1, utilHeaders.length, utilRows);
  uRow += 1;
  addSectionTitleRow(util, uRow, utilHeaders.length, "Additional utility (this visit)");
  uRow++;
  util.getCell(uRow, 1).value = "Electricity (last quarter) (₹)";
  util.getCell(uRow, 1).font = { bold: true };
  util.getCell(uRow, 2).value =
    model.electricityLastQuarter != null ? fmtInr(Number(model.electricityLastQuarter)) : "";
  uRow++;
  const visitLines = parseVisitUtilityLinesJson(model.utilityLinesJson);
  if (visitLines.length) {
    const subH = ["Category", "Sub category", "Amount (₹)"];
    for (let c = 0; c < subH.length; c++) util.getCell(uRow, c + 1).value = subH[c];
    styleTableHeaderRow(util, uRow, subH.length);
    uRow++;
    uRow = writeDataRowsZebra(
      util,
      uRow,
      subH.length,
      visitLines.map((L) => [L.category, L.subCategory, fmtInr(L.amount)]),
    );
  }

  const issuesWs = wb.addWorksheet("Issues", { views: [{ state: "frozen", ySplit: 5 }] });
  const issueHeaders = ["Category", "Issue", "Scheduled closure", "Status"];
  issuesWs.columns = [{ width: 22 }, { width: 42 }, { width: 18 }, { width: 16 }];
  const iHdr = addWorkbookBanner(issuesWs, issueHeaders.length, {
    reportTitle: "Issues log",
    subtitle: model.branch.branchCode,
  });
  for (let c = 0; c < issueHeaders.length; c++) issuesWs.getCell(iHdr, c + 1).value = issueHeaders[c];
  styleTableHeaderRow(issuesWs, iHdr, issueHeaders.length);
  const issueData = model.issues.map((it) => [
    it.category.name,
    it.issueDescription,
    it.scheduledClosureDate?.toISOString().slice(0, 10) ?? "",
    it.issueStatus,
  ]) as (string | number | null)[][];
  writeDataRowsZebra(issuesWs, iHdr + 1, issueHeaders.length, issueData);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildVisitedBranchesSheet(
  rows: {
    branchCode: string;
    sapCode: string | null;
    location: string | null;
    city: string | null;
    state: string | null;
    sfhName: string;
    visitDate: string | null;
    visitType: string;
    scorePct: string | number | null;
    band: string | null;
    quarterLabel: string | null;
  }[],
  meta?: Partial<ReportSheetMeta>,
): Promise<Buffer> {
  const headers = [
    "Branch code",
    "SAP code",
    "Location",
    "City",
    "State",
    "SFH name",
    "Visit date",
    "Visit type",
    "Score %",
    "Band",
    "Quarter",
  ];
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT_NAME;
  const sheet = wb.addWorksheet("Visited branches", {
    views: [{ state: "frozen", ySplit: 5 }],
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = headers.map(() => ({ width: 14 }));
  sheet.getColumn(3).width = 26;
  sheet.getColumn(6).width = 22;

  const hdrRow = addWorkbookBanner(sheet, headers.length, {
    reportTitle: meta?.reportTitle ?? "Visited branches report",
    subtitle: meta?.subtitle,
  });
  for (let c = 0; c < headers.length; c++) sheet.getCell(hdrRow, c + 1).value = headers[c];
  styleTableHeaderRow(sheet, hdrRow, headers.length);
  const data = rows.map((r) => [
    r.branchCode,
    r.sapCode,
    r.location,
    r.city,
    r.state,
    r.sfhName,
    r.visitDate,
    r.visitType,
    r.scorePct,
    r.band,
    r.quarterLabel,
  ]) as (string | number | null)[][];
  writeDataRowsZebra(sheet, hdrRow + 1, headers.length, data);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildPendingBranchesSheet(
  rows: {
    branchCode: string;
    sapCode: string | null;
    location: string | null;
    city: string | null;
    state: string | null;
    sfhName: string;
    quarterLabel: string | null;
    daysRemaining: number | null;
  }[],
  meta?: Partial<ReportSheetMeta>,
): Promise<Buffer> {
  const headers = [
    "Branch code",
    "SAP code",
    "Location",
    "City",
    "State",
    "SFH name",
    "Quarter",
    "Days remaining in quarter",
  ];
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT_NAME;
  const sheet = wb.addWorksheet("Pending branches", { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.columns = headers.map(() => ({ width: 14 }));
  sheet.getColumn(3).width = 26;
  const hdrRow = addWorkbookBanner(sheet, headers.length, {
    reportTitle: meta?.reportTitle ?? "Pending branches report",
    subtitle: meta?.subtitle,
  });
  for (let c = 0; c < headers.length; c++) sheet.getCell(hdrRow, c + 1).value = headers[c];
  styleTableHeaderRow(sheet, hdrRow, headers.length);
  const data = rows.map((r) => [
    r.branchCode,
    r.sapCode,
    r.location,
    r.city,
    r.state,
    r.sfhName,
    r.quarterLabel,
    r.daysRemaining,
  ]) as (string | number | null)[][];
  writeDataRowsZebra(sheet, hdrRow + 1, headers.length, data);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildYearlySummaryWorkbook(
  sheets: { name: string; aoa: (string | number | null)[][] }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT_NAME;
  for (const sh of sheets) {
    const safeName = sh.name.slice(0, 31).replace(/[*?:/\\[\]]/g, "-");
    const ws = wb.addWorksheet(safeName, { views: [{ state: "frozen", ySplit: 5 }] });
    const aoa = sh.aoa;
    if (!aoa.length) continue;
    const colCount = aoa[0]!.length;
    ws.columns = Array.from({ length: colCount }, () => ({ width: 14 }));
    const hdrRow = addWorkbookBanner(ws, colCount, {
      reportTitle: `Yearly summary — ${safeName}`,
      subtitle: "Submitted visits · organisation data",
    });
    const headers = aoa[0]!.map((h) => (h === null || h === undefined ? "" : String(h)));
    for (let c = 0; c < colCount; c++) ws.getCell(hdrRow, c + 1).value = headers[c] ?? "";
    styleTableHeaderRow(ws, hdrRow, colCount);
    const body = aoa.slice(1).map((row) =>
      Array.from({ length: colCount }, (_, i) => row[i] ?? ""),
    ) as (string | number | null)[][];
    writeDataRowsZebra(ws, hdrRow + 1, colCount, body);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildIssuesSummarySheet(
  rows: {
    branchName: string;
    branchCode: string;
    visitDate: string | null;
    category: string;
    description: string;
    closure: string | null;
    status: string;
  }[],
  meta?: Partial<ReportSheetMeta>,
): Promise<Buffer> {
  const headers = [
    "Branch name",
    "Branch code",
    "Visit date",
    "Category",
    "Issue description",
    "Scheduled closure",
    "Status",
  ];
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT_NAME;
  const sheet = wb.addWorksheet("Issues summary", { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.columns = [{ width: 24 }, { width: 14 }, { width: 12 }, { width: 20 }, { width: 40 }, { width: 16 }, { width: 14 }];
  const hdrRow = addWorkbookBanner(sheet, headers.length, {
    reportTitle: meta?.reportTitle ?? "Issues summary report",
    subtitle: meta?.subtitle,
  });
  for (let c = 0; c < headers.length; c++) sheet.getCell(hdrRow, c + 1).value = headers[c];
  styleTableHeaderRow(sheet, hdrRow, headers.length);
  const data = rows.map((r) => [r.branchName, r.branchCode, r.visitDate, r.category, r.description, r.closure, r.status]) as (
    | string
    | number
    | null
  )[][];
  writeDataRowsZebra(sheet, hdrRow + 1, headers.length, data);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
