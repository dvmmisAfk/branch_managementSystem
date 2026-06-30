import type { Request } from "express";

export type SecurityEventType =
  | "auth_login_success"
  | "auth_login_failure"
  | "auth_refresh"
  | "auth_logout"
  | "auth_sfh_password_reset_request"
  | "auth_supervisor_sfh_password_set"
  | "auth_supervisor_sfh_password_view"
  | "rate_limit_exceeded"
  | "https_blocked"
  | "idor_blocked"
  | "api_error"
  | "suspicious_upload_rejected"
  | "branch_destroyed";

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

export function securityLog(
  type: SecurityEventType,
  fields: Record<string, unknown> & { req?: Request },
): void {
  const { req, ...rest } = fields;
  const base = {
    ts: new Date().toISOString(),
    type,
    ...rest,
    ...(req ?
      {
        ip: clientIp(req),
        path: req.path,
        method: req.method,
        ...(req.requestId ? { requestId: req.requestId } : {}),
      }
    : {}),
  };
  console.log(JSON.stringify(base));
}
