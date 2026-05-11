import puppeteer from "puppeteer";
import type { Prisma } from "@prisma/client";
import { generatedAtLabel, PRODUCT_NAME } from "./excelLayoutBranding.js";

export function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const t = String(s);
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Indian number grouping for ₹ display */
export function fmtInr(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === "") return "–";
  const num = typeof n === "number" ? n : parseFloat(String(n).replace(/,/g, ""));
  if (!Number.isFinite(num)) return String(n);
  return new Intl.NumberFormat("en-IN").format(Math.round(num * 100) / 100);
}

export type VisitPdfModel = Prisma.BranchVisitGetPayload<{
  include: {
    sfh: { include: { user: true } };
    branch: true;
    quarter: true;
    scores: { include: { subcategory: { include: { category: true } } } };
    issues: { include: { category: true } };
    scoreSnapshot: true;
  };
}> & {
  utilityByQ: ({
    electricityBillAmount: string | number | null;
    unitsConsumed: string | number | null;
    otExpenses: string | number | null;
    actionPointsExpenses: string | null;
  } | undefined)[];
};

export type VisitUtilityLineRow = { category: string; subCategory: string; amount: number };

/** Parses `branch_visits.utility_lines_json` for PDF/Excel. */
export function parseVisitUtilityLinesJson(json: unknown): VisitUtilityLineRow[] {
  if (!Array.isArray(json)) return [];
  const out: VisitUtilityLineRow[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const category = String(r.category ?? "").trim();
    const subRaw = r.sub_category ?? r.subCategory;
    const subCategory = String(subRaw ?? "").trim();
    const rawAmt = r.amount;
    let amount = 0;
    if (typeof rawAmt === "number" && Number.isFinite(rawAmt)) amount = rawAmt;
    else if (rawAmt != null && rawAmt !== "") {
      const p = parseFloat(String(rawAmt));
      if (Number.isFinite(p)) amount = p;
    }
    if (!category && !subCategory && amount === 0) continue;
    out.push({ category, subCategory, amount });
  }
  return out;
}

/** Shared print stylesheet for management PDFs (A4, Puppeteer). */
const PDF_DOCUMENT_CSS = `
  :root { --brand:#1e1b4b; --brand-mid:#312e81; --accent:#4f46e5; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --zebra:#f8fafc; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; margin: 0; color: var(--ink); font-size: 11px; line-height: 1.45; }
  .pdf-header { background: linear-gradient(135deg, var(--brand) 0%, var(--brand-mid) 100%); color: #fff; padding: 14px 20px; }
  .pdf-header .product { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.9; }
  .pdf-header .doc-title { font-size: 18px; font-weight: 700; margin: 4px 0 0; }
  .pdf-header .meta { font-size: 10px; opacity: 0.85; margin-top: 6px; }
  .pdf-main { padding: 16px 20px 24px; }
  .pdf-footer { border-top: 1px solid var(--line); padding: 10px 20px; font-size: 9px; color: var(--muted); text-align: center; }
  .sec { margin-bottom: 18px; page-break-inside: avoid; }
  .sec-title { font-size: 13px; font-weight: 700; color: var(--brand); border-bottom: 2px solid var(--accent); padding-bottom: 4px; margin: 0 0 10px; }
  h3.sec-title { font-size: 12px; margin-top: 4px; }
  .sec-sub { font-size: 10px; color: var(--muted); margin: -6px 0 10px; }
  .kv { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .kv td { padding: 6px 8px; border: 1px solid var(--line); vertical-align: top; }
  .kv td.k { width: 18%; font-weight: 600; background: var(--zebra); color: var(--brand-mid); font-size: 10px; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 6px; }
  .tbl thead th { background: var(--brand-mid); color: #fff; padding: 8px 6px; text-align: left; font-weight: 600; border: 1px solid #1e1b4b; }
  .tbl td { padding: 7px 6px; border: 1px solid var(--line); vertical-align: top; }
  .tbl tbody tr:nth-child(even) td { background: var(--zebra); }
  .tbl .total td { background: #e0e7ff; font-weight: 700; }
  .score-box { text-align: center; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: linear-gradient(180deg,#fafafa,#fff); }
  .score-box .pct { font-size: 32px; font-weight: 800; color: var(--accent); line-height: 1.1; }
  .score-box .band { font-size: 14px; font-weight: 700; color: var(--brand); margin-top: 4px; }
  .sign-row { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 12px; }
  .sign-row td { text-align: center; color: var(--muted); font-size: 10px; width: 33%; }
  h1.cover { text-align: center; font-size: 20px; color: var(--brand); margin: 8px 0 4px; }
  .cover-sub { text-align: center; font-size: 12px; color: var(--muted); margin-bottom: 16px; }
`;

