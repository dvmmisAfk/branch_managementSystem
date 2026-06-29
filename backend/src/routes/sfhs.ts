import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/requireRoles.js";
import { HttpError } from "../utils/HttpError.js";
import { writeAudit } from "../services/auditLog.service.js";
import { LEGACY_PLACEHOLDER_SF_EMAILS } from "../utils/sfhPlaceholders.js";
import { accountCreateLimiter } from "../middleware/rateLimits.js";
import { normalizeSfhEmployeeCode, syntheticEmailFromEmployeeCode } from "../lib/employeeAuth.js";
import { generateSfhPassword } from "../lib/generateSfhPassword.js";
import { securityLog } from "../lib/securityLog.js";
import { env } from "../config/env.js";
import {
  decryptSfhSupervisorPasswordVault,
  encryptSfhSupervisorPasswordVault,
} from "../lib/sfhSupervisorPasswordVault.js";
import { createRevealToken, redeemRevealToken } from "../lib/revealTokenStore.js";

const router = Router();

router.use(authenticate, requireRoles(UserRole.supervisor));

const CreateSfhSchema = z.object({
  name: z.string().min(2),
  employeeId: z.string().min(2),
  phone: z.string().optional(),
  stateRegion: z.string().min(2),
  // No password field — password is generated server-side so plaintext never
  // travels from the browser to the backend.
});

const UpdateSfhSchema = z.object({
  name: z.string().min(2).optional(),
  employeeId: z.string().min(2).optional(),
  phone: z.string().optional(),
  stateRegion: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

/**
 * Hash the password, update the user row, persist the encrypted blob to the
 * StateFacilityHead row, and return a single-use reveal token (valid 2 min).
 * The plaintext never appears in any response body — callers get only the token.
 */
async function setAndVaultSfhPassword(sfhId: string, userId: string): Promise<string> {
  const plain = generateSfhPassword();
  const passwordHash = await hashPassword(plain);
  const supervisorPasswordEnc = encryptSfhSupervisorPasswordVault(plain);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.stateFacilityHead.update({ where: { id: sfhId }, data: { supervisorPasswordEnc } }),
  ]);
  return createRevealToken(supervisorPasswordEnc);
}

/** List / lookup selects: omit `supervisor_password_enc` so reads work before migration is applied. */
const sfhListSelect = {
  id: true,
  userId: true,
  employeeCode: true,
  phone: true,
  stateRegion: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, isActive: true } },
  mappings: {
    where: { isCurrent: true, approvalStatus: "approved" as const },
    select: { id: true },
  },
} satisfies Prisma.StateFacilityHeadSelect;

router.get("/", async (req, res, next) => {
  try {
    const assignmentOnly =
      req.query.assignment === "true" ||
      req.query.assignment === "1" ||
      req.query.assignment === "yes";
    const includeLegacyPlaceholders = req.query.includeLegacyPlaceholders === "true";

    const excludePlaceholderUsers: Prisma.UserWhereInput = {
      NOT: {
        OR: [
          { email: { in: [...LEGACY_PLACEHOLDER_SF_EMAILS] } },
          { name: { startsWith: "SFH Placeholder", mode: "insensitive" } },
        ],
      },
    };

    let userWhere: Prisma.UserWhereInput | undefined;
    if (assignmentOnly) {
      userWhere = { isActive: true, ...excludePlaceholderUsers };
    } else if (!includeLegacyPlaceholders) {
      userWhere = excludePlaceholderUsers;
    }

    const sfhs = await prisma.stateFacilityHead.findMany({
      where: userWhere ? { user: userWhere } : undefined,
      select: sfhListSelect,
      orderBy: { user: { name: "asc" } },
    });

    res.json(
      sfhs.map((s) => ({
        id: s.id,
        userId: s.user.id,
        name: s.user.name,
        email: s.user.email,
        isActive: s.user.isActive,
        employeeCode: s.employeeCode,
        phone: s.phone,
        stateRegion: s.stateRegion,
        assignedBranches: s.mappings.length,
      })),
    );
  } catch (e) {
    next(e);
  }
});

/** Kept for backward compatibility — no longer called by the frontend (password is now generated server-side on POST /sfhs). */
router.get("/generate-password", (_req, res) => {
  res.json({ password: generateSfhPassword() });
});

