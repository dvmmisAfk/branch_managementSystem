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

/**
 * Renders a status string (yes / no / not_applicable) as a colour-coded pill badge.
 * Falls back to escaped raw text for any other value.
 */
function statusBadge(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "yes")            return `<span class="badge badge-yes">Yes</span>`;
  if (s === "no")             return `<span class="badge badge-no">No</span>`;
  if (s === "not_applicable") return `<span class="badge badge-na">N/A</span>`;
  return escapeHtml(status ?? "");
}

/** Shared print stylesheet for management PDFs (A4, Puppeteer). */
const PDF_DOCUMENT_CSS = `
  :root {
    --brand:     #1e1b4b;
    --brand-mid: #312e81;
    --accent:    #4f46e5;
    --ink:       #0f172a;
    --muted:     #64748b;
    --line:      #e2e8f0;
    --zebra:     #f8fafc;
    --success:   #16a34a;
    --danger:    #dc2626;
  }
  * { box-sizing: border-box; }

  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 0;
    color: var(--ink);
    font-size: 10.5px;
    line-height: 1.5;
  }

  /* ── Content area ──────────────────────────────────────────── */
  .pdf-main { padding: 14px 0 20px; }

  /* ── Cover title (page 1 content) ─────────────────────────── */
  h1.cover {
    font-size: 20px;
    font-weight: 700;
    color: var(--brand);
    margin: 6px 0 3px;
    text-align: center;
    letter-spacing: -0.01em;
  }
  .cover-sub {
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 20px;
    text-align: center;
  }

  /* ── Section structure ─────────────────────────────────────── */
  .sec { margin-bottom: 18px; }

  /* Keep heading glued to the table that follows it */
  .sec-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--brand);
    border-left: 3px solid var(--accent);
    padding-left: 8px;
    margin: 16px 0 10px;
    line-height: 1.4;
    page-break-after: avoid;
  }
  h2.sec-title { font-size: 12px; }
  h3.sec-title { font-size: 11px; margin-top: 6px; }

  .sec-sub { font-size: 9.5px; color: var(--muted); margin: -6px 0 10px; }

  /* Force a page break before major sections */
  .page-start { page-break-before: always; }

  /* ── Key-value profile table ───────────────────────────────── */
  .kv { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .kv td {
    padding: 6px 10px;
    border: 0.5pt solid var(--line);
    vertical-align: top;
    font-size: 10px;
  }
  .kv td.k {
    width: 14%;
    font-weight: 600;
    background: #f1f5f9;
    color: var(--brand-mid);
    font-size: 9.5px;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Score callout card ────────────────────────────────────── */
  .score-card {
    background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
    border: 1.5pt solid var(--accent);
    border-radius: 8px;
    padding: 14px 20px;
    margin-bottom: 20px;
    text-align: center;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .score-card .sc-label {
    font-size: 8px;
    font-weight: 700;
    color: var(--brand-mid);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .score-card .sc-pct {
    font-size: 40px;
    font-weight: 800;
    color: var(--brand);
    line-height: 1.1;
    margin: 4px 0 3px;
    letter-spacing: -0.02em;
  }
  .score-card .sc-band {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    text-transform: capitalize;
  }

  /* ── Data tables ───────────────────────────────────────────── */
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
    margin-top: 6px;
    table-layout: fixed;
  }
  /* Auto-layout variant: lets browser size columns to fit content */
  .tbl-auto { table-layout: auto; }

  /* Repeat header row on each page */
  .tbl thead { display: table-header-group; }

  .tbl thead th {
    background: var(--brand);
    color: #fff;
    padding: 7px 10px;
    text-align: left;
    font-weight: 700;
    border: 0.5pt solid #13124a;
    font-size: 9px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .tbl td {
    padding: 6px 10px;
    border: 0.5pt solid var(--line);
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  /* Prevent a single row from splitting across pages */
  .tbl tbody tr { page-break-inside: avoid; }
  .tbl tbody tr:nth-child(even) td {
    background: var(--zebra);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .tbl .total td {
    background: #e0e7ff;
    font-weight: 700;
    border-top: 1.5pt solid var(--accent);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Numeric / centred column helpers */
  .tbl th.r, .tbl td.r { text-align: right; }
  .tbl th.c, .tbl td.c { text-align: center; }

  /* Fixed-width column: never wrap header or value */
  .tbl th.nowrap, .tbl td.nowrap { white-space: nowrap; }

  /* ── Pill badges ───────────────────────────────────────────── */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Issues log status */
  .badge-open   { background: #fee2e2; color: var(--danger); }
  .badge-closed { background: #dcfce7; color: var(--success); }
  /* Assessment row status */
  .badge-yes { background: #dcfce7; color: var(--success); }
  .badge-no  { background: #fee2e2; color: var(--danger); }
  .badge-na  { background: #f1f5f9; color: var(--muted); }

  /* ── Signature row ─────────────────────────────────────────── */
  .sign-row { margin-top: 28px; width: 100%; border-collapse: collapse; }
  .sign-row td {
    text-align: center;
    color: var(--muted);
    font-size: 9.5px;
    width: 33%;
    padding: 12px 10px 4px;
    border-top: 1pt solid var(--line);
  }
`;

