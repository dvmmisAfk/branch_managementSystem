import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { securityLog } from "../lib/securityLog.js";

/** Skip enforcement for health checks (internal probes often use HTTP behind TLS termination). */
function isHealthPath(req: Request): boolean {
  return req.method === "GET" && (req.path === "/health" || req.originalUrl?.startsWith("/health"));
}

export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  if (isHealthPath(req)) {
    next();
    return;
  }
  const enforce =
    env.ENFORCE_HTTPS === "true" || (env.NODE_ENV === "production" && env.ENFORCE_HTTPS !== "false");
  if (!enforce) {
    next();
    return;
  }
  const xfProto = req.headers["x-forwarded-proto"];
  const firstProto = typeof xfProto === "string" ? xfProto.split(",")[0]?.trim().toLowerCase() : undefined;
  const secure = req.secure || firstProto === "https";
  if (secure) {
    next();
    return;
  }
  securityLog("https_blocked", { req, forwardedProto: firstProto ?? null });
  res.status(403).json({ error: "HTTPS is required for this resource." });
}
