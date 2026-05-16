import { Router, type NextFunction, type Request, type Response } from "express";
import { ApprovalStatus, IssueStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireSfhOrSupervisor } from "../middleware/requireSfhOrSupervisor.js";
import { HttpError } from "../utils/HttpError.js";
import { getSfhRecordForUser } from "../services/visit.service.js";
import {
  buildIssuesSummarySheet,
  buildPendingBranchesSheet,
  buildVisitedBranchesSheet,
  buildYearlySummaryWorkbook,
} from "../services/excelExport.service.js";
import { escapeHtml, tableTitleToPdf, visitHtmlToPdfBuffer, wrapStandardReportPage } from "../services/pdfGeneration.service.js";

const router = Router();
router.use(authenticate, requireSfhOrSupervisor);

async function mappedBranchIds(sfhScope?: string): Promise<Set<string>> {
  const rows = await prisma.sfhBranchMapping.findMany({
    where: {
      isCurrent: true,
      approvalStatus: ApprovalStatus.approved,
      ...(sfhScope ? { sfhId: sfhScope } : {}),
    },
    select: { branchId: true },
  });
  return new Set(rows.map((r) => r.branchId));
}

/** SFH → own id; supervisor → optional query `sfh_id`; whole org when omitted. */
async function resolveSfhFilter(req: Request): Promise<string | undefined> {
  const u = req.user;
  if (!u) throw new HttpError("Unauthorized", 401);
  if (u.role === UserRole.sfh) {
    const sfh = await getSfhRecordForUser(u.id, UserRole.sfh);
    if (!sfh) throw new HttpError("Forbidden", 403);
    return sfh.id;
  }
  if (u.role === UserRole.supervisor) {
    const raw = typeof req.query.sfh_id === "string" ? req.query.sfh_id.trim() : "";
    return raw.length ? raw : undefined;
  }
  throw new HttpError("Forbidden", 403);
}

function parseFormat(q: Request["query"]): "pdf" | "excel" {
  const f = typeof q.format === "string" ? q.format.toLowerCase() : "";
  return f === "pdf" ? "pdf" : "excel";
}

function daysRemainingInQuarter(endDate: Date): number {
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const d = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  return Math.max(0, d);
}

