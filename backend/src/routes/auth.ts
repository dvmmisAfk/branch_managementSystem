import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../utils/HttpError.js";
import { securityLog } from "../lib/securityLog.js";
import { loginLimiter, refreshLimiter, sfhPasswordResetRequestLimiter } from "../middleware/rateLimits.js";
import { normalizeSfhEmployeeCode } from "../lib/employeeAuth.js";

const router = Router();

const loginSchema = z.object({
  loginId: z.string().min(1),
  password: z.string().min(1),
});

const accessOpts = { expiresIn: env.JWT_EXPIRY } as SignOptions;
const refreshOpts = { expiresIn: env.JWT_REFRESH_EXPIRY } as SignOptions;

function signAccessToken(user: { id: string; email: string; name: string; role: string }) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, env.JWT_SECRET, accessOpts);
}

function signRefreshToken(user: { id: string; email: string; name: string; role: string }) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, typ: "refresh" },
    env.JWT_REFRESH_SECRET,
    refreshOpts,
  );
}

function mustBeVerifiedForLogin(user: { emailVerifiedAt: Date | null }): void {
  if (env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerifiedAt) {
    throw new HttpError("Verify your email before signing in.", 403);
  }
}

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const raw = body.loginId.trim();
    let user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      passwordHash: string;
      isActive: boolean;
      emailVerifiedAt: Date | null;
    };
    let employeeId: string | undefined;

    if (raw.includes("@")) {
      const email = raw.toLowerCase();
      const row = await prisma.user.findUnique({ where: { email } });
      if (!row?.isActive || row.role !== UserRole.supervisor) {
        securityLog("auth_login_failure", { req, reason: "invalid_credentials" });
        throw new HttpError("Invalid credentials", 401);
      }
      user = row;
    } else {
      const code = normalizeSfhEmployeeCode(raw);
      const sfh = await prisma.stateFacilityHead.findUnique({
        where: { employeeCode: code },
        select: {
          employeeCode: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              isActive: true,
              passwordHash: true,
              emailVerifiedAt: true,
            },
          },
        },
      });
      if (!sfh?.user?.isActive || sfh.user.role !== UserRole.sfh) {
        securityLog("auth_login_failure", { req, reason: "invalid_credentials" });
        throw new HttpError("Invalid credentials", 401);
      }
      user = sfh.user;
      employeeId = sfh.employeeCode ?? code;
    }

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      securityLog("auth_login_failure", { req, reason: "invalid_credentials" });
      throw new HttpError("Invalid credentials", 401);
    }
    mustBeVerifiedForLogin(user);

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    securityLog("auth_login_success", { req, userId: user.id, role: user.role });
    res.json({
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: !!user.emailVerifiedAt,
        ...(employeeId !== undefined ? { employeeId } : {}),
      },
    });
  } catch (e) {
    next(e);
  }
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post("/refresh", refreshLimiter, async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    const decoded = jwt.verify(body.refreshToken, env.JWT_REFRESH_SECRET) as {
      sub: string;
      email: string;
      name: string;
      role: string;
      typ?: string;
    };
    if (decoded.typ !== "refresh") throw new HttpError("Invalid refresh token", 401);
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user?.isActive) throw new HttpError("Unauthorized", 401);
    mustBeVerifiedForLogin(user);
    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    securityLog("auth_refresh", { req, userId: user.id });
    res.json({
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    });
  } catch (e) {
    if (e instanceof jwt.JsonWebTokenError) {
      return next(new HttpError("Invalid refresh token", 401));
    }
    next(e);
  }
});

router.post("/logout", (req, res) => {
  securityLog("auth_logout", { req });
  res.status(204).send();
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.isActive) throw new HttpError("Unauthorized", 401);
    let employeeId: string | undefined;
    if (user.role === UserRole.sfh) {
      const sfh = await prisma.stateFacilityHead.findUnique({
        where: { userId: user.id },
        select: { employeeCode: true },
      });
      employeeId = sfh?.employeeCode ?? undefined;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: !!user.emailVerifiedAt,
      ...(employeeId !== undefined ? { employeeId } : {}),
    });
  } catch (e) {
    next(e);
  }
});

/** SFH: queue a password reset for supervisor to fulfill (no email / self-service reset). */
router.post("/sfh/request-password-reset", sfhPasswordResetRequestLimiter, async (req, res, next) => {
  try {
    const body = z.object({ employeeId: z.string().min(2) }).parse(req.body);
    const code = normalizeSfhEmployeeCode(body.employeeId);
    securityLog("auth_sfh_password_reset_request", { req, employeeIdLen: code.length });

    const sfh = await prisma.stateFacilityHead.findUnique({
      where: { employeeCode: code },
      select: {
        user: { select: { id: true, isActive: true, role: true } },
      },
    });
    if (sfh?.user?.isActive && sfh.user.role === UserRole.sfh) {
      await prisma.sfhPasswordResetRequest.updateMany({
        where: { userId: sfh.user.id, status: "pending" },
        data: { status: "dismissed" },
      });
      await prisma.sfhPasswordResetRequest.create({
        data: { userId: sfh.user.id, status: "pending" },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
