import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { HttpError } from "../utils/HttpError.js";

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError("Unauthorized", 401, undefined, "AUTH_REQUIRED"));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError("Forbidden", 403, undefined, "AUTH_FORBIDDEN"));
    }
    next();
  };
}
