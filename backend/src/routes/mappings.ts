import { Router } from "express";
import { ApprovalStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";

const router = Router();

router.use(authenticate);

const CreateMappingSchema = z.object({
  sfhId: z.string().uuid(),
  branchId: z.string().uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const RejectMappingSchema = z.object({
  reason: z.string().optional(),
  approvalRemarks: z.string().optional(),
});

router.get("/", async (req, res, next) => {
  try {
    if (req.user!.role === UserRole.supervisor) {
      const status =
        typeof req.query.status === "string" && ["pending", "approved", "rejected"].includes(req.query.status) ?
          (req.query.status as "pending" | "approved" | "rejected")
        : undefined;

      const mappings = await prisma.sfhBranchMapping.findMany({
        ...(status ? { where: { approvalStatus: status } } : {}),
        include: {
          sfh: {
            select: {
              id: true,
              userId: true,
              user: { select: { name: true } },
            },
          },
          branch: {
            select: {
              id: true,
              branchCode: true,
              branchName: true,
              city: true,
              state: true,
              location: true,
            },
          },
          approvedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return res.json(
        mappings.map((m) => ({
          id: m.id,
          sfhId: m.sfhId,
          sfhName: m.sfh.user.name,
          branchId: m.branchId,
          branchCode: m.branch.branchCode,
          branchName: m.branch.branchName,
          city: m.branch.city,
          state: m.branch.state,
          location: m.branch.location,
          approvalStatus: m.approvalStatus,
          approvalRemarks: m.approvalRemarks,
          approvedByName: m.approvedBy?.name ?? null,
          isCurrent: m.isCurrent,
          effectiveFrom: m.effectiveFrom,
          effectiveTo: m.effectiveTo,
          createdAt: m.createdAt,
        }))
      );
    }

    if (req.user!.role === UserRole.sfh) {
      const sfh = await prisma.stateFacilityHead.findUnique({
        where: { userId: req.user!.id },
        select: { id: true },
      });
      if (!sfh) return res.json([]);
      const rows = await prisma.sfhBranchMapping.findMany({
        where: { sfhId: sfh.id },
        include: { branch: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows);
    }

    throw new HttpError("Forbidden", 403);
  } catch (e) {
    next(e);
  }
});

router.get("/current", async (req, res, next) => {
  try {
    if (req.user!.role !== UserRole.supervisor) throw new HttpError("Forbidden", 403);
    const mappings = await prisma.sfhBranchMapping.findMany({
      where: { isCurrent: true, approvalStatus: ApprovalStatus.approved },
      include: {
        sfh: {
          select: {
            id: true,
            userId: true,
            user: { select: { name: true } },
          },
        },
        branch: {
          select: {
            id: true,
            branchCode: true,
            branchName: true,
            city: true,
            state: true,
            location: true,
          },
        },
      },
      orderBy: { branch: { branchCode: "asc" } },
    });
    res.json(mappings);
  } catch (e) {
    next(e);
  }
});

router.post("/", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const { sfhId, branchId, effectiveFrom } = CreateMappingSchema.parse(req.body);

    const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw new HttpError("Branch not found or inactive", 404);

    const sfh = await prisma.stateFacilityHead.findFirst({
      where: { id: sfhId },
      select: { id: true, user: { select: { isActive: true } } },
    });
    if (!sfh || !sfh.user.isActive) throw new HttpError("SFH not found or inactive", 404);

    const existingCurrent = await prisma.sfhBranchMapping.findFirst({
      where: { branchId, isCurrent: true, approvalStatus: ApprovalStatus.approved },
    });
    if (existingCurrent && existingCurrent.sfhId === sfhId) {
      throw new HttpError("This branch is already assigned to this SFH", 409);
    }

    const effectiveDate = new Date(`${effectiveFrom}T12:00:00.000Z`);
    if (!Number.isFinite(effectiveDate.getTime())) throw new HttpError("Invalid effectiveFrom", 400);

    const supervisorId = req.user!.id;

    const [, , mapping] = await prisma.$transaction([
      prisma.sfhBranchMapping.updateMany({
        where: { branchId, approvalStatus: ApprovalStatus.pending },
        data: {
          approvalStatus: ApprovalStatus.rejected,
          approvalRemarks: "Superseded by direct remap",
          approvedById: supervisorId,
        },
      }),
      prisma.sfhBranchMapping.updateMany({
        where: {
          branchId,
          isCurrent: true,
          approvalStatus: ApprovalStatus.approved,
        },
        data: {
          isCurrent: false,
          effectiveTo: new Date(),
        },
      }),
      prisma.sfhBranchMapping.create({
        data: {
          sfhId,
          branchId,
          approvalStatus: ApprovalStatus.approved,
          approvedById: supervisorId,
          effectiveFrom: effectiveDate,
          isCurrent: true,
        },
      }),
    ]);

    res.status(201).json(mapping);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/approve", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);

    const mapping = await prisma.sfhBranchMapping.findUnique({ where: { id } });
    if (!mapping) throw new HttpError("Mapping not found", 404);
    if (mapping.approvalStatus !== ApprovalStatus.pending) {
      throw new HttpError("Only pending mappings can be approved", 400);
    }

    await prisma.$transaction([
      prisma.sfhBranchMapping.updateMany({
        where: {
          branchId: mapping.branchId,
          isCurrent: true,
          approvalStatus: ApprovalStatus.approved,
        },
        data: {
          isCurrent: false,
          effectiveTo: new Date(),
        },
      }),
      prisma.sfhBranchMapping.update({
        where: { id: mapping.id },
        data: {
          isCurrent: true,
          approvalStatus: ApprovalStatus.approved,
          approvedById: req.user!.id,
          effectiveFrom: mapping.effectiveFrom ?? new Date(),
        },
      }),
    ]);

    res.json({ success: true, message: "Mapping approved and activated" });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/reject", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const parsed = RejectMappingSchema.safeParse(req.body ?? {});
    const reason = parsed.success ? (parsed.data.reason ?? parsed.data.approvalRemarks) : undefined;

    const mapping = await prisma.sfhBranchMapping.findUnique({ where: { id } });
    if (!mapping) throw new HttpError("Mapping not found", 404);
    if (mapping.approvalStatus !== ApprovalStatus.pending) {
      throw new HttpError("Only pending mappings can be rejected", 400);
    }

    await prisma.sfhBranchMapping.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.rejected,
        approvalRemarks: reason ?? null,
        approvedById: req.user!.id,
      },
    });

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
