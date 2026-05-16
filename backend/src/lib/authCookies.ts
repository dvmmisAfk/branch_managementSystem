import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

function cookieSameSite(): "lax" | "none" | "strict" {
  if (env.COOKIE_SAME_SITE) return env.COOKIE_SAME_SITE;
  return env.NODE_ENV === "production" ? "none" : "lax";
}

function baseCookieOpts(maxAgeMs: number): CookieOptions {
  const sameSite = cookieSameSite();
  const secure = env.NODE_ENV === "production" || sameSite === "none";
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: maxAgeMs,
  };
}

function clearCookieOpts(): CookieOptions {
  const sameSite = cookieSameSite();
  const secure = env.NODE_ENV === "production" || sameSite === "none";
  return { httpOnly: true, secure, sameSite, path: "/" };
}

function accessMaxAgeMs(): number {
  const raw = env.JWT_EXPIRY ?? "15m";
  const m = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!m) return 15 * 60 * 1000;
  const n = parseInt(m[1]!, 10);
  const unit = m[2];
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60_000;
  if (unit === "h") return n * 3_600_000;
  return n * 86_400_000;
}

function refreshMaxAgeMs(): number {
  const raw = env.JWT_REFRESH_EXPIRY ?? "7d";
  const m = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1]!, 10);
  const unit = m[2];
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60_000;
  if (unit === "h") return n * 3_600_000;
  return n * 86_400_000;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, baseCookieOpts(accessMaxAgeMs()));
  res.cookie(REFRESH_COOKIE, refreshToken, baseCookieOpts(refreshMaxAgeMs()));
}

export function clearAuthCookies(res: Response): void {
  const opts = clearCookieOpts();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}

export function readAccessTokenCookie(cookies: Record<string, string | undefined>): string | undefined {
  const v = cookies[ACCESS_COOKIE];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function readRefreshTokenCookie(cookies: Record<string, string | undefined>): string | undefined {
  const v = cookies[REFRESH_COOKIE];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
