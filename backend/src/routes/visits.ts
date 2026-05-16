import { Router } from "express";
import { IssueStatus, Prisma, ScoreStatus, UserRole, VisitType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { writeAudit } from "../services/auditLog.service.js";
import {
  applyBranchFacilitySlice,
  assertBranchAssignedToSfh,
  assertVisitEditableDraft,
  assertVisitReadable,
  createVisitDraft,
  getSfhRecordForUser,
} from "../services/visit.service.js";
import { recalculateScoreSnapshotForVisit } from "../services/scoreCalculation.service.js";
import { buildVisitPdfFromModel } from "../services/pdfGeneration.service.js";
import { buildVisitExcelBuffer, buildIssuesSummarySheet } from "../services/excelExport.service.js";
import { loadVisitPdfModel } from "../services/visitReportLoader.service.js";
import { branchVisitScalarCore, queryVisitDetail } from "../queries/branchVisitDetail.query.js";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const quarterId =
      typeof req.query.quarter_id === "string" && req.query.quarter_id.trim() ?
        req.query.quarter_id
      : undefined;
    const sfhFilter =
      typeof req.query.sfh_id === "string" && req.query.sfh_id.trim() ? req.query.sfh_id : undefined;
    const status =
      typeof req.query.status === "string" ?
        req.query.status === "submitted" ? true
        : req.query.status === "draft" ? false
        : undefined
      : undefined;

    let where: Record<string, unknown> = {};

    if (req.user!.role === UserRole.sfh) {
      const sfh = await getSfhRecordForUser(req.user!.id, req.user!.role);
      if (!sfh) return res.json([]);
      where = { sfhId: sfh.id };
    } else if (req.user!.role !== UserRole.supervisor) throw new HttpError("Forbidden", 403);

    if (sfhFilter && req.user!.role === UserRole.supervisor) {
      where = { ...(where as object), sfhId: sfhFilter };
    }

    if (quarterId) where = { ...where, quarterId };

    const scoreBandRaw = typeof req.query.score_band === "string" ? req.query.score_band : undefined;

    let visits = await prisma.branchVisit.findMany({
      where: where as never,
      select: {
        id: true,
        branchId: true,
        isSubmitted: true,
        visitType: true,
        visitDateActual: true,
        createdAt: true,
        branch: { select: { branchCode: true, branchName: true } },
        quarter: { select: { id: true, label: true } },
        scoreSnapshot: {
          select: {
            scoreBand: true,
            scorePercentage: true,
          },
        },
        sfh: {
          select: {
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (status !== undefined) visits = visits.filter((v) => v.isSubmitted === status);
    if (scoreBandRaw) visits = visits.filter((v) => v.scoreSnapshot?.scoreBand === scoreBandRaw);

    res.json(visits);
  } catch (e) {
    next(e);
  }
});

router.post("/", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const sfh = await getSfhRecordForUser(req.user!.id, UserRole.sfh);
    if (!sfh) throw new HttpError("Forbidden", 403);

    const body = z.object({ branch_id: z.string().uuid(), quarter_id: z.string().uuid() }).parse(req.body);
    await assertBranchAssignedToSfh(body.branch_id, sfh.id);
    const v = await createVisitDraft({
      branchId: body.branch_id,
      quarterId: body.quarter_id,
      sfhId: sfh.id,
      sfhUserId: req.user!.id,
    });

    const full = await queryVisitDetail(v.id);
    if (!full) throw new HttpError("Visit created but failed to load", 500);
    res.status(201).json(full);
  } catch (e) {
    next(e);
  }
});

router.get("/:id/scores", async (req, res, next) => {
  try {
    const visit = await assertVisitReadable(req.params.id, req.user!);
    res.json(
      await prisma.visitScore.findMany({
        where: { visitId: visit.id },
        include: {
          subcategory: { include: { category: { select: { id: true, name: true, displayOrder: true } } } },
        },
        orderBy: [
          { subcategory: { category: { displayOrder: "asc" } } },
          { subcategory: { displayOrder: "asc" } },
        ],
      })
    );
  } catch (e) {
    next(e);
  }
});

const scoreRow = z.object({
  subcategoryId: z.string().uuid(),
  status: z.nativeEnum(ScoreStatus),
  scoreGiven: z.number().int().min(0).max(10).nullable().optional(),
  observations: z.string().nullable().optional(),
  remsNumber: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

router.put("/:id/scores", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const visit = await assertVisitEditableDraft(req.params.id, req.user!);
    const rows = z.array(scoreRow).min(1).parse(req.body);
    const existingScores = await prisma.visitScore.findMany({ where: { visitId: visit.id } });
    const scoreMap = new Map(existingScores.map((s) => [s.subcategoryId, s]));
    const updates = rows.map((r) => {
      const row = scoreMap.get(r.subcategoryId);
      if (!row) throw new HttpError(`Unknown score row for subcategory ${r.subcategoryId}`, 400);
      let sg = r.scoreGiven ?? null;
      if (r.status === ScoreStatus.not_applicable) sg = null;
      else if (sg === null || sg === undefined) throw new HttpError("scoreGiven required unless NA", 400);
      if (sg !== null && sg > row.maxScore) throw new HttpError(`Score exceeds max (${row.maxScore})`, 400);
      return prisma.visitScore.update({
        where: { id: row.id },
        data: {
          status: r.status,
          scoreGiven: sg,
          observations: r.observations ?? undefined,
          remsNumber: r.remsNumber ?? undefined,
          remarks: r.remarks ?? undefined,
        },
      });
    });
    await prisma.$transaction(updates);
    await recalculateScoreSnapshotForVisit(visit.id);
    const snap = await prisma.scoreSnapshot.findUnique({ where: { visitId: visit.id } });
    res.json({ ok: true, scoreSnapshot: snap });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/issues", async (req, res, next) => {
  try {
    const visit = await assertVisitReadable(req.params.id, req.user!);
    const issues = await prisma.visitIssue.findMany({
      where: { visitId: visit.id },
      include: { category: true },
    });
    res.json(issues);
  } catch (e) {
    next(e);
  }
});

const issueBody = z.object({
  categoryId: z.string().uuid(),
  issue_description: z.string().min(1),
  scheduled_closure_date: z.string().optional(),
});

router.post("/:id/issues", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const visit = await assertVisitEditableDraft(req.params.id, req.user!);
    const b = issueBody.parse(req.body);
    const issue = await prisma.visitIssue.create({
      data: {
        visitId: visit.id,
        categoryId: b.categoryId,
        issueDescription: b.issue_description,
        scheduledClosureDate:
          b.scheduled_closure_date?.trim()?.length ?
            new Date(b.scheduled_closure_date)
          : null,
      },
    });
    res.status(201).json(issue);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/issues/:issueId", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const visit = await assertVisitEditableDraft(req.params.id, req.user!);
    const issueId = z.string().uuid().parse(req.params.issueId);
    const existing = await prisma.visitIssue.findFirst({ where: { id: issueId, visitId: visit.id } });
    if (!existing) throw new HttpError("Issue not found", 404);

    const body = z
      .object({
        scheduled_closure_date: z.string().nullable().optional(),
        issue_status: z.nativeEnum(IssueStatus).optional(),
        resolution_notes: z.string().nullable().optional(),
      })
      .parse(req.body || {});

    const upd = await prisma.visitIssue.update({
      where: { id: existing.id },
      data: {
        scheduledClosureDate:
          body.scheduled_closure_date !== undefined ?
            body.scheduled_closure_date ?
              new Date(body.scheduled_closure_date)
            : null
          : undefined,
        issueStatus: body.issue_status,
        resolutionNotes: body.resolution_notes ?? undefined,
        resolvedAt:
          body.issue_status === IssueStatus.resolved ? new Date()
          : body.issue_status ? null
          : undefined,
      },
    });
    res.json(upd);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id/issues/:issueId", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const visit = await assertVisitEditableDraft(req.params.id, req.user!);
    const issueId = z.string().uuid().parse(req.params.issueId);
    const existing = await prisma.visitIssue.findFirst({ where: { id: issueId, visitId: visit.id } });
    if (!existing) throw new HttpError("Issue not found", 404);
    await prisma.visitIssue.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    await assertVisitReadable(req.params.id, req.user!);
    const model = await loadVisitPdfModel(req.params.id);
    const buf = await buildVisitPdfFromModel(model);
    const slug = `${model.branch.branchCode}-${(model.quarter.label ?? `Q${model.quarter.quarterNumber}`).replace(/\s+/g, "-")}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="branch-visit-${slug}.pdf"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.get("/:id/excel", async (req, res, next) => {
  try {
    await assertVisitReadable(req.params.id, req.user!);
    const model = await loadVisitPdfModel(req.params.id);
    const buf = await buildVisitExcelBuffer(model);
    const slug = `${model.branch.branchCode}-${(model.quarter.label ?? `Q${model.quarter.quarterNumber}`).replace(/\s+/g, "-")}`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="branch-visit-${slug}.xlsx"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.get("/:id/issues-excel", async (req, res, next) => {
  try {
    const visit = await assertVisitReadable(req.params.id, req.user!);
    const issues = await prisma.visitIssue.findMany({
      where: { visitId: visit.id },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    });
    const buf = await buildIssuesSummarySheet(
      issues.map((i) => ({
        branchName: visit.branch.branchName,
        branchCode: visit.branch.branchCode,
        visitDate: visit.visitDateActual ? new Date(visit.visitDateActual).toISOString().slice(0, 10) : null,
        category: i.category.name,
        description: i.issueDescription,
        closure: i.scheduledClosureDate ? new Date(i.scheduledClosureDate).toISOString().slice(0, 10) : null,
        status: i.issueStatus,
      })),
      { reportTitle: `Issues — ${visit.branch.branchCode}`, subtitle: visit.quarter.label ?? "" },
    );
    const slug = `${visit.branch.branchCode}-issues`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}.xlsx"`);
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.post("/:id/submit", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const visit = await assertVisitEditableDraft(req.params.id, req.user!);
    const scores = await prisma.visitScore.findMany({ where: { visitId: visit.id } });
    if (scores.length === 0) throw new HttpError("No score rows", 400);
    const scoreErrors: { subcategoryId: string; reason: string }[] = [];
    for (const s of scores) {
      if (s.status === ScoreStatus.not_applicable) {
        if (s.scoreGiven !== null)
          scoreErrors.push({ subcategoryId: s.subcategoryId, reason: "N/A rows must have null score" });
      } else if (s.status === ScoreStatus.yes || s.status === ScoreStatus.no) {
        if (s.scoreGiven === null || s.scoreGiven < 0)
          scoreErrors.push({ subcategoryId: s.subcategoryId, reason: "Score required for yes/no rows" });
        else if (s.scoreGiven > s.maxScore)
          scoreErrors.push({ subcategoryId: s.subcategoryId, reason: `Score exceeds max (${s.maxScore})` });
      }
    }
    if (scoreErrors.length > 0) throw new HttpError(JSON.stringify({ error: "Incomplete scores", details: scoreErrors }), 422);

    await prisma.branchVisit.update({
      where: { id: visit.id },
      data: { isSubmitted: true, submittedAt: new Date() },
      select: { id: true },
    });
    await recalculateScoreSnapshotForVisit(visit.id);
    const updated = await prisma.branchVisit.findUnique({
      where: { id: visit.id },
      select: {
        id: true,
        isSubmitted: true,
        submittedAt: true,
        scoreSnapshot: true,
      },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

const unlockBody = z.object({
  visit_date_actual: z.string().optional(),
  reason: z.string().optional(),
});

router.post("/:id/unlock-date", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const body = unlockBody.parse(req.body || {});
    const visit = await prisma.branchVisit.findUnique({
      where: { id },
      select: { id: true, visitDateActual: true },
    });
    if (!visit) throw new HttpError("Not found", 404);
    const prev = visit.visitDateActual;
    const hasCorrectedDate = !!body.visit_date_actual?.trim()?.length;
    await prisma.branchVisit.update({
      where: { id },
      data: {
        visitDateActual: hasCorrectedDate ? new Date(body.visit_date_actual!) : visit.visitDateActual,
        visitDateLockedAt: hasCorrectedDate ? new Date() : null,
      },
      select: { id: true },
    });
    await writeAudit({
      actorId: req.user!.id,
      action: "visit_date_unlock",
      entityType: "branch_visit",
      entityId: id,
      metadata: { previousDate: prev, newDate: body.visit_date_actual ?? null, reason: body.reason ?? null },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const branchFacilityZ = z
  .object({
    upsCapacityKva: z.number().nullable().optional(),
    upsBackupTimeMins: z.number().int().nullable().optional(),
    acTonnage: z.number().nullable().optional(),
    electricityLoadKw: z.number().nullable().optional(),
    rmsVendorPresent: z.boolean().optional(),
    rmsVendorName: z.string().nullable().optional(),
    fireExtinguisherCount: z.number().int().optional(),
    dgOwnership: z.enum(["owned", "rented"]).nullable().optional(),
    dgCapacityKva: z.number().nullable().optional(),
  })
  .optional();

const visitPatchSchema = z
  .object({
    visit_type: z.nativeEnum(VisitType).optional(),
    visit_date_actual: z.string().nullable().optional(),
    reason_for_no_visit: z.string().nullable().optional(),
    virtual_staff_contact_name: z.string().nullable().optional(),
    virtual_staff_contact_phone: z.string().nullable().optional(),
    boi_name_snapshot: z.string().nullable().optional(),
    location_head_snapshot: z.string().nullable().optional(),
    staff_outsource_snapshot: z.number().int().optional(),
    staff_company_snapshot: z.number().int().optional(),
    staff_hk_resources_snapshot: z.number().int().optional(),
    staff_talic_employees_snapshot: z.number().int().optional(),
    workstations_linear_snapshot: z.number().int().optional(),
    workstations_lshape_snapshot: z.number().int().optional(),
    workstations_cubical_snapshot: z.number().int().optional(),
    is_infra_upgrade: z.boolean().optional(),
    landlord_issue: z.boolean().optional(),
    landlord_issue_details: z.string().nullable().optional(),
    incident_previous_visit: z.boolean().optional(),
    incident_previous_visit_details: z.string().nullable().optional(),
    audit_points_observed: z.boolean().optional(),
    audit_points_details: z.string().nullable().optional(),
    major_escalation: z.boolean().optional(),
    escalation_details: z.string().nullable().optional(),
    escalation_closure_date: z.string().nullable().optional(),
    electricity_last_quarter: z.number().finite().nullable().optional(),
    utility_lines: z
      .array(
        z.object({
          category: z.string().max(200),
          sub_category: z.string().max(200),
          amount: z.number().finite(),
        })
      )
      .max(100)
      .optional(),
    branch_facility: branchFacilityZ,
  })
  .strict();

router.patch("/:id", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const visit = await assertVisitEditableDraft(req.params.id, req.user!);
    const body = visitPatchSchema.parse(req.body ?? {});

    let visitDateActualPatch: Date | null | undefined;
    let visitDateLockedPatch: Date | null | undefined;
    visitDateActualPatch = undefined;
    visitDateLockedPatch = undefined;

    if (body.visit_date_actual !== undefined) {
      if (body.visit_date_actual === null) {
        if (visit.visitDateLockedAt) throw new HttpError("Visit date is locked and cannot be cleared", 403);
        visitDateActualPatch = null;
        visitDateLockedPatch = null;
      } else {
        const next = new Date(body.visit_date_actual);
        const nextDay = next.toISOString().slice(0, 10);
        const currDay =
          visit.visitDateActual ?
            visit.visitDateActual instanceof Date ?
              visit.visitDateActual.toISOString().slice(0, 10)
            : String(visit.visitDateActual).slice(0, 10)
          : null;
        if (visit.visitDateLockedAt) {
          if (nextDay !== currDay) throw new HttpError("Visit date is locked and cannot be changed", 403);
        } else {
          visitDateActualPatch = next;
          visitDateLockedPatch = new Date();
        }
      }
    }

    if (body.branch_facility && Object.keys(body.branch_facility).length) {
      await applyBranchFacilitySlice(
        visit.branchId,
        body.branch_facility as Parameters<typeof applyBranchFacilitySlice>[1]
      );
    }

    const updated = await prisma.branchVisit.update({
      where: { id: visit.id },
      data: {
        visitType: body.visit_type,
        reasonForNoVisit:
          body.reason_for_no_visit === undefined ? undefined
          : (body.reason_for_no_visit ?? undefined),
        virtualStaffContactName: body.virtual_staff_contact_name ?? undefined,
        virtualStaffContactPhone: body.virtual_staff_contact_phone ?? undefined,
        boiNameSnapshot: body.boi_name_snapshot ?? undefined,
        locationHeadSnapshot: body.location_head_snapshot ?? undefined,
        staffOutsourceSnapshot: body.staff_outsource_snapshot,
        staffCompanySnapshot: body.staff_company_snapshot,
        staffHkResourcesSnapshot: body.staff_hk_resources_snapshot,
        staffTalicEmployeesSnapshot: body.staff_talic_employees_snapshot,
        workstationsLinearSnapshot: body.workstations_linear_snapshot,
        workstationsLshapeSnapshot: body.workstations_lshape_snapshot,
        workstationsCubicalSnapshot: body.workstations_cubical_snapshot,
        visitDateActual: visitDateActualPatch === undefined ? undefined : visitDateActualPatch,
        visitDateLockedAt: visitDateLockedPatch === undefined ? undefined : visitDateLockedPatch,
        isInfraUpgrade: body.is_infra_upgrade,
        landlordIssue: body.landlord_issue,
        landlordIssueDetails:
          body.landlord_issue_details === undefined ?
            undefined
          : (body.landlord_issue_details ?? null),
        incidentPreviousVisit: body.incident_previous_visit,
        incidentPreviousVisitDetails:
          body.incident_previous_visit_details === undefined ?
            undefined
          : (body.incident_previous_visit_details ?? null),
        auditPointsObserved: body.audit_points_observed,
        auditPointsDetails:
          body.audit_points_details === undefined ? undefined
          : (body.audit_points_details ?? null),
        majorEscalation: body.major_escalation,
        escalationDetails: body.escalation_details === undefined ? undefined
        : (body.escalation_details ?? null),
        escalationClosureDate:
          body.escalation_closure_date !== undefined ?
            body.escalation_closure_date ?
              new Date(body.escalation_closure_date)
            : null
          : undefined,
        electricityLastQuarter:
          body.electricity_last_quarter !== undefined ?
            body.electricity_last_quarter === null ?
              null
            : body.electricity_last_quarter
          : undefined,
        utilityLinesJson:
          body.utility_lines !== undefined ?
            (body.utility_lines.map((r) => ({
              category: r.category.trim(),
              sub_category: r.sub_category.trim(),
              amount: r.amount,
            })) as Prisma.InputJsonValue)
          : undefined,
      },
      select: branchVisitScalarCore,
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const visit = await assertVisitReadable(req.params.id, req.user!);
    res.json(visit);
  } catch (e) {
    next(e);
  }
});

export default router;