// ── Puppeteer page-level header and footer templates ──────────────────────────

function buildPdfHeaderTemplate(title: string, subtitle: string, date: string): string {
  const subLine = subtitle
    ? `<div style="font-size:8px;color:rgba(255,255,255,0.82);margin-top:2px;">${subtitle}</div>`
    : "";
  return `<div style="
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    width:100%;padding:6px 25mm 6px;
    background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);
    display:flex;justify-content:space-between;align-items:center;
    font-family:Helvetica,Arial,sans-serif;box-sizing:border-box;
  ">
    <div>
      <div style="font-size:7px;font-weight:700;text-transform:uppercase;
        letter-spacing:0.12em;color:rgba(255,255,255,0.65);margin-bottom:2px;">
        ${escapeHtml(PRODUCT_NAME)}
      </div>
      <div style="font-size:10px;font-weight:700;color:#fff;line-height:1.3;">${title}</div>
      ${subLine}
    </div>
    <div style="font-size:7.5px;color:rgba(255,255,255,0.75);text-align:right;">${date}</div>
  </div>`;
}

function buildPdfFooterTemplate(): string {
  return `<div style="
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    width:100%;padding:5px 25mm;
    display:flex;justify-content:space-between;align-items:center;
    font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#94a3b8;
    border-top:0.5px solid #e2e8f0;box-sizing:border-box;
  ">
    <span>Internal use only · ${escapeHtml(PRODUCT_NAME)} · Do not distribute outside authorised channels</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

// ── Standard HTML shell ───────────────────────────────────────────────────────

/** Wraps inner HTML in a standard corporate PDF shell.
 *  Title and subtitle are embedded as data attributes; Puppeteer reads them
 *  to build the per-page header template dynamically.
 */
export function wrapStandardReportPage(parts: {
  documentTitle: string;
  subtitle?: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en"
  data-pdf-title="${escapeHtml(parts.documentTitle)}"
  data-pdf-subtitle="${escapeHtml(parts.subtitle ?? "")}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(parts.documentTitle)}</title>
  <style>${PDF_DOCUMENT_CSS}</style>
</head>
<body>
<main class="pdf-main">${parts.bodyHtml}</main>
</body>
</html>`;
}

