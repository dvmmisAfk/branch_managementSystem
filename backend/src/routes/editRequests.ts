import { Router } from "express";
import { EditRequestStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { getSfhRecordForUser } from "../services/visit.service.js";
import { writeAudit } from "../services/auditLog.service.js";

const router = Router();
router.use(authenticate);

const visitInclude = {
  visit: {
    select: {
      id: true,
      branch: { select: { branchCode: true, branchName: true } },
      quarter: { select: { label: true } },
    },
  },
} as const;

// GET / — supervisor: all requests; SFH: their own
router.get("/", async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role === UserRole.supervisor) {
      const requests = await prisma.visitEditRequest.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          ...visitInclude,
          sfh: { select: { id: true, user: { select: { name: true } } } },
        },
      });
      res.json(requests);
    } else if (user.role === UserRole.sfh) {
      const sfh = await getSfhRecordForUser(user.id, UserRole.sfh);
      if (!sfh) throw new HttpError("SFH not found", 404);
      const requests = await prisma.visitEditRequest.findMany({
        where: { sfhId: sfh.id },
        orderBy: { createdAt: "desc" },
        include: visitInclude,
      });
      res.json(requests);
    } else {
      throw new HttpError("Forbidden", 403);
    }
  } catch (e) {
    next(e);
  }
});

// POST / — SFH submits an edit request for a submitted visit
router.post("/", requireRoles(UserRole.sfh), async (req, res, next) => {
  try {
    const { visitId, reason } = z
      .object({
        visitId: z.string().uuid(),
        reason: z.string().min(10, "Reason must be at least 10 characters"),
      })
      .parse(req.body);

    const sfh = await getSfhRecordForUser(req.user!.id, UserRole.sfh);
    if (!sfh) throw new HttpError("SFH not found", 404);

    const visit = await prisma.branchVisit.findUnique({
      where: { id: visitId },
      select: { id: true, sfhId: true, isSubmitted: true },
    });
    if (!visit) throw new HttpError("Visit not found", 404);
    if (visit.sfhId !== sfh.id) throw new HttpError("This visit does not belong to you", 403);
    if (!visit.isSubmitted) throw new HttpError("Only submitted visits can be requested for edit", 400);

    const existing = await prisma.visitEditRequest.findFirst({
      where: { visitId, status: EditRequestStatus.pending },
    });
    if (existing) throw new HttpError("A pending edit request already exists for this visit", 409);

    const request = await prisma.visitEditRequest.create({
      data: { visitId, sfhId: sfh.id, reason },
      include: visitInclude,
    });

    res.status(201).json(request);
  } catch (e) {
    next(e);
  }
});

// PATCH /:id/approve — supervisor approves → revert visit to draft
router.patch("/:id/approve", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);

    const editRequest = await prisma.visitEditRequest.findUnique({
      where: { id },
      select: { id: true, visitId: true, status: true },
    });
    if (!editRequest) throw new HttpError("Edit request not found", 404);
    if (editRequest.status !== EditRequestStatus.pending) {
      throw new HttpError("Only pending requests can be approved", 400);
    }

    await prisma.$transaction([
      prisma.branchVisit.update({
        where: { id: editRequest.visitId },
        data: { isSubmitted: false, submittedAt: null },
      }),
      prisma.visitEditRequest.update({
        where: { id },
        data: {
          status: EditRequestStatus.approved,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
      }),
    ]);

    await writeAudit({
      actorId: req.user!.id,
      action: "edit_request_approved",
      entityType: "VisitEditRequest",
      entityId: id,
      metadata: { visitId: editRequest.visitId },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// PATCH /:id/reject — supervisor rejects
router.patch("/:id/reject", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const editRequest = await prisma.visitEditRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!editRequest) throw new HttpError("Edit request not found", 404);
    if (editRequest.status !== EditRequestStatus.pending) {
      throw new HttpError("Only pending requests can be rejected", 400);
    }

    await prisma.visitEditRequest.update({
      where: { id },
      data: {
        status: EditRequestStatus.rejected,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: "edit_request_rejected",
      entityType: "VisitEditRequest",
      entityId: id,
      metadata: { reason },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
