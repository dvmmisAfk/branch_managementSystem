import { env } from "../config/env.js";

/** Exact origins from ALLOWED_ORIGINS (comma-separated). */
export function getAllowedOriginList(): string[] {
  return (
    env.ALLOWED_ORIGINS?.split(",")
      .map((s) => normalizeOrigin(s))
      .filter(Boolean) ?? []
  );
}

/** Strip trailing slash so https://app.example.com/ matches browser Origin headers. */
function normalizeOrigin(value: string): string {
  const s = value.trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/** Optional suffixes, e.g. `.vercel.app` for preview deployments (credentials-safe pattern match). */
export function getAllowedOriginSuffixes(): string[] {
  const raw = env.ALLOWED_ORIGIN_SUFFIXES ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Pure origin check against explicit lists — testable without env dependency.
 *
 * F-06: The suffix match is HTTPS-only and requires a literal dot boundary before
 * the suffix (e.g. `.vercel.app` does not match `evilvercel.app`). Callers are
 * responsible for ensuring suffixes are as narrow as the deployment requires;
 * bare public-registrable suffixes like `.vercel.app` remain risky even with this
 * boundary check (see SECURITY_AUDIT.md F-06).
 */
export function isOriginAllowedWith(
  origin: string,
  exactList: string[],
  suffixes: string[],
): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (exactList.includes(o)) return true;
  const lower = o.toLowerCase();
  // Suffix matching is restricted to HTTPS origins only.
  if (!lower.startsWith("https://")) return false;
  for (const suffix of suffixes) {
    // Normalise suffix to start with a dot so we require a dot boundary.
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

/** Application-level wrapper that reads from validated env. */
export function isOriginAllowed(origin: string): boolean {
  return isOriginAllowedWith(origin, getAllowedOriginList(), getAllowedOriginSuffixes());
}