// ── HTML → PDF buffer ─────────────────────────────────────────────────────────

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

    // Read title/subtitle embedded by wrapStandardReportPage
    const meta = await page.evaluate(() => ({
      title:    document.documentElement.getAttribute("data-pdf-title")    ?? "Report",
      subtitle: document.documentElement.getAttribute("data-pdf-subtitle") ?? "",
    }));

    const headerTemplate = buildPdfHeaderTemplate(
      escapeHtml(meta.title),
      escapeHtml(meta.subtitle),
      escapeHtml(generatedAtLabel()),
    );
    const footerTemplate = buildPdfFooterTemplate();

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      // top/bottom accommodate the header/footer bands; left/right = 25 mm as requested
      margin: { top: "28mm", right: "25mm", bottom: "18mm", left: "25mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ── Visit report HTML builder ─────────────────────────────────────────────────

function buildVisitHtml(model: VisitPdfModel): string {
  const snap = model.scoreSnapshot;
  const pct  = snap ? `${snap.scorePercentage}%` : "–";
  const band = snap?.scoreBand ?? "–";

  // ── Score card — rendered after the scoring summary table ──
  const scoreCardHtml = `
<div class="score-card">
  <div class="sc-label">Overall score</div>
  <div class="sc-pct">${escapeHtml(pct)}</div>
  <div class="sc-band">${escapeHtml(String(band))}</div>
</div>`;

  // ── Scoring summary rows ──
  const summaryRows: string[] = [];
  let sn = 1;
  if (snap?.categoryBreakdown && typeof snap.categoryBreakdown === "object") {
    const jb = snap.categoryBreakdown as Record<string, { earned: number; max: number; pct: number }>;
    for (const [name, v] of Object.entries(jb).sort(([a], [b]) => a.localeCompare(b))) {
      summaryRows.push(
        `<tr>
          <td class="c nowrap">${escapeHtml(sn++)}</td>
          <td>${escapeHtml(name)}</td>
          <td class="r nowrap">${v.earned}</td>
          <td class="r nowrap">${v.max}</td>
          <td class="r nowrap">${v.pct}%</td>
          <td></td>
        </tr>`
      );
    }
  }
  summaryRows.push(
    `<tr class="total">
      <td colspan="2">Grand total</td>
      <td class="r nowrap">${escapeHtml(String(snap?.totalPointsEarned ?? "–"))}</td>
      <td class="r nowrap">${escapeHtml(String(snap?.totalMaxPoints ?? "–"))}</td>
      <td class="r nowrap">${escapeHtml(String(pct))}</td>
      <td></td>
    </tr>`
  );

  // ── Per-category detail sections — each on its own page ──
  const categories = [...new Set(model.scores.map((x) => x.subcategory.category.name))].sort();
  let detailSections = "";
  let sno = 1;
  for (const catName of categories) {
    const rowsForCat = model.scores.filter((r) => r.subcategory.category.name === catName);
    let body = "";
    for (const r of rowsForCat) {
      body += `<tr>
        <td class="c nowrap">${sno++}</td>
        <td>${escapeHtml(r.subcategory.name)}</td>
        <td>${escapeHtml(r.subcategory.description || "")}</td>
        <td class="c">${statusBadge(r.status)}</td>
        <td>${escapeHtml(r.observations)}</td>
        <td class="nowrap">${escapeHtml(r.remsNumber)}</td>
        <td class="r nowrap">${escapeHtml(String(r.scoreGiven ?? ""))}</td>
        <td class="r nowrap">${r.maxScore}</td>
        <td>${escapeHtml(r.remarks)}</td>
      </tr>`;
    }
    // page-start forces each category onto a new page
    detailSections += `
<section class="sec page-start">
  <h3 class="sec-title">${escapeHtml(catName)}</h3>
  <table class="tbl tbl-auto">
    <thead><tr>
      <th class="c nowrap">S.No</th>
      <th>Measurable point</th>
      <th>Check points</th>
      <th class="c nowrap">Status</th>
      <th>Observations</th>
      <th class="nowrap">REMS</th>
      <th class="r nowrap">Points given</th>
      <th class="r nowrap">Max</th>
      <th>Remarks by SFH</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
</section>`;
  }

  // ── Issues log rows ──
  let issuesRows = "";
  for (let i = 0; i < model.issues.length; i++) {
    const it     = model.issues[i];
    const status = (it.issueStatus ?? "").toLowerCase() === "closed" ? "closed" : "open";
    issuesRows += `<tr>
      <td class="c nowrap">${i + 1}</td>
      <td>${escapeHtml(it.category.name)}</td>
      <td>${escapeHtml(it.issueDescription)}</td>
      <td class="c nowrap">${escapeHtml(it.scheduledClosureDate?.toISOString().slice(0, 10) ?? "")}</td>
      <td class="c"><span class="badge badge-${status}">${escapeHtml(it.issueStatus)}</span></td>
    </tr>`;
  }

  // ── Utility table ──
  // Every row must have exactly 5 cells (Particulars + Q1 + Q2 + Q3 + Action points).
  // We avoid rowspan so that Units consumed and OT Expenses rows are never missing cells.
  const combineActions =
    model.utilityByQ.map((x) => x?.actionPointsExpenses ?? "").filter(Boolean).join("; ") || "–";
  const utilTbl =
    `<colgroup>
      <col style="width:22%"/>
      <col style="width:13%"/>
      <col style="width:13%"/>
      <col style="width:13%"/>
      <col style="width:39%"/>
    </colgroup>
    <thead><tr>
      <th>Particulars</th>
      <th class="r nowrap">FY-Q1</th>
      <th class="r nowrap">FY-Q2</th>
      <th class="r nowrap">FY-Q3</th>
      <th>Action points to reduce expenses</th>
    </tr></thead>` +
    `<tbody>` +
    // Row 1 — Electricity: carries the action points value
    `<tr><td>Electricity (₹)</td>${[0, 1, 2]
      .map((i) => {
        const rowu = model.utilityByQ[i];
        const v =
          rowu?.electricityBillAmount === null || rowu?.electricityBillAmount === undefined
            ? "–"
            : fmtInr(rowu.electricityBillAmount);
        return `<td class="r">${escapeHtml(v)}</td>`;
      })
      .join("")}<td>${escapeHtml(combineActions)}</td></tr>` +
    // Row 2 — Units consumed: empty action-points cell keeps column count correct
    `<tr><td>Units consumed</td>${[0, 1, 2]
      .map((i) => {
        const rowu = model.utilityByQ[i];
        const has = rowu?.unitsConsumed !== null && rowu?.unitsConsumed !== undefined;
        return `<td class="r">${escapeHtml(has ? fmtInr(rowu!.unitsConsumed) : "–")}</td>`;
      })
      .join("")}<td></td></tr>` +
    // Row 3 — OT Expenses: empty action-points cell keeps column count correct
    `<tr><td>OT Expenses (₹)</td>${[0, 1, 2]
      .map((i) => {
        const rowu = model.utilityByQ[i];
        const v =
          rowu?.otExpenses === null || rowu?.otExpenses === undefined
            ? "–"
            : fmtInr(rowu.otExpenses);
        return `<td class="r">${escapeHtml(v)}</td>`;
      })
      .join("")}<td></td></tr></tbody>`;

  const b = model.branch;

  function branchTechLine() {
    const ups = `${b.upsCapacityKva ?? "–"} / ${b.upsBackupTimeMins ?? "–"} mins`;
    const dg  = `${b.dgOwnership} — ${b.dgCapacityKva ?? "–"} KVA`;
    return `
      UPS (KVA) &amp; Backup Time: ${escapeHtml(ups)} · AC Tonnage: ${escapeHtml(String(b.acTonnage ?? "–"))} · Electricity Load: ${escapeHtml(String(b.electricityLoadKw ?? "–"))} KW
      <div>RMS Vendor: ${escapeHtml(String(b.rmsVendorPresent ? "Yes" : "No"))}${b.rmsVendorName ? ` — ${escapeHtml(b.rmsVendorName)}` : ""} · FE Count: ${escapeHtml(String(b.fireExtinguisherCount ?? 0))} · DG: ${escapeHtml(dg)}</div>`;
  }

  const visitUtilityLines = parseVisitUtilityLinesJson(model.utilityLinesJson);
  const elq =
    model.electricityLastQuarter === null || model.electricityLastQuarter === undefined
      ? "–"
      : fmtInr(Number(model.electricityLastQuarter));

  let visitUtilExtra = `
<section class="sec">
  <h3 class="sec-title">Additional utility (this visit)</h3>
  <p class="sec-sub"><strong>Electricity (last quarter)</strong>: ${escapeHtml(elq)}</p>`;
  if (visitUtilityLines.length) {
    visitUtilExtra += `
<table class="tbl tbl-auto">
  <thead><tr>
    <th class="c nowrap">#</th>
    <th>Category</th>
    <th>Sub category</th>
    <th class="r nowrap">Amount (₹)</th>
  </tr></thead>
  <tbody>`;
    visitUtilityLines.forEach((row, i) => {
      visitUtilExtra += `<tr>
        <td class="c nowrap">${i + 1}</td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(row.subCategory)}</td>
        <td class="r nowrap">${escapeHtml(fmtInr(row.amount))}</td>
      </tr>`;
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
    <tr>
      <td class="k">Branch</td><td>${escapeHtml(b.branchName)}</td>
      <td class="k">Branch code</td><td>${escapeHtml(b.branchCode)}</td>
    </tr>
    <tr>
      <td class="k">Zone / state</td>
      <td colspan="3">${escapeHtml(`${b.zone ?? ""}${b.zone && b.state ? " / " : ""}${b.state ?? ""}`)}</td>
    </tr>
    <tr>
      <td class="k">Branch type</td><td>${escapeHtml(b.branchType)}</td>
      <td class="k">Operational date</td><td>${escapeHtml(b.dateOfOperationalization?.toISOString().slice(0, 10) ?? "—")}</td>
    </tr>
    <tr>
      <td class="k">Carpet area (sq.ft)</td>
      <td colspan="3">${escapeHtml(String(b.carpetAreaSqft ?? "—"))}</td>
    </tr>
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

<section class="sec page-start">
  <h2 class="sec-title">Scoring summary</h2>
  <table class="tbl tbl-auto">
    <thead><tr>
      <th class="c nowrap">S.No</th>
      <th>Measurable point</th>
      <th class="r nowrap">Points</th>
      <th class="r nowrap">Max</th>
      <th class="r nowrap">%</th>
      <th>Remarks</th>
    </tr></thead>
    <tbody>${summaryRows.join("\n")}</tbody>
  </table>
</section>

${scoreCardHtml}

<section class="sec">
  <h2 class="sec-title">Utility consumption</h2>
  <p class="sec-sub">${escapeHtml(model.quarter.label ?? `FY-${model.quarter.financialYear}`)} · ${escapeHtml(b.branchCode)}</p>
  <table class="tbl">${utilTbl}</table>
</section>

${visitUtilExtra}

${detailSections}

<section class="sec page-start">
  <h2 class="sec-title">Issues log</h2>
  <table class="tbl tbl-auto">
    <thead><tr>
      <th class="c nowrap">#</th>
      <th>Category</th>
      <th>Description</th>
      <th class="c nowrap">Scheduled closure</th>
      <th class="c nowrap">Status</th>
    </tr></thead>
    <tbody>${issuesRows}</tbody>
  </table>
</section>

<table class="sign-row" width="100%"><tr>
  <td>State F&amp;P head</td>
  <td>Branch ops incharge</td>
  <td>Location head</td>
</tr></table>
`;

  return wrapStandardReportPage({
    documentTitle: `Branch visit report · ${b.branchCode}`,
    subtitle:      model.quarter.label ?? undefined,
    bodyHtml:      innerBody,
  });
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
  <table class="tbl tbl-auto"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
</section>`;
  return visitHtmlToPdfBuffer(
    wrapStandardReportPage({
      documentTitle: opts.title,
      subtitle:      opts.subtitle,
      bodyHtml,
    })
  );
}
