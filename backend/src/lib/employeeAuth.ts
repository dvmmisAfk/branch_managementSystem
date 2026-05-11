import { HttpError } from "../utils/HttpError.js";

/** Normalized employee login ID (uppercase, A–Z, 0–9, hyphen). */
export function normalizeSfhEmployeeCode(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (t.length < 2) {
    throw new HttpError("Employee ID must be at least 2 characters (letters, digits, hyphen).", 400);
  }
  if (t.length > 50) {
    throw new HttpError("Employee ID is too long.", 400);
  }
  return t;
}

/** Internal unique mailbox for Prisma `User.email` (SFH accounts sign in with employee ID, not this email). */
export function syntheticEmailFromEmployeeCode(codeUpper: string): string {
  const safe = codeUpper.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return `sfh.${safe}@sfh-login.internal`;
}