/** Wraps inner HTML in a standard corporate PDF shell (header + footer). */
export function wrapStandardReportPage(parts: { documentTitle: string; subtitle?: string; bodyHtml: string }): string {
  const meta = [generatedAtLabel(), parts.subtitle].filter(Boolean).join(" · ");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(parts.documentTitle)}</title>
<style>${PDF_DOCUMENT_CSS}</style></head><body>
<header class="pdf-header">
  <div class="product">${escapeHtml(PRODUCT_NAME)}</div>
  <div class="doc-title">${escapeHtml(parts.documentTitle)}</div>
  <div class="meta">${escapeHtml(meta)}</div>
</header>
<main class="pdf-main">${parts.bodyHtml}</main>
<footer class="pdf-footer">Internal use only · ${escapeHtml(PRODUCT_NAME)} · Do not distribute outside authorised channels.</footer>
</body></html>`;
}

function buildVisitHtml(model: VisitPdfModel): string {
  const snap = model.scoreSnapshot;
  const pct = snap ? `${snap.scorePercentage}%` : "–";
  const band = snap?.scoreBand ?? "–";

  const summaryRows: string[] = [];
  let sn = 1;
  if (snap?.categoryBreakdown && typeof snap.categoryBreakdown === "object") {
    const jb = snap.categoryBreakdown as Record<string, { earned: number; max: number; pct: number }>;
    for (const [name, v] of Object.entries(jb).sort(([a], [b]) => a.localeCompare(b))) {
      summaryRows.push(
        `<tr><td>${escapeHtml(sn++)}</td><td>${escapeHtml(name)}</td><td>${v.earned}</td><td>${v.max}</td><td>${v.pct}%</td><td></td></tr>`
      );
    }
  }

  summaryRows.push(
    `<tr class="total"><td colspan="2">Grand total</td><td>${escapeHtml(String(snap?.totalPointsEarned ?? "–"))}</td><td>${escapeHtml(String(snap?.totalMaxPoints ?? "–"))}</td><td>${escapeHtml(String(pct))}</td><td></td></tr>`
  );

  const categories = [...new Set(model.scores.map((x) => x.subcategory.category.name))].sort();
  let detailSections = "";
  let sno = 1;
  for (const catName of categories) {
    const rowsForCat = model.scores.filter((r) => r.subcategory.category.name === catName);
    let body = "";
    for (const r of rowsForCat) {
      body += `<tr><td>${sno++}</td><td>${escapeHtml(r.subcategory.name)}</td><td>${escapeHtml(
        r.subcategory.description || ""
      )}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.observations)}</td><td>${escapeHtml(r.remsNumber)}</td><td>${escapeHtml(
        String(r.scoreGiven ?? "")
      )}</td><td>${r.maxScore}</td><td>${escapeHtml(r.remarks)}</td></tr>`;
    }
    detailSections += `
    <section class="sec">
    <h3 class="sec-title">${escapeHtml(catName)}</h3>
    <table class="tbl">
      <thead><tr>
        <th>S.No</th><th>Measurable point</th><th>Check points</th><th>Status</th><th>Observations</th><th>REMS</th><th>Points given</th><th>Max</th><th>Remarks by SFH</th>
      </tr></thead><tbody>
      ${body}
    </tbody></table></section>`;
  }

  let issuesRows = "";
  for (let i = 0; i < model.issues.length; i++) {
    const it = model.issues[i];
    issuesRows += `<tr><td>${i + 1}</td><td>${escapeHtml(it.category.name)}</td><td>${escapeHtml(
      it.issueDescription
    )}</td><td>${escapeHtml(it.scheduledClosureDate?.toISOString().slice(0, 10) ?? "")}</td><td>${escapeHtml(
      it.issueStatus
    )}</td></tr>`;
  }

  const hdr = `<thead><tr>
    <th>Particulars</th><th>FY-Q1</th><th>FY-Q2</th><th>FY-Q3</th><th>Action points to reduce expenses</th>
  </tr></thead>`;
  const combineActions =
    model.utilityByQ.map((x) => x?.actionPointsExpenses ?? "").filter(Boolean).join("; ") || "–";
  const utilTbl =
    hdr +
    `<tbody>` +
    `<tr><td>Electricity (₹)</td>${[0, 1, 2]
      .map((i) => {
        const rowu = model.utilityByQ[i];
        const v =
          rowu?.electricityBillAmount === null || rowu?.electricityBillAmount === undefined ?
            "–"
          : fmtInr(rowu.electricityBillAmount);
        return `<td>${escapeHtml(v)}</td>`;
      })
      .join("")}<td rowspan="3">${escapeHtml(combineActions)}</td></tr>` +
    `<tr><td>Units consumed</td>${[0, 1, 2]
      .map((i) => {
        const rowu = model.utilityByQ[i];
        const has = rowu?.unitsConsumed !== null && rowu?.unitsConsumed !== undefined;
        return `<td>${escapeHtml(has ? fmtInr(rowu!.unitsConsumed) : "–")}</td>`;
      })
      .join("")}</tr>` +
    `<tr><td>OT Expenses (₹)</td>${[0, 1, 2]
      .map((i) => {
        const rowu = model.utilityByQ[i];
        const v =
          rowu?.otExpenses === null || rowu?.otExpenses === undefined ? "–" : fmtInr(rowu.otExpenses);
        return `<td>${escapeHtml(v)}</td>`;
      })
      .join("")}</tr></tbody>`;

  const b = model.branch;

  function branchTechLine() {
    const ups = `${b.upsCapacityKva ?? "–"} / ${b.upsBackupTimeMins ?? "–"} mins`;
    const dg = `${b.dgOwnership} — ${b.dgCapacityKva ?? "–"} KVA`;
    return `
      UPS (KVA) & Backup Time: ${escapeHtml(ups)} · AC Tonnage: ${escapeHtml(String(b.acTonnage ?? "–"))} · Electricity Load: ${escapeHtml(
        String(b.electricityLoadKw ?? "–")
      )} KW
      <div>RMS Vendor: ${escapeHtml(String(b.rmsVendorPresent ? "Yes" : "No"))}${b.rmsVendorName ? ` — ${escapeHtml(b.rmsVendorName)}` : ""} · FE Count: ${escapeHtml(
        String(b.fireExtinguisherCount ?? 0)
      )} · DG: ${escapeHtml(dg)}</div>`;
  }

  const visitUtilityLines = parseVisitUtilityLinesJson(model.utilityLinesJson);
  const elq =
    model.electricityLastQuarter === null || model.electricityLastQuarter === undefined ?
      "–"
    : fmtInr(Number(model.electricityLastQuarter));

  let visitUtilExtra = `