router.get("/password-reset-requests", async (_req, res, next) => {
  try {
    const rows = await prisma.sfhPasswordResetRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            stateFacilityHead: { select: { id: true, employeeCode: true } },
          },
        },
      },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        userId: r.userId,
        sfhName: r.user.name,
        employeeId: r.user.stateFacilityHead?.employeeCode ?? null,
        sfhRowId: r.user.stateFacilityHead?.id ?? null,
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.post("/password-reset-requests/:requestId/fulfill", async (req, res, next) => {
  try {
    const requestId = z.string().uuid().parse(req.params.requestId);
    const row = await prisma.sfhPasswordResetRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          include: {
            stateFacilityHead: { select: { id: true } },
          },
        },
      },
    });
    if (!row || row.status !== "pending") throw new HttpError("Request not found or already handled", 404);
    if (!row.user.stateFacilityHead || row.user.role !== UserRole.sfh) {
      throw new HttpError("Invalid request", 400);
    }

    const revealToken = await setAndVaultSfhPassword(row.user.stateFacilityHead.id, row.userId);
    await prisma.sfhPasswordResetRequest.update({
      where: { id: requestId },
      data: {
        status: "fulfilled",
        fulfilledAt: new Date(),
        fulfilledById: req.user!.id,
      },
    });
    await writeAudit({
      actorId: req.user!.id,
      action: "sfh_password_reset_fulfill",
      entityType: "User",
      entityId: row.userId,
      metadata: { requestId },
    });
    securityLog("auth_supervisor_sfh_password_set", {
      req,
      targetUserId: row.userId,
      via: "reset_request",
    });
    // Return a reveal token — not the plaintext password — to keep it out of response logs.
    res.json({ revealToken });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/regenerate-password", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const sfh = await prisma.stateFacilityHead.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        user: { select: { role: true } },
      },
    });
    if (!sfh) throw new HttpError("SFH not found", 404);
    if (sfh.user.role !== UserRole.sfh) throw new HttpError("Invalid account", 400);

    const revealToken = await setAndVaultSfhPassword(sfh.id, sfh.userId);
    await writeAudit({
      actorId: req.user!.id,
      action: "sfh_password_regenerate",
      entityType: "User",
      entityId: sfh.userId,
      metadata: { sfhId: id },
    });
    securityLog("auth_supervisor_sfh_password_set", {
      req,
      targetUserId: sfh.userId,
      via: "regenerate",
    });
    res.json({ revealToken });
  } catch (e) {
    next(e);
  }
});

/**
 * One-time password reveal. The supervisor receives a revealToken from
 * regenerate-password or fulfill; this endpoint decrypts and returns the
 * password exactly once. Second call returns 404.
 *
 * NOTE: Do not log response bodies for this endpoint in APM/proxy configurations.
 */
router.get("/password-reveal/:token", async (req, res, next) => {
  try {
    const raw = z.string().min(1).max(128).parse(req.params.token);
    const encryptedBlob = redeemRevealToken(raw);
    if (!encryptedBlob) {
      throw new HttpError("Token not found, already used, or expired", 404, undefined, "REVEAL_TOKEN_INVALID");
    }
    let password: string;
    try {
      password = decryptSfhSupervisorPasswordVault(encryptedBlob);
    } catch {
      throw new HttpError("Could not decrypt stored password", 500);
    }
    res.json({ password });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/supervisor-password", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const sfh = await prisma.stateFacilityHead.findUnique({
      where: { id },
      select: { id: true, supervisorPasswordEnc: true },
    });
    if (!sfh) throw new HttpError("SFH not found", 404);
    if (!sfh.supervisorPasswordEnc) {
      throw new HttpError(
        "No supervisor-stored password for this account yet. Use Generate new password once; after that, the current password can be shown here.",
        404,
      );
    }
    let password: string;
    try {
      password = decryptSfhSupervisorPasswordVault(sfh.supervisorPasswordEnc);
    } catch {
      throw new HttpError("Stored password could not be decrypted (server key may have changed). Use Generate new password.", 500);
    }
    await writeAudit({
      actorId: req.user!.id,
      action: "sfh_supervisor_password_view",
      entityType: "StateFacilityHead",
      entityId: id,
      metadata: {},
    });
    securityLog("auth_supervisor_sfh_password_view", { req, targetSfhId: id });
    res.json({ password });
  } catch (e) {
    next(e);
  }
});