router.get("/visited-branches", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sfhScope = await resolveSfhFilter(req);
    const quarterId =
      typeof req.query.quarter_id === "string" && req.query.quarter_id.trim() ? req.query.quarter_id : "";
    if (!quarterId) throw new HttpError("quarter_id is required", 400);
    const format = parseFormat(req.query);
    const visits = await prisma.branchVisit.findMany({
      where: {
        quarterId,
        isSubmitted: true,
        ...(sfhScope ? { sfhId: sfhScope } : {}),
      },
      select: {
        visitDateActual: true,
        visitType: true,
        branch: true,
        quarter: true,
        scoreSnapshot: true,
        sfh: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ branch: { branchCode: "asc" } }],
    });
    const headers = [
      "Branch Code",
      "SAP Code",
      "Location",
      "City",
      "State",
      "SFH Name",
      "Visit Date",
      "Visit Type",
      "Score %",
      "Band",
      "Quarter",
    ];
    const rows = visits.map((v) => ({
      branchCode: v.branch.branchCode,
      sapCode: v.branch.sapCode,
      location: v.branch.location,
      city: v.branch.city,
      state: v.branch.state,
      sfhName: v.sfh.user.name,
      visitDate: v.visitDateActual?.toISOString().slice(0, 10) ?? null,
      visitType: v.visitType,
      scorePct: v.scoreSnapshot ? String(v.scoreSnapshot.scorePercentage) : null,
      band: v.scoreSnapshot?.scoreBand ?? null,
      quarterLabel: v.quarter.label,
    }));
    if (format === "excel") {
      const buf = await buildVisitedBranchesSheet(rows, {
        subtitle: `Quarter · ${visits[0]?.quarter.label ?? quarterId}`,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="visited-branches.xlsx"');
      res.send(buf);
      return;
    }
    const pdfBuf = await tableTitleToPdf({
      title: "Visited branches report",
      subtitle: `Quarter · ${visits[0]?.quarter.label ?? quarterId}`,
      headers,
      rows: rows.map((r) => [
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
      ]),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="visited-branches.pdf"');
    res.send(pdfBuf);
  } catch (e) {
    next(e);
  }
});

router.get("/pending-branches", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sfhScope = await resolveSfhFilter(req);
    const quarterId =
      typeof req.query.quarter_id === "string" && req.query.quarter_id.trim() ? req.query.quarter_id : "";
    if (!quarterId) throw new HttpError("quarter_id is required", 400);
    const format = parseFormat(req.query);
    const quarter = await prisma.quarter.findUnique({ where: { id: quarterId } });
    if (!quarter) throw new HttpError("Quarter not found", 404);
    const mapped = [...(await mappedBranchIds(sfhScope))];
    const visited = await prisma.branchVisit.findMany({
      where: { quarterId, isSubmitted: true, ...(sfhScope ? { sfhId: sfhScope } : {}) },
      select: { branchId: true },
    });
    const visitedSet = new Set(visited.map((v) => v.branchId));
    const pendingIds = mapped.filter((id) => !visitedSet.has(id));
    const pendingBranches =
      pendingIds.length === 0
        ? []
        : await prisma.branch.findMany({
            where: { id: { in: pendingIds }, isActive: true },
            orderBy: { branchCode: "asc" },
            select: {
              id: true,
              branchCode: true,
              sapCode: true,
              location: true,
              city: true,
              state: true,
              mappings: {
                where: {
                  isCurrent: true,
                  approvalStatus: ApprovalStatus.approved,
                  ...(sfhScope ? { sfhId: sfhScope } : {}),
                },
                take: 1,
                select: {
                  sfh: { select: { user: { select: { name: true } } } },
                },
              },
            },
          });
    const outRows = pendingBranches.map((b) => ({
      branchCode: b.branchCode,
      sapCode: b.sapCode,
      location: b.location,
      city: b.city,
      state: b.state,
      sfhName: b.mappings[0]?.sfh.user.name ?? "—",
      quarterLabel: quarter.label,
      daysRemaining: daysRemainingInQuarter(quarter.endDate),
    }));
    const headers = [
      "Branch Code",
      "SAP Code",
      "Location",
      "City",
      "State",
      "SFH Name",
      "Quarter",
      "Days Remaining in Quarter",
    ];
    if (format === "excel") {
      const buf = await buildPendingBranchesSheet(outRows, {
        subtitle: quarter.label ?? quarterId,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="pending-branches.xlsx"');
      res.send(buf);
      return;
    }
    const pdfBuf = await tableTitleToPdf({
      title: "Pending branches report",
      subtitle: quarter.label ?? quarterId,
      headers,
      rows: outRows.map((r) => [
        r.branchCode,
        r.sapCode,
        r.location,
        r.city,
        r.state,
        r.sfhName,
        r.quarterLabel,
        r.daysRemaining,
      ]),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="pending-branches.pdf"');
    res.send(pdfBuf);
  } catch (e) {
    next(e);
  }
});

router.get("/issues-summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sfhScope = await resolveSfhFilter(req);
    const categoryFilter = typeof req.query.category === "string" ? req.query.category : undefined;
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const quarterId =
      typeof req.query.quarter_id === "string" && req.query.quarter_id.trim() ? req.query.quarter_id : undefined;
    const allowed = [IssueStatus.open, IssueStatus.in_progress, IssueStatus.resolved];
    const statusFilter = statusRaw && allowed.includes(statusRaw as IssueStatus) ? (statusRaw as IssueStatus) : undefined;
    const format = parseFormat(req.query);
    const issues = await prisma.visitIssue.findMany({
      where: {
        ...(statusFilter
          ? { issueStatus: statusFilter }
          : { issueStatus: { in: [IssueStatus.open, IssueStatus.in_progress, IssueStatus.resolved] } }),
        visit: {
          ...(sfhScope ? { sfhId: sfhScope } : {}),
          ...(quarterId ? { quarterId } : {}),
        },
        ...(categoryFilter
          ? /^[0-9a-f-]{36}$/i.test(categoryFilter)
            ? { categoryId: categoryFilter }
            : { category: { name: { contains: categoryFilter, mode: "insensitive" as const } } }
          : {}),
      },
      include: {
        category: true,
        visit: { include: { branch: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const flat = issues.map((i) => ({
      branchName: i.visit.branch.branchName,
      branchCode: i.visit.branch.branchCode,
      visitDate: i.visit.visitDateActual?.toISOString().slice(0, 10) ?? null,
      category: i.category.name,
      description: i.issueDescription,
      closure: i.scheduledClosureDate?.toISOString().slice(0, 10) ?? null,
      status: i.issueStatus,
    }));
    const headers = [
      "Branch Name",
      "Branch Code",
      "Visit Date",
      "Category",
      "Issue Description",
      "Scheduled Closure Date",
      "Status",
    ];
    if (format === "excel") {
      const buf = await buildIssuesSummarySheet(flat);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="issues-summary.xlsx"');
      res.send(buf);
      return;
    }
    const pdfBuf = await tableTitleToPdf({
      title: "Issues summary report",
      headers,
      rows: flat.map((r) => [r.branchName, r.branchCode, r.visitDate, r.category, r.description, r.closure, r.status]),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="issues-summary.pdf"');
    res.send(pdfBuf);
  } catch (e) {
    next(e);
  }
});

router.get("/yearly-summary", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sfhScope = await resolveSfhFilter(req);
    const fyRaw = typeof req.query.financial_year === "string" ? req.query.financial_year.trim() : "";
    const fy = fyRaw ? parseInt(fyRaw, 10) : NaN;
    if (!Number.isFinite(fy)) throw new HttpError("financial_year is required (integer)", 400);
    const format = parseFormat(req.query);
    const quarters = await prisma.quarter.findMany({
      where: { financialYear: fy },
      orderBy: { quarterNumber: "asc" },
    });
    if (!quarters.length) throw new HttpError("No quarters for that financial year", 404);
    const sheetHeaders = [
      "Branch Code",
      "SAP Code",
      "Location",
      "City",
      "State",
      "SFH Name",
      "Visit Date",
      "Visit Type",
      "Score %",
      "Band",
      "Quarter",
    ];
    const sheets: { name: string; aoa: (string | number | null)[][] }[] = [];
    let pdfSections = "";
    for (const q of quarters) {
      const visits = await prisma.branchVisit.findMany({
        where: {
          quarterId: q.id,
          isSubmitted: true,
          ...(sfhScope ? { sfhId: sfhScope } : {}),
        },
        select: {
          visitDateActual: true,
          visitType: true,
          branch: true,
          quarter: true,
          scoreSnapshot: true,
          sfh: { select: { user: { select: { name: true } } } },
        },
        orderBy: [{ branch: { branchCode: "asc" } }],
      });
      const aoa: (string | number | null)[][] = [sheetHeaders];
      for (const v of visits) {
        aoa.push([
          v.branch.branchCode,
          v.branch.sapCode,
          v.branch.location,
          v.branch.city,
          v.branch.state,
          v.sfh.user.name,
          v.visitDateActual?.toISOString().slice(0, 10) ?? "",
          v.visitType,
          v.scoreSnapshot ? String(v.scoreSnapshot.scorePercentage) : "",
          v.scoreSnapshot?.scoreBand ?? "",
          v.quarter.label,
        ]);
      }
      sheets.push({ name: q.label ?? `Q${q.quarterNumber}`, aoa });
      const body = visits
        .map(
          (v) =>
            `<tr><td>${escapeHtml(v.branch.branchCode)}</td><td>${escapeHtml(v.branch.sapCode)}</td><td>${escapeHtml(v.branch.location)}</td><td>${escapeHtml(v.branch.city)}</td><td>${escapeHtml(v.branch.state)}</td><td>${escapeHtml(v.sfh.user.name)}</td><td>${escapeHtml(v.visitDateActual?.toISOString().slice(0, 10) ?? "")}</td><td>${escapeHtml(v.visitType)}</td><td>${escapeHtml(v.scoreSnapshot ? String(v.scoreSnapshot.scorePercentage) : "")}</td><td>${escapeHtml(v.scoreSnapshot?.scoreBand ?? "")}</td></tr>`
        )
        .join("");
      pdfSections += `
      <section class="sec">
      <h3 class="sec-title">${escapeHtml(q.label ?? `Q${q.quarterNumber}`)}</h3>
      <table class="tbl"><thead><tr>${sheetHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>
      ${body}
      </tbody></table></section>`;
    }
    if (format === "excel") {
      const buf = await buildYearlySummaryWorkbook(sheets);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="yearly-summary-FY${fy}.xlsx"`);
      res.send(buf);
      return;
    }
    const html = wrapStandardReportPage({
      documentTitle: `Yearly summary · FY ${fy}`,
      subtitle: "Submitted visits · consolidated by quarter",
      bodyHtml: `<p class="sec-sub" style="margin-top:0">Financial year <strong>${escapeHtml(String(fy))}</strong>. Each section corresponds to one quarter; rows are submitted branch visits.</p>${pdfSections}`,
    });
    const pdfBuf = await visitHtmlToPdfBuffer(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="yearly-summary-FY${fy}.pdf"`);
    res.send(pdfBuf);
  } catch (e) {
    next(e);
  }
});

export default router;