<section class="sec">
<h3 class="sec-title">Additional utility (this visit)</h3>
<p class="sec-sub"><strong>Electricity (last quarter)</strong>: ${escapeHtml(elq)}</p>`;
  if (visitUtilityLines.length) {
    visitUtilExtra += `<table class="tbl"><thead><tr><th>#</th><th>Category</th><th>Sub category</th><th>Amount (₹)</th></tr></thead><tbody>`;
    visitUtilityLines.forEach((row, i) => {
      visitUtilExtra += `<tr><td>${i + 1}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.subCategory)}</td><td>${escapeHtml(fmtInr(row.amount))}</td></tr>`;
    });
    visitUtilExtra += `</tbody></table>`;
  }
  visitUtilExtra += `</section>`;

  const innerBody = `
<h1 class="cover">Branch visit report</h1>
<div class="cover-sub">Snapshot of assessment, utility, and issues · ${escapeHtml(b.branchCode)}</div>

<section class="sec">
  <h2 class="sec-title">Branch profile</h2>
  <table class="kv">
    <tr><td class="k">Branch</td><td>${escapeHtml(b.branchName)}</td><td class="k">Branch code</td><td>${escapeHtml(b.branchCode)}</td></tr>
    <tr><td class="k">Zone / state</td><td colspan="3">${escapeHtml(`${b.zone ?? ""}${b.zone && b.state ? " / " : ""}${b.state ?? ""}`)}</td></tr>
    <tr><td class="k">Branch type</td><td>${escapeHtml(b.branchType)}</td><td class="k">Operational date</td><td>${escapeHtml(b.dateOfOperationalization?.toISOString().slice(0, 10) ?? "—")}</td></tr>
    <tr><td class="k">Carpet area (sq.ft)</td><td colspan="3">${escapeHtml(String(b.carpetAreaSqft ?? "—"))}</td></tr>
  </table>
</section>

<section class="sec">
  <h2 class="sec-title">Visit overview</h2>
  <p class="sec-sub">Visit date <strong>${escapeHtml(model.visitDateActual?.toISOString().slice(0, 10) ?? "—")}</strong> · Previous visit ${escapeHtml(model.previousVisitDate?.toISOString().slice(0, 10) ?? "—")} · Previous score ${escapeHtml(String(model.previousVisitScore ?? "—"))} · <strong>${escapeHtml(model.visitType)}</strong>${model.visitType === "virtual" ? ` · Staff contact: ${escapeHtml(model.virtualStaffContactName ?? "")} / ${escapeHtml(model.virtualStaffContactPhone ?? "")}` : ""}</p>
  <p><strong>Reason for no visit (if any):</strong> ${escapeHtml(model.reasonForNoVisit ?? "—")}</p>
  <p><strong>State facilities head:</strong> ${escapeHtml(model.sfh.user.name)}</p>
  <p><strong>BOI / Location head / Ops incharge:</strong> ${escapeHtml(model.boiNameSnapshot ?? "—")} · ${escapeHtml(model.locationHeadSnapshot ?? "—")} · ${escapeHtml(model.branchOpsInchargeSnapshot ?? "—")}</p>
  <p><strong>Staff (snapshot):</strong> Outsource ${model.staffOutsourceSnapshot ?? "—"}, Company ${escapeHtml(String(model.staffCompanySnapshot ?? "—"))}, HK ${escapeHtml(String(model.staffHkResourcesSnapshot ?? "—"))}, TALIC ${escapeHtml(String(model.staffTalicEmployeesSnapshot ?? "—"))}</p>
  <p><strong>Workstations:</strong> Linear ${model.workstationsLinearSnapshot ?? "—"}, L-shape ${model.workstationsLshapeSnapshot ?? "—"}, Cubical ${model.workstationsCubicalSnapshot ?? "—"}</p>
  <p><strong>Technical (branch master)</strong><br/>${branchTechLine()}</p>
  <p><strong>Flags:</strong> Infra upgrade ${model.isInfraUpgrade ? "Yes" : "No"} · Landlord issue ${model.landlordIssue ? `Yes — ${escapeHtml(model.landlordIssueDetails ?? "")}` : "No"} · Incident since last ${escapeHtml(model.incidentPreviousVisit ? model.incidentPreviousVisitDetails ?? "Yes" : "No")} · Audit points ${escapeHtml(model.auditPointsObserved ? model.auditPointsDetails ?? "Yes" : "No")} · Escalation ${escapeHtml(model.majorEscalation ? `${model.escalationDetails ?? ""} (${model.escalationClosureDate?.toISOString().slice(0, 10) ?? ""})` : "No")}</p>
</section>

<table width="100%" style="border-collapse:collapse"><tr valign="top">
<td width="69%" style="padding-right:12px">
<section class="sec">
  <h2 class="sec-title">Scoring summary</h2>
  <table class="tbl">
    <thead><tr><th>S.No</th><th>Measurable point</th><th>Points</th><th>Max</th><th>%</th><th>Remarks</th></tr></thead>
    <tbody>${summaryRows.join("\n")}</tbody>
  </table>
</section>
<section class="sec">
  <h2 class="sec-title">Utility consumption</h2>
  <p class="sec-sub">${escapeHtml(model.quarter.label ?? `FY-${model.quarter.financialYear}`)} · ${escapeHtml(b.branchCode)}</p>
  <table class="tbl">${utilTbl}</table>
</section>
${visitUtilExtra}
${detailSections}
<section class="sec">
  <h2 class="sec-title">Issues log</h2>
  <table class="tbl"><thead><tr><th>#</th><th>Category</th><th>Description</th><th>Scheduled closure</th><th>Status</th></tr></thead><tbody>${issuesRows}</tbody></table>
</section>
<table class="sign-row" width="100%"><tr>
  <td>State F&amp;P head</td><td>Branch ops incharge</td><td>Location head</td>
</tr></table>
</td>
<td width="31%" valign="top">
  <div class="score-box">
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Overall score</div>
    <div class="pct">${escapeHtml(pct)}</div>
    <div class="band">${escapeHtml(String(band))}</div>
  </div>
</td>
</tr></table>
`;

  return wrapStandardReportPage({
    documentTitle: `Branch visit report · ${b.branchCode}`,
    subtitle: model.quarter.label ?? undefined,
    bodyHtml: innerBody,
  });

}

export async function visitHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  };
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 120_000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm" } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function buildVisitPdfFromModel(model: VisitPdfModel): Promise<Buffer> {
  return visitHtmlToPdfBuffer(buildVisitHtml(model));
}

export async function tableTitleToPdf(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}): Promise<Buffer> {
  const thead = opts.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const tbody = opts.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td>${escapeHtml(cell === null || cell === undefined ? "" : String(cell))}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  const bodyHtml = `
<section class="sec">
  <h2 class="sec-title">${escapeHtml(opts.title)}</h2>
  ${opts.subtitle ? `<p class="sec-sub">${escapeHtml(opts.subtitle)}</p>` : ""}
  <table class="tbl"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
</section>`;
  return visitHtmlToPdfBuffer(
    wrapStandardReportPage({
      documentTitle: opts.title,
      subtitle: opts.subtitle,
      bodyHtml,
    })
  );
}