router.post("/", accountCreateLimiter, async (req, res, next) => {
  try {
    const { name, employeeId, phone, stateRegion } = CreateSfhSchema.parse(req.body);
    const code = normalizeSfhEmployeeCode(employeeId);
    const email = syntheticEmailFromEmployeeCode(code);

    const dupUser = await prisma.user.findUnique({ where: { email } });
    if (dupUser) throw new HttpError("This employee ID is already registered", 409);
    const dupCode = await prisma.stateFacilityHead.findFirst({
      where: { employeeCode: code },
      select: { id: true },
    });
    if (dupCode) throw new HttpError("This employee ID is already in use", 409);

    // Generate password server-side — plaintext never appears in request/response bodies.
    const plain = generateSfhPassword();
    const passwordHash = await hashPassword(plain);
    const supervisorPasswordEnc = encryptSfhSupervisorPasswordVault(plain);
    const revealToken = createRevealToken(supervisorPasswordEnc);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: UserRole.sfh,
        isActive: true,
        emailVerifiedAt: new Date(),
        stateFacilityHead: {
          create: {
            employeeCode: code,
            phone: phone ?? null,
            stateRegion,
            supervisorPasswordEnc,
          },
        },
      },
      include: { stateFacilityHead: true },
    });
    const result = { user, sfh: user.stateFacilityHead! };

    await writeAudit({
      actorId: req.user!.id,
      action: "sfh_create",
      entityType: "StateFacilityHead",
      entityId: result.sfh.id,
      metadata: { employeeCode: code },
    });

    // Return a reveal token in place of the plaintext password to keep it out of response logs.
    res.status(201).json({
      id: result.sfh.id,
      userId: result.user.id,
      name: result.user.name,
      employeeCode: code,
      revealToken,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const sfhRow = await prisma.stateFacilityHead.findUnique({
      where: { id },
      select: { id: true, userId: true, employeeCode: true },
    });
    if (!sfhRow) throw new HttpError("SFH not found", 404);
    const body = UpdateSfhSchema.parse(req.body);

    if (body.employeeId !== undefined) {
      const newCode = normalizeSfhEmployeeCode(body.employeeId);
      if (newCode !== sfhRow.employeeCode) {
        const clash = await prisma.stateFacilityHead.findFirst({
          where: { employeeCode: newCode, id: { not: id } },
          select: { id: true },
        });
        if (clash) throw new HttpError("This employee ID is already in use", 409);
        const newEmail = syntheticEmailFromEmployeeCode(newCode);
        const emailTaken = await prisma.user.findFirst({
          where: { email: newEmail, NOT: { id: sfhRow.userId } },
        });
        if (emailTaken) throw new HttpError("This employee ID conflicts with another account", 409);
      }
    }

    const sfhForUpdate = await prisma.stateFacilityHead.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!sfhForUpdate) throw new HttpError("SFH not found", 404);

    const sData: Prisma.StateFacilityHeadUpdateInput = {};
    if (body.phone !== undefined) sData.phone = body.phone || null;
    if (body.stateRegion !== undefined) sData.stateRegion = body.stateRegion;
    if (body.employeeId !== undefined) {
      sData.employeeCode = normalizeSfhEmployeeCode(body.employeeId);
    }

    const uData: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) uData.name = body.name;
    if (body.isActive !== undefined) uData.isActive = body.isActive;
    if (body.employeeId !== undefined) {
      uData.email = syntheticEmailFromEmployeeCode(normalizeSfhEmployeeCode(body.employeeId));
    }

    await prisma.stateFacilityHead.update({ where: { id }, data: sData });
    if (Object.keys(uData).length > 0) {
      await prisma.user.update({ where: { id: sfhForUpdate.userId }, data: uData });
    }

    const updated = await prisma.stateFacilityHead.findUnique({
      where: { id },
      select: sfhListSelect,
    });
    if (!updated) throw new HttpError("SFH not found", 404);

    res.json({
      id: updated.id,
      userId: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      isActive: updated.user.isActive,
      employeeCode: updated.employeeCode,
      phone: updated.phone,
      stateRegion: updated.stateRegion,
      assignedBranches: updated.mappings.length,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
