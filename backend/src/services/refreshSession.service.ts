import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/HttpError.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function parseRefreshExpiry(): Date {
  const raw = process.env.JWT_REFRESH_EXPIRY ?? "7d";
  const m = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!m) return new Date(Date.now() + REFRESH_TTL_MS);
  const n = parseInt(m[1]!, 10);
  const unit = m[2];
  const mult =
    unit === "s" ? 1000
    : unit === "m" ? 60_000
    : unit === "h" ? 3_600_000
    : 86_400_000;
  return new Date(Date.now() + n * mult);
}

export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Create a new refresh session family (login). */
export async function createRefreshSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateOpaqueRefreshToken();
  const familyId = crypto.randomUUID();
  const expiresAt = parseRefreshExpiry();
  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      familyId,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/** Rotate refresh token; revokes old session. Detects reuse of revoked tokens. */
export async function rotateRefreshSession(rawToken: string): Promise<{
  userId: string;
  token: string;
  expiresAt: Date;
}> {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
  if (!session) throw new HttpError("Invalid refresh token", 401, undefined, "AUTH_INVALID_REFRESH");

  if (session.revokedAt) {
    await prisma.refreshSession.updateMany({
      where: { familyId: session.familyId },
      data: { revokedAt: new Date() },
    });
    throw new HttpError("Refresh token reuse detected", 401, undefined, "AUTH_REFRESH_REUSE");
  }

  if (session.expiresAt < new Date()) {
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new HttpError("Refresh token expired", 401, undefined, "AUTH_REFRESH_EXPIRED");
  }

  const newToken = generateOpaqueRefreshToken();
  const expiresAt = parseRefreshExpiry();

  await prisma.$transaction([
    prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshSession.create({
      data: {
        userId: session.userId,
        tokenHash: hashToken(newToken),
        familyId: session.familyId,
        expiresAt,
      },
    }),
  ]);

  return { userId: session.userId, token: newToken, expiresAt };
}

export async function revokeRefreshSession(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshSessions(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
