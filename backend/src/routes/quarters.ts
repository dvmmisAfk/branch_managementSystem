import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.use(authenticate);

router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.quarter.findMany({ orderBy: [{ financialYear: "asc" }, { quarterNumber: "asc" }] });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/current", async (_req, res, next) => {
  try {
    const now = new Date();
    const row = await prisma.quarter.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    });
    if (!row) {
      return res.status(404).json({ error: "No quarter contains today’s date. Run quarter seed." });
    }
    res.json(row);
  } catch (e) {
    next(e);
  }
});

export default router;
