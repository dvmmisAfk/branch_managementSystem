import { Router } from "express";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";

const router = Router();

router.use(authenticate);

const postCategorySchema = z.object({
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().min(0),
  maxPoints: z.number().int().positive().optional().nullable(),
  weightPercent: z.number().min(0).max(100).optional().nullable(),
});

const patchCategorySchema = postCategorySchema.partial();

const postSubSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  maxScore: z.number().int().positive().default(5),
  displayOrder: z.number().int().min(0),
  weightWithinCategory: z.number().min(0).max(100).optional().nullable(),
});

const patchSubSchema = postSubSchema.partial();

router.get("/", async (_req, res, next) => {
  try {
    const categories = await prisma.assessmentCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        subcategories: {
          where: { isActive: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    });
    res.json(categories);
  } catch (e) {
    next(e);
  }
});

router.post("/", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const body = postCategorySchema.parse(req.body);
    const created = await prisma.assessmentCategory.create({
      data: {
        name: body.name,
        displayOrder: body.displayOrder,
        maxPoints: body.maxPoints ?? undefined,
        weightPercent:
          body.weightPercent === undefined || body.weightPercent === null ?
            undefined
          : new Prisma.Decimal(body.weightPercent),
        version: 1,
      },
      include: { subcategories: true },
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

/** Category metadata change ⇒ new row (version+) and deactivate previous version + subs. */
router.patch("/:id", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = patchCategorySchema.parse(req.body);
    if (Object.keys(body).length === 0) throw new HttpError("No fields to update", 400);

    const old = await prisma.assessmentCategory.findUnique({
      where: { id },
      include: {
        subcategories: { orderBy: { displayOrder: "asc" } },
      },
    });
    if (!old?.isActive) throw new HttpError("Category not found or inactive", 404);

    const name = body.name ?? old.name;
    const displayOrder = body.displayOrder ?? old.displayOrder;
    const maxPoints = body.maxPoints !== undefined ? body.maxPoints : old.maxPoints;
    const weightPercentRaw =
      body.weightPercent !== undefined ? body.weightPercent : old.weightPercent ? Number(old.weightPercent) : null;

    const activeSubs = old.subcategories.filter((s) => s.isActive);
    const neu = await prisma.assessmentCategory.create({
      data: {
        name,
        displayOrder,
        maxPoints: maxPoints ?? undefined,
        weightPercent:
          weightPercentRaw === null || weightPercentRaw === undefined ?
            undefined
          : new Prisma.Decimal(weightPercentRaw),
        version: old.version + 1,
        subcategories: {
          createMany: {
            data: activeSubs.map((s) => ({
              name: s.name,
              description: s.description,
              maxScore: s.maxScore,
              weightWithinCategory: s.weightWithinCategory ?? undefined,
              displayOrder: s.displayOrder,
              isActive: true,
            })),
          },
        },
      },
    });
    await prisma.$transaction([
      prisma.assessmentSubcategory.updateMany({
        where: { categoryId: old.id },
        data: { isActive: false },
      }),
      prisma.assessmentCategory.update({
        where: { id: old.id },
        data: { isActive: false },
      }),
    ]);

    const full = await prisma.assessmentCategory.findUnique({
      where: { id: neu.id },
      include: {
        subcategories: { where: { isActive: true }, orderBy: { displayOrder: "asc" } },
      },
    });
    res.json(full);
  } catch (e) {
    next(e);
  }
});

router.post("/:categoryId/subcategories", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const catId = req.params.categoryId;
    const body = postSubSchema.parse(req.body);

    const cat = await prisma.assessmentCategory.findFirst({
      where: { id: catId, isActive: true },
    });
    if (!cat) throw new HttpError("Active category not found", 404);

    const clash = await prisma.assessmentSubcategory.findUnique({
      where: {
        categoryId_displayOrder: {
          categoryId: catId,
          displayOrder: body.displayOrder,
        },
      },
    });
    if (clash?.isActive) throw new HttpError("display_order already used in this category", 409);

    if (clash && !clash.isActive) {
      const maxAgg = await prisma.assessmentSubcategory.aggregate({
        where: { categoryId: catId },
        _max: { displayOrder: true },
      });
      const bump = (maxAgg._max.displayOrder ?? 0) + 10_000;
      await prisma.assessmentSubcategory.update({
        where: { id: clash.id },
        data: { displayOrder: bump },
      });
    }
    const row = await prisma.assessmentSubcategory.create({
      data: {
        categoryId: catId,
        name: body.name,
        description: body.description ?? null,
        maxScore: body.maxScore,
        displayOrder: body.displayOrder,
        weightWithinCategory:
          body.weightWithinCategory === undefined || body.weightWithinCategory === null ?
            undefined
          : new Prisma.Decimal(body.weightWithinCategory),
      },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

/** Subcategory change ⇒ deactivate old row, insert replacement (same display_order slot). */
router.patch(
  "/:categoryId/subcategories/:subId",
  requireRoles(UserRole.supervisor),
  async (req, res, next) => {
    try {
      const { categoryId, subId } = req.params;
      const body = patchSubSchema.parse(req.body);

      const old = await prisma.assessmentSubcategory.findFirst({
        where: { id: subId, categoryId },
      });
      if (!old) throw new HttpError("Subcategory not found", 404);

      const name = body.name ?? old.name;
      const description = body.description !== undefined ? body.description : old.description;
      const maxScore = body.maxScore ?? old.maxScore;
      const displayOrder = body.displayOrder ?? old.displayOrder;
      const w =
        body.weightWithinCategory !== undefined ?
          body.weightWithinCategory === null ?
            undefined
          : body.weightWithinCategory
        : old.weightWithinCategory ? Number(old.weightWithinCategory)
        : null;

      const maxAgg = await prisma.assessmentSubcategory.aggregate({
        where: { categoryId },
        _max: { displayOrder: true },
      });
      const bump = (maxAgg._max.displayOrder ?? 0) + 10_000;
      await prisma.assessmentSubcategory.update({
        where: { id: old.id },
        data: { isActive: false, displayOrder: bump },
      });

      const occupied = await prisma.assessmentSubcategory.findUnique({
        where: { categoryId_displayOrder: { categoryId, displayOrder } },
      });
      if (occupied?.isActive) throw new HttpError("display_order clashes with another active subcategory", 409);
      if (occupied && !occupied.isActive && occupied.id !== old.id) {
        const mx = await prisma.assessmentSubcategory.aggregate({
          where: { categoryId },
          _max: { displayOrder: true },
        });
        await prisma.assessmentSubcategory.update({
          where: { id: occupied.id },
          data: { displayOrder: (mx._max.displayOrder ?? 0) + 10_000 },
        });
      }

      const row = await prisma.assessmentSubcategory.create({
        data: {
          categoryId,
          name,
          description,
          maxScore,
          displayOrder,
          weightWithinCategory: w === null || w === undefined ? undefined : new Prisma.Decimal(w),
          isActive: true,
        },
      });

      res.json(row);
    } catch (e) {
      next(e);
    }
  }
);

router.delete("/:categoryId/subcategories/:subId", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const { categoryId, subId } = req.params;
    const sub = await prisma.assessmentSubcategory.findFirst({
      where: { id: subId, categoryId },
    });
    if (!sub) throw new HttpError("Subcategory not found", 404);

    const maxAgg = await prisma.assessmentSubcategory.aggregate({
      where: { categoryId },
      _max: { displayOrder: true },
    });
    const bump = (maxAgg._max.displayOrder ?? 0) + 10_000;
    await prisma.assessmentSubcategory.update({
      where: { id: sub.id },
      data: { isActive: false, displayOrder: bump },
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
