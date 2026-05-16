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
    sfh: { include: { user: { select: { name: true, email: true } } } };
    branch: true;
    quarter: true;
    scores: {
      include: {
        subcategory: { include: { category: { select: { id: true, name: true, displayOrder: true } } } };
      };
    };
    issues: { include: { category: { select: { id: true, name: true } } } };
    scoreSnapshot: true;
  };
}> & {
  utilityByQ: ({
    electricityBillAmount: string | number | null;
    unitsConsumed: string | number | null;
    otExpenses: string | number | null;
    actionPointsExpenses: string | null;
  } | undefined)[];
  /** FY quarter column headers (e.g. FY25-26 Q1) — one per `utilityByQ` slot. */
  utilityQuarterLabels?: string[];
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
 * Renders a boolean flag as a green "No" or red "Yes" pill badge.
 * Green = no issue; Red = issue flagged.
 */
function flagBadge(active: boolean): string {
  return active
    ? `<span class="badge badge-flag-warn">Yes</span>`
    : `<span class="badge badge-flag-ok">No</span>`;
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
  .badge-open        { background: #fee2e2; color: var(--danger); }
  .badge-in-progress { background: #fef3c7; color: #92400e; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge-closed      { background: #dcfce7; color: var(--success); }
  /* Assessment row status */
  .badge-yes { background: #dcfce7; color: var(--success); }
  .badge-no  { background: #fee2e2; color: var(--danger); }
  .badge-na  { background: #f1f5f9; color: var(--muted); }
  /* Flag badges: green = no issue, red = issue flagged */
  .badge-flag-ok   { background: #dcfce7; color: var(--success); }
  .badge-flag-warn { background: #fee2e2; color: var(--danger); }

  /* ── Prominent SFH name ────────────────────────────────────── */
  .sfh-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--brand);
    background: #eef2ff;
    padding: 1px 8px;
    border-radius: 4px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── DG ownership toggle badges ────────────────────────────── */
  .dg-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 700;
    margin-left: 4px;
  }
  .dg-active   {
    background: var(--brand); color: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .dg-inactive { background: transparent; color: var(--muted); border: 0.5pt solid var(--line); }

  /* ── Flags status grid ──────────────────────────────────────── */
  .flags-tbl { border-collapse: collapse; margin-top: 6px; width: 100%; }
  .flags-tbl td { padding: 4px 6px; vertical-align: middle; }
  .flags-tbl tr { border-bottom: 0.5pt solid #f1f5f9; }
  .flags-tbl .fl {
    font-size: 9.5px; font-weight: 600; color: var(--muted);
    white-space: nowrap; padding-right: 8px;
  }
  .flags-tbl .fv { font-size: 9.5px; padding-right: 18px; }
  .flag-detail { font-size: 8.5px; color: var(--muted); margin-left: 6px; }

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
  // PRODUCT_NAME is intentionally omitted from the header — it appears in the footer instead
  return `<div style="
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    width:100%;padding:6px 25mm 6px;
    background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);
    display:flex;justify-content:space-between;align-items:center;
    font-family:Helvetica,Arial,sans-serif;box-sizing:border-box;
  ">
    <div>
      <div style="font-size:10px;font-weight:700;color:#fff;line-height:1.3;">${title}</div>
      ${subLine}
    </div>
    <div style="font-size:7.5px;color:rgba(255,255,255,0.75);text-align:right;">${date}</div>
  </div>`;
}

function buildPdfFooterTemplate(title: string, subtitle: string, date: string): string {
  // Left side: PRODUCT_NAME (uppercase) · doc title · quarter · generated timestamp
  const leftParts = [
    escapeHtml(PRODUCT_NAME.toUpperCase()),
    title,
    subtitle,
    date,
  ].filter((s) => s.trim()).join(" · ");
  return `<div style="
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    width:100%;padding:5px 25mm;
    display:flex;justify-content:space-between;align-items:center;
    font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#94a3b8;
    border-top:0.5px solid #e2e8f0;box-sizing:border-box;
  ">
    <span>${leftParts}</span>
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

    const safeTitle    = escapeHtml(meta.title);
    const safeSubtitle = escapeHtml(meta.subtitle);
    const safeDate     = escapeHtml(generatedAtLabel());

    const headerTemplate = buildPdfHeaderTemplate(safeTitle, safeSubtitle, safeDate);
    const footerTemplate = buildPdfFooterTemplate(safeTitle, safeSubtitle, safeDate);

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

  // ── Ordered categories by displayOrder (M-1 fix: consistent S.No between summary and detail) ──
  const orderedCategories = model.scores
    .map((s) => s.subcategory.category)
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // ── Scoring summary rows ──
  const summaryRows: string[] = [];
  let sn = 1;
  if (snap?.categoryBreakdown && typeof snap.categoryBreakdown === "object") {
    const jb = snap.categoryBreakdown as Record<string, { earned: number; max: number; pct: number }>;
    for (const cat of orderedCategories) {
      const v = jb[cat.name];
      if (!v) continue;
      summaryRows.push(
        `<tr>
          <td class="c nowrap">${escapeHtml(sn++)}</td>
          <td>${escapeHtml(cat.name)}</td>
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
  const categories = orderedCategories.map((c) => c.name);
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

  // ── Issues log rows ── (C-1 fix: map enum values to correct badge classes)
  let issuesRows = "";
  for (let i = 0; i < model.issues.length; i++) {
    const it = model.issues[i];
    const badgeClass =
      it.issueStatus === "resolved"    ? "badge-closed"
      : it.issueStatus === "in_progress" ? "badge-in-progress"
      : "badge-open";
    issuesRows += `<tr>
      <td class="c nowrap">${i + 1}</td>
      <td>${escapeHtml(it.category.name)}</td>
      <td>${escapeHtml(it.issueDescription)}</td>
      <td class="c nowrap">${escapeHtml(it.scheduledClosureDate?.toISOString().slice(0, 10) ?? "")}</td>
      <td class="c"><span class="badge ${badgeClass}">${escapeHtml(it.issueStatus)}</span></td>
    </tr>`;
  }

  // ── Utility table (dynamic FY quarter columns from `utilityByQ`) ──
  const qCount = model.utilityByQ.length;
  const qLabels =
    model.utilityQuarterLabels?.length === qCount ?
      model.utilityQuarterLabels
    : model.utilityByQ.map((_, i) => `Q${i + 1}`);
  const combineActions =
    model.utilityByQ.map((x) => x?.actionPointsExpenses ?? "").filter(Boolean).join("; ") || "–";
  const qColWidth = qCount > 0 ? Math.floor(39 / qCount) : 13;
  const utilTbl =
    `<colgroup>
      <col style="width:22%"/>
      ${qLabels.map(() => `<col style="width:${qColWidth}%"/>`).join("")}
      <col style="width:39%"/>
    </colgroup>
    <thead><tr>
      <th>Particulars</th>
      ${qLabels.map((l) => `<th class="r nowrap">${escapeHtml(l)}</th>`).join("")}
      <th>Action points to reduce expenses</th>
    </tr></thead>` +
    `<tbody>` +
    `<tr><td>Electricity (₹)</td>${model.utilityByQ
      .map((rowu) => {
        const v =
          rowu?.electricityBillAmount === null || rowu?.electricityBillAmount === undefined
            ? "–"
            : fmtInr(rowu.electricityBillAmount);
        return `<td class="r">${escapeHtml(v)}</td>`;
      })
      .join("")}<td>${escapeHtml(combineActions)}</td></tr>` +
    `<tr><td>Units consumed</td>${model.utilityByQ
      .map((rowu) => {
        const has = rowu?.unitsConsumed !== null && rowu?.unitsConsumed !== undefined;
        return `<td class="r">${escapeHtml(has ? fmtInr(rowu.unitsConsumed) : "–")}</td>`;
      })
      .join("")}<td></td></tr>` +
    `<tr><td>OT Expenses (₹)</td>${model.utilityByQ
      .map((rowu) => {
        const v =
          rowu?.otExpenses === null || rowu?.otExpenses === undefined
            ? "–"
            : fmtInr(rowu.otExpenses);
        return `<td class="r">${escapeHtml(v)}</td>`;
      })
      .join("")}<td></td></tr></tbody>`;

  const b = model.branch;

  function branchTechLine() {
    const ups    = `${b.upsCapacityKva ?? "–"} / ${b.upsBackupTimeMins ?? "–"} mins`;
    const dgOwn  = String(b.dgOwnership ?? "").toLowerCase().trim();
    const dgKva  = escapeHtml(String(b.dgCapacityKva ?? "–"));
    const ownedBadge  = `<span class="dg-badge ${dgOwn === "owned"  ? "dg-active" : "dg-inactive"}">Owned</span>`;
    const rentedBadge = `<span class="dg-badge ${dgOwn === "rented" ? "dg-active" : "dg-inactive"}">Rented</span>`;
    return `
      UPS (KVA) &amp; Backup Time: ${escapeHtml(ups)} · AC Tonnage: ${escapeHtml(String(b.acTonnage ?? "–"))} · Electricity Load: ${escapeHtml(String(b.electricityLoadKw ?? "–"))} KW
      <div>RMS Vendor: ${escapeHtml(String(b.rmsVendorPresent ? "Yes" : "No"))}${b.rmsVendorName ? ` — ${escapeHtml(b.rmsVendorName)}` : ""} · Fire Extinguisher Count: ${escapeHtml(String(b.fireExtinguisherCount ?? 0))} · DG: ${dgKva} KVA ${ownedBadge}${rentedBadge}</div>`;
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
  <p><strong>State facilities head:</strong> <span class="sfh-name">${escapeHtml(model.sfh.user.name)}</span></p>
  <p><strong>BOI / Location head:</strong> ${escapeHtml(model.boiNameSnapshot ?? "—")} · ${escapeHtml(model.locationHeadSnapshot ?? "—")}</p>
  <p><strong>Staff (snapshot):</strong> Outsource ${escapeHtml(String(model.staffOutsourceSnapshot ?? "—"))} · Company/TALIC ${escapeHtml(String(model.staffTalicEmployeesSnapshot ?? "—"))} · HK ${escapeHtml(String(model.staffHkResourcesSnapshot ?? "—"))}</p>
  <p><strong>Workstations:</strong> Linear ${model.workstationsLinearSnapshot ?? "—"}, L-shape ${model.workstationsLshapeSnapshot ?? "—"}, Cubical ${model.workstationsCubicalSnapshot ?? "—"}</p>
  <p><strong>Technical Equipment Details</strong><br/>${branchTechLine()}</p>
  <table class="flags-tbl">
    <tr>
      <td class="fl">Infra upgrade</td>
      <td class="fv">${flagBadge(!!model.isInfraUpgrade)}</td>
      <td class="fl">Landlord issue</td>
      <td class="fv">${flagBadge(!!model.landlordIssue)}${model.landlordIssue && model.landlordIssueDetails ? `<span class="flag-detail">${escapeHtml(model.landlordIssueDetails)}</span>` : ""}</td>
      <td class="fl">Incident since last</td>
      <td class="fv">${flagBadge(!!model.incidentPreviousVisit)}${model.incidentPreviousVisit && model.incidentPreviousVisitDetails ? `<span class="flag-detail">${escapeHtml(model.incidentPreviousVisitDetails)}</span>` : ""}</td>
    </tr>
    <tr>
      <td class="fl">Audit points</td>
      <td class="fv">${flagBadge(!!model.auditPointsObserved)}${model.auditPointsObserved && model.auditPointsDetails ? `<span class="flag-detail">${escapeHtml(model.auditPointsDetails)}</span>` : ""}</td>
      <td class="fl">Escalation</td>
      <td class="fv" colspan="3">${flagBadge(!!model.majorEscalation)}${model.majorEscalation ? `<span class="flag-detail">${escapeHtml(model.escalationDetails ?? "")}${model.escalationClosureDate ? ` (closes ${model.escalationClosureDate.toISOString().slice(0, 10)})` : ""}</span>` : ""}</td>
    </tr>
  </table>
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
