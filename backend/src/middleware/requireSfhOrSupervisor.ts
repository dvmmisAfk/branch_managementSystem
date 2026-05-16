import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { HttpError } from "../utils/HttpError.js";

/** Rejects branch_staff and unauthenticated users at middleware level. */
export function requireSfhOrSupervisor(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError("Unauthorized", 401, undefined, "AUTH_REQUIRED"));
  if (req.user.role !== UserRole.sfh && req.user.role !== UserRole.supervisor) {
    return next(new HttpError("Forbidden", 403, undefined, "AUTH_FORBIDDEN"));
  }
  next();
}
