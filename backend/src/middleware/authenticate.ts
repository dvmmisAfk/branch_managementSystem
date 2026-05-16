import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env.js";
import { readAccessTokenCookie } from "../lib/authCookies.js";
import { HttpError } from "../utils/HttpError.js";

const jwtUserSchema = z.object({
  sub: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
});

type JwtUser = z.infer<typeof jwtUserSchema>;

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return readAccessTokenCookie(req.cookies as Record<string, string | undefined>);
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(new HttpError("Unauthorized", 401, undefined, "AUTH_REQUIRED"));
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtUser;
    const parsed = jwtUserSchema.safeParse(payload);
    if (!parsed.success) {
      return next(new HttpError("Invalid token payload", 401, undefined, "AUTH_INVALID_TOKEN"));
    }
    const p = parsed.data;
    req.user = { id: p.sub, role: p.role, email: p.email, name: p.name };
    return next();
  } catch {
    return next(new HttpError("Invalid or expired token", 401, undefined, "AUTH_INVALID_TOKEN"));
  }
}
