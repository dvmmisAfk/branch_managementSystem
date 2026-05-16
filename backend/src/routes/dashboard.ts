import { Router } from "express";
import { ApprovalStatus, IssueStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { isPlaceholderSfhUser } from "../utils/sfhPlaceholders.js";
import { getSfhRecordForUser } from "../services/visit.service.js";

const router = Router();
router.use(authenticate);

async function currentQuarterHeader() {
  const now = new Date();
  const q = await prisma.quarter.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
  });
  return q;
}

async function mappedBranchIds(sfhScope?: string) {
  const rows = await prisma.sfhBranchMapping.findMany({
    where: {
      isCurrent: true,
      approvalStatus: ApprovalStatus.approved,
      branch: { isActive: true },
      sfh: { user: { isActive: true } },
      ...(sfhScope ? { sfhId: sfhScope } : {}),
    },
    select: { branchId: true },
  });
  return new Set(rows.map((r) => r.branchId));
}

async function submittedBranchCountForQuarter(quarterId: string, sfhScope?: string) {
  const grouped = await prisma.branchVisit.groupBy({
    by: ["branchId"],
    where: {
      quarterId,
      isSubmitted: true,
      branch: { isActive: true },
      sfh: { user: { isActive: true } },
      ...(sfhScope ? { sfhId: sfhScope } : {}),
    },
  });
  return grouped.length;
}

async function issueCountsForSfh(sfhId: string) {
  const openIssues = await prisma.visitIssue.count({
    where: {
      issueStatus: { in: [IssueStatus.open, IssueStatus.in_progress] },
      visit: { sfhId, branch: { isActive: true } },
    },
  });
  const resolvedIssues = await prisma.visitIssue.count({
    where: { issueStatus: IssueStatus.resolved, visit: { sfhId, branch: { isActive: true } } },
  });
  return { openIssues, resolvedIssues };
}

async function buildSfhStatRow(sfId: string, cqId: string) {
  const mapped = await mappedBranchIds(sfId);
  const totalBranches = mapped.size;
  const visited = await submittedBranchCountForQuarter(cqId, sfId);
  const pending = totalBranches - visited;
  const { openIssues, resolvedIssues } = await issueCountsForSfh(sfId);
  const usr = await prisma.stateFacilityHead.findUnique({
    where: { id: sfId },
    select: { user: { select: { name: true } } },
  });
  const completionPct = totalBranches === 0 ? 0 : Math.round((visited / totalBranches) * 10000) / 100;
  let avgScore: number | null = null;
  const snaps = await prisma.scoreSnapshot.findMany({
    where: { visit: { quarterId: cqId, sfhId: sfId, isSubmitted: true, branch: { isActive: true } } },
    select: { scorePercentage: true },
  });
  const scored = snaps.filter((s) => s.scorePercentage != null);
  if (scored.length) {
    const sum = scored.reduce((acc, s) => acc + Number(s.scorePercentage), 0);
    avgScore = Math.round((sum / scored.length) * 100) / 100;
  }
  return {
    sfh_id: sfId,
    sfh_name: usr?.user.name ?? "—",
    total_branches: totalBranches,
    visited,
    pending,
    completion_pct: completionPct,
    open_issues: openIssues,
    resolved_issues: resolvedIssues,
    avg_score: avgScore,
  };
}

async function fyQuarterBreakdown(sfhScope: string | undefined, fy: number) {
  const quarters = await prisma.quarter.findMany({
    where: { financialYear: fy },
    orderBy: { quarterNumber: "asc" },
  });
  const mappedSize = (await mappedBranchIds(sfhScope)).size;
  const breakdown: Record<string, { visited: number; pending: number }> = {};
  for (const q of quarters) {
    const key = q.label ?? `Q${q.quarterNumber}`;
    const vis = await submittedBranchCountForQuarter(q.id, sfhScope);
    breakdown[key] = { visited: vis, pending: Math.max(mappedSize - vis, 0) };
  }
  return breakdown;
}

router.get("/sfh", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const cq = await currentQuarterHeader();
    if (!cq) throw new HttpError("No quarter covers today — run quarter seed/bootstrap", 500);
    const sfh = await getSfhRecordForUser(req.user!.id, UserRole.sfh);
    if (!sfh) throw new HttpError("Forbidden", 403);
    const sfh_stat = await buildSfhStatRow(sfh.id, cq.id);
    const qb = await fyQuarterBreakdown(sfh.id, cq.financialYear);
    res.json({
      current_quarter: { label: cq.label, id: cq.id, financial_year: cq.financialYear, start: cq.startDate, end: cq.endDate },
      sfh_stats: [sfh_stat],
      quarterly_breakdown: qb,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/sfh/:sfhId", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const cq = await currentQuarterHeader();
    if (!cq) throw new HttpError("No quarter configured", 500);
    const sfh_stat = await buildSfhStatRow(req.params.sfhId, cq.id);
    const qb = await fyQuarterBreakdown(req.params.sfhId, cq.financialYear);
    res.json({
      current_quarter: { label: cq.label, id: cq.id, financial_year: cq.financialYear, start: cq.startDate, end: cq.endDate },
      sfh_stats: [sfh_stat],
      quarterly_breakdown: qb,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/supervisor", requireRoles(UserRole.supervisor), async (_req, res, next) => {
  try {
    const cq = await currentQuarterHeader();
    if (!cq) throw new HttpError("No quarter configured", 500);

    const allSfhs = await prisma.stateFacilityHead.findMany({
      where: { user: { isActive: true } },
      select: { id: true, user: { select: { email: true, name: true } } },
    });

    const sfh_stats = [];
    for (const s of allSfhs) {
      if (isPlaceholderSfhUser(s.user.email, s.user.name)) continue;
      sfh_stats.push(await buildSfhStatRow(s.id, cq.id));
    }

    const qb = await fyQuarterBreakdown(undefined, cq.financialYear);
    const mappedOrg = await mappedBranchIds();
    const visitedOrg = await submittedBranchCountForQuarter(cq.id);

    res.json({
      current_quarter: { label: cq.label, id: cq.id, financial_year: cq.financialYear, start: cq.startDate, end: cq.endDate },
      sfh_stats,
      quarterly_breakdown: qb,
      org_completion_hint: mappedOrg.size ? Math.round((visitedOrg / mappedOrg.size) * 10000) / 100 : 0,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
