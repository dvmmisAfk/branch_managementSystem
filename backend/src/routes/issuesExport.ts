import { Router } from "express";
import { IssueStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { getSfhRecordForUser } from "../services/visit.service.js";
import { buildIssuesSummarySheet } from "../services/excelExport.service.js";
import { parsePagination } from "../utils/pagination.js";

const router = Router();
router.use(authenticate);

router.get("/export", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const sfh = await getSfhRecordForUser(req.user!.id, UserRole.sfh);
    if (!sfh) throw new HttpError("Forbidden", 403);

    const categoryFilter = typeof req.query.category === "string" ? req.query.category : undefined;
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;

    const allowed: IssueStatus[] = [IssueStatus.open, IssueStatus.in_progress, IssueStatus.resolved];
    const statusFilter =
      statusRaw && allowed.includes(statusRaw as IssueStatus) ? (statusRaw as IssueStatus) : undefined;

    const { take, skip } = parsePagination(req, 500);
    const issues = await prisma.visitIssue.findMany({
      take,
      skip,
      where: {
        ...(statusFilter ? { issueStatus: statusFilter } : { issueStatus: { in: [IssueStatus.open, IssueStatus.in_progress] } }),
        visit: { sfhId: sfh.id },
        ...(categoryFilter ?
          /^[0-9a-f-]{36}$/i.test(categoryFilter) ?
            { categoryId: categoryFilter }
          : { category: { name: { contains: categoryFilter, mode: "insensitive" } } }
        : {}),
      },
      include: {
        category: true,
        visit: { include: { branch: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const buf = await buildIssuesSummarySheet(
      issues.map((i) => ({
        branchName: i.visit.branch.branchName,
        branchCode: i.visit.branch.branchCode,
        visitDate: i.visit.visitDateActual?.toISOString().slice(0, 10) ?? null,
        category: i.category.name,
        description: i.issueDescription,
        closure: i.scheduledClosureDate?.toISOString().slice(0, 10) ?? null,
        status: i.issueStatus,
      })),
      { reportTitle: "My open issues (export)", subtitle: "SFH-scoped issue list" },
    );

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="my-open-issues.xlsx"');
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

export default router;
