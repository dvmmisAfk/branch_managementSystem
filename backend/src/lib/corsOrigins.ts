import { env } from "../config/env.js";

/** Exact origins from ALLOWED_ORIGINS (comma-separated). */
export function getAllowedOriginList(): string[] {
  return env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}

/** Optional suffixes, e.g. `.vercel.app` for preview deployments (credentials-safe pattern match). */
export function getAllowedOriginSuffixes(): string[] {
  const raw = env.ALLOWED_ORIGIN_SUFFIXES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string): boolean {
  const o = origin.trim();
  if (!o) return false;
  const exact = getAllowedOriginList();
  if (exact.includes(o)) return true;
  const lower = o.toLowerCase();
  if (!lower.startsWith("https://")) return false;
  for (const suffix of getAllowedOriginSuffixes()) {
    const s = suffix.startsWith(".") ? suffix : `.${suffix}`;
    try {
      const host = new URL(lower).hostname;
      if (host === s.slice(1) || host.endsWith(s)) return true;
    } catch {
      /* ignore malformed origin */
    }
  }
  return false;
}
