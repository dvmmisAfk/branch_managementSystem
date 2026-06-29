import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { accountCreateLimiter } from "../middleware/rateLimits.js";

const router = Router();

router.use(authenticate, requireRoles(UserRole.supervisor));

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  role: z.literal(UserRole.branch_staff),
});

router.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        stateFacilityHead: { select: { id: true } },
      },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.post("/", accountCreateLimiter, async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        role: body.role,
        emailVerifiedAt: new Date(),
      },
    });
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (e) {
    next(e);
  }
});

const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError("Not found", 404);
    const body = patchUserSchema.parse(req.body);
    const data: { name?: string; isActive?: boolean; passwordHash?: string } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    const user = await prisma.user.update({ where: { id }, data });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    if (id === req.user!.id) throw new HttpError("Cannot deactivate own account", 400);
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
