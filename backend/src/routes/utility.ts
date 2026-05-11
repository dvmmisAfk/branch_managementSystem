import { Router } from "express";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../utils/HttpError.js";
import { assertBranchAssignedToSfh, getSfhRecordForUser } from "../services/visit.service.js";

const router = Router();

router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const branch_id = typeof req.query.branch_id === "string" ? req.query.branch_id : undefined;
    const fy =
      typeof req.query.financial_year === "string" ? parseInt(req.query.financial_year, 10) : undefined;

    let allowBranchIds: string[] | null = null;
    if (req.user!.role === UserRole.sfh) {
      const sfh = await getSfhRecordForUser(req.user!.id, req.user!.role);
      if (!sfh) return res.json([]);
      const maps = await prisma.sfhBranchMapping.findMany({
        where: { sfhId: sfh.id, isCurrent: true, approvalStatus: "approved" },
        select: { branchId: true },
      });
      allowBranchIds = maps.map((m) => m.branchId);
      if (!allowBranchIds.length) return res.json([]);
    }

    const where: { branchId?: string | { in: string[] }; financialYear?: number } = {};
    if (branch_id) {
      if (allowBranchIds && !allowBranchIds.includes(branch_id)) throw new HttpError("Forbidden", 403);
      where.branchId = branch_id;
    } else if (allowBranchIds) {
      where.branchId = { in: allowBranchIds };
    }
    if (fy !== undefined && Number.isFinite(fy)) where.financialYear = fy;

    const rows = await prisma.utilityConsumption.findMany({
      where,
      orderBy: [{ branchId: "asc" }, { financialYear: "desc" }, { quarterNumber: "asc" }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

const utilityBody = z.object({
  branch_id: z.string().uuid(),
  financial_year: z.number().int(),
  quarter_number: z.number().int().min(1).max(3),
  electricity_bill_amount: z.number().nullable().optional(),
  units_consumed: z.number().nullable().optional(),
  ot_expenses: z.number().nullable().optional(),
  action_points_expenses: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const body = utilityBody.parse(req.body);
    if (req.user!.role === UserRole.sfh) {
      const sfh = await getSfhRecordForUser(req.user!.id, UserRole.sfh);
      if (!sfh) throw new HttpError("Forbidden", 403);
      await assertBranchAssignedToSfh(body.branch_id, sfh.id);
    } else if (req.user!.role !== UserRole.supervisor) throw new HttpError("Forbidden", 403);

    const row = await prisma.utilityConsumption.upsert({
      where: {
        branchId_financialYear_quarterNumber: {
          branchId: body.branch_id,
          financialYear: body.financial_year,
          quarterNumber: body.quarter_number,
        },
      },
      create: {
        branchId: body.branch_id,
        financialYear: body.financial_year,
        quarterNumber: body.quarter_number,
        electricityBillAmount: body.electricity_bill_amount ?? null,
        unitsConsumed: body.units_consumed ?? null,
        otExpenses: body.ot_expenses ?? null,
        actionPointsExpenses: body.action_points_expenses ?? null,
        remarks: body.remarks ?? null,
      },
      update: {
        electricityBillAmount: body.electricity_bill_amount ?? null,
        unitsConsumed: body.units_consumed ?? null,
        otExpenses: body.ot_expenses ?? null,
        actionPointsExpenses: body.action_points_expenses ?? null,
        remarks: body.remarks ?? null,
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.utilityConsumption.findUnique({
      where: { id },
      include: { branch: true },
    });
    if (!existing) throw new HttpError("Not found", 404);
    if (req.user!.role === UserRole.sfh) {
      const sfh = await getSfhRecordForUser(req.user!.id, UserRole.sfh);
      if (!sfh) throw new HttpError("Forbidden", 403);
      await assertBranchAssignedToSfh(existing.branchId, sfh.id);
    } else if (req.user!.role !== UserRole.supervisor) throw new HttpError("Forbidden", 403);

    const patch = utilityBody.partial().omit({ branch_id: true, financial_year: true, quarter_number: true }).parse(req.body ?? {});
    const data: Prisma.UtilityConsumptionUpdateInput = {};
    if (patch.electricity_bill_amount !== undefined) data.electricityBillAmount = patch.electricity_bill_amount;
    if (patch.units_consumed !== undefined) data.unitsConsumed = patch.units_consumed;
    if (patch.ot_expenses !== undefined) data.otExpenses = patch.ot_expenses;
    if (patch.action_points_expenses !== undefined)
      data.actionPointsExpenses = patch.action_points_expenses ?? null;
    if (patch.remarks !== undefined) data.remarks = patch.remarks ?? null;
    const row = await prisma.utilityConsumption.update({
      where: { id },
      data,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

export default router;
