import { Router } from "express";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";

const router = Router();

router.use(authenticate);

// ── Zod schemas ────────────────────────────────────────────────────────────────

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
  maxScore: z.number().int().min(1).max(10).default(5),
  displayOrder: z.number().int().min(0),
  weightWithinCategory: z.number().min(0).max(100).optional().nullable(),
});

const patchSubSchema = postSubSchema.partial();

const reorderSchema = z.array(
  z.object({ id: z.string().uuid(), displayOrder: z.number().int().min(0) })
).min(1);

// ── Audit log helper ───────────────────────────────────────────────────────────

async function writeAuditLog(opts: {
  action: string;
  entityType: "category" | "subcategory";
  entityId: string;
  changedById: string;
  before?: object | null;
  after?: object | null;
}) {
  await prisma.scorecardAuditLog.create({
    data: {
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      changedById: opts.changedById,
      beforeValue: opts.before ?? undefined,
      afterValue: opts.after ?? undefined,
    },
  });
}

// ── GET /categories ────────────────────────────────────────────────────────────

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

// ── POST /categories ───────────────────────────────────────────────────────────

router.post("/", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const body = postCategorySchema.parse(req.body);
    const created = await prisma.assessmentCategory.create({
      data: {
        name: body.name,
        displayOrder: body.displayOrder,
        maxPoints: body.maxPoints ?? undefined,
        weightPercent:
          body.weightPercent === undefined || body.weightPercent === null
            ? undefined
            : new Prisma.Decimal(body.weightPercent),
        version: 1,
      },
      include: { subcategories: true },
    });
    await writeAuditLog({
      action: "create_category",
      entityType: "category",
      entityId: created.id,
      changedById: req.user!.id,
      after: { name: created.name, displayOrder: created.displayOrder },
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

// ── PATCH /categories/reorder ──────────────────────────────────────────────────
// MUST be defined before /:id to prevent "reorder" being parsed as a UUID param.

router.patch("/reorder", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const rows = reorderSchema.parse(req.body);
    await prisma.$transaction(
      rows.map((r) =>
        prisma.assessmentCategory.update({
          where: { id: r.id },
          data: { displayOrder: r.displayOrder },
        })
      )
    );
    await writeAuditLog({
      action: "reorder_categories",
      entityType: "category",
      entityId: rows[0]!.id,
      changedById: req.user!.id,
      after: { order: rows },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── PATCH /categories/:id ──────────────────────────────────────────────────────

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
      body.weightPercent !== undefined
        ? body.weightPercent
        : old.weightPercent
        ? Number(old.weightPercent)
        : null;

    const activeSubs = old.subcategories.filter((s) => s.isActive);
    const neu = await prisma.assessmentCategory.create({
      data: {
        name,
        displayOrder,
        maxPoints: maxPoints ?? undefined,
        weightPercent:
          weightPercentRaw === null || weightPercentRaw === undefined
            ? undefined
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
    await writeAuditLog({
      action: "edit_category",
      entityType: "category",
      entityId: neu.id,
      changedById: req.user!.id,
      before: { name: old.name, displayOrder: old.displayOrder, version: old.version },
      after: { name: neu.name, displayOrder: neu.displayOrder, version: neu.version },
    });

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

// ── DELETE /categories/:id ─────────────────────────────────────────────────────

router.delete("/:id", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const id = req.params.id;
    const cat = await prisma.assessmentCategory.findUnique({
      where: { id },
      include: { subcategories: { where: { isActive: true } } },
    });
    if (!cat?.isActive) throw new HttpError("Category not found or already inactive", 404);
    if (cat.subcategories.length > 0) {
      throw new HttpError(
        "Category has active parameters. Remove all parameters before deleting the category.",
        409
      );
    }
    await prisma.assessmentCategory.update({
      where: { id },
      data: { isActive: false },
    });
    await writeAuditLog({
      action: "delete_category",
      entityType: "category",
      entityId: id,
      changedById: req.user!.id,
      before: { name: cat.name },
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── POST /categories/:categoryId/subcategories ─────────────────────────────────

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
          body.weightWithinCategory === undefined || body.weightWithinCategory === null
            ? undefined
            : new Prisma.Decimal(body.weightWithinCategory),
      },
    });
    await writeAuditLog({
      action: "create_subcategory",
      entityType: "subcategory",
      entityId: row.id,
      changedById: req.user!.id,
      after: { name: row.name, maxScore: row.maxScore, categoryId: catId },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// ── PATCH /categories/:categoryId/subcategories/reorder ────────────────────────
// MUST be defined before /:categoryId/subcategories/:subId to prevent "reorder"
// being parsed as :subId.

router.patch(
  "/:categoryId/subcategories/reorder",
  requireRoles(UserRole.supervisor),
  async (req, res, next) => {
    try {
      const catId = req.params.categoryId;
      const rows = reorderSchema.parse(req.body);
      await prisma.$transaction(
        rows.map((r) =>
          prisma.assessmentSubcategory.update({
            where: { id: r.id },
            data: { displayOrder: r.displayOrder },
          })
        )
      );
      // Verify uniqueness constraint after update
      const dups = await prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*) as cnt
        FROM "assessment_subcategories"
        WHERE "category_id" = ${catId}::uuid
          AND "is_active" = true
        GROUP BY "display_order"
        HAVING COUNT(*) > 1
        LIMIT 1
      `;
      if (dups.length > 0) throw new HttpError("display_order collision after reorder", 409);
      await writeAuditLog({
        action: "reorder_subcategories",
        entityType: "subcategory",
        entityId: rows[0]!.id,
        changedById: req.user!.id,
        after: { categoryId: catId, order: rows },
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

// ── PATCH /categories/:categoryId/subcategories/:subId ────────────────────────

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
        body.weightWithinCategory !== undefined
          ? body.weightWithinCategory === null
            ? undefined
            : body.weightWithinCategory
          : old.weightWithinCategory
          ? Number(old.weightWithinCategory)
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
      await writeAuditLog({
        action: "edit_subcategory",
        entityType: "subcategory",
        entityId: row.id,
        changedById: req.user!.id,
        before: { name: old.name, maxScore: old.maxScore },
        after: { name: row.name, maxScore: row.maxScore },
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  }
);

// ── DELETE /categories/:categoryId/subcategories/:subId ───────────────────────

router.delete("/:categoryId/subcategories/:subId", requireRoles(UserRole.supervisor), async (req, res, next) => {
  try {
    const { categoryId, subId } = req.params;
    const sub = await prisma.assessmentSubcategory.findFirst({
      where: { id: subId, categoryId },
    });
    if (!sub) throw new HttpError("Subcategory not found", 404);

    // 409 if this subcategory has been used in any visit scores
    const usedCount = await prisma.visitScore.count({ where: { subcategoryId: subId } });
    if (usedCount > 0) {
      // Deactivate but tell the caller it was already scored
      const maxAgg = await prisma.assessmentSubcategory.aggregate({
        where: { categoryId },
        _max: { displayOrder: true },
      });
      const bump = (maxAgg._max.displayOrder ?? 0) + 10_000;
      await prisma.assessmentSubcategory.update({
        where: { id: sub.id },
        data: { isActive: false, displayOrder: bump },
      });
      await writeAuditLog({
        action: "delete_subcategory",
        entityType: "subcategory",
        entityId: subId,
        changedById: req.user!.id,
        before: { name: sub.name, reason: "has_scored_visits" },
      });
      return res.status(409).json({
        ok: false,
        deactivated: true,
        message: "Subcategory has scored visits; deactivated instead of deleted.",
      });
    }

    const maxAgg = await prisma.assessmentSubcategory.aggregate({
      where: { categoryId },
      _max: { displayOrder: true },
    });
    const bump = (maxAgg._max.displayOrder ?? 0) + 10_000;
    await prisma.assessmentSubcategory.update({
      where: { id: sub.id },
      data: { isActive: false, displayOrder: bump },
    });
    await writeAuditLog({
      action: "delete_subcategory",
      entityType: "subcategory",
      entityId: subId,
      changedById: req.user!.id,
      before: { name: sub.name },
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
