import type { Request } from "express";
import type { Store } from "express-rate-limit";
import { isIP } from "node:net";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { securityLog } from "../lib/securityLog.js";

// Populated by initRateLimitStore() during app startup (before any requests).
let _sharedStore: Store | undefined;

/**
 * Called once at startup (after the Redis client is ready).
 * If never called, all limiters fall back to in-memory MemoryStore.
 */
export function setRateLimitStore(store: Store | undefined): void {
  _sharedStore = store;
}

function storeOpt() {
  return _sharedStore ? { store: _sharedStore } : {};
}

/** Stable client key for express-rate-limit v8 (never undefined — undefined breaks the MemoryStore). */
function apiLimiterClientKey(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  const fromXff = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
  const candidates = [req.ip, fromXff, req.socket?.remoteAddress].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  for (const c of candidates) {
    if (isIP(c)) return ipKeyGenerator(c, 56);
  }
  return ipKeyGenerator("127.0.0.1", 56);
}

/** express-rate-limit v8 default keyGenerator yields `undefined` keys when `req.ip` is missing, which breaks the store (500). */
const rateLimitSafeClientKey = {
  validate: {
    ip: false,
    trustProxy: false,
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  keyGenerator: (req: Request) => apiLimiterClientKey(req),
} as const;

function keyLogin(req: Request): string {
  const ip = apiLimiterClientKey(req);
  const loginId =
    typeof req.body?.loginId === "string" ? req.body.loginId.toLowerCase().trim().slice(0, 255) : "";
  return `${ip}:${loginId}`;
}

export const loginLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyLogin,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "login", limit: options.limit });
    res.status(429).json({ error: "Too many login attempts. Try again later." });
  },
});

// 20 per 15-min per IP: covers multiple browser tabs silently refreshing,
// while blocking token-rotation abuse that the old limit of 60 allowed.
export const refreshLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "refresh", limit: options.limit });
    res.status(429).json({ error: "Too many requests. Try again later." });
  },
});

export const forgotPasswordLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "forgot_password", limit: options.limit });
    res.status(429).json({ error: "Too many requests. Try again later." });
  },
});

export const resetPasswordLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "reset_password", limit: options.limit });
    res.status(429).json({ error: "Too many requests. Try again later." });
  },
});

export const verifyEmailLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "verify_email", limit: options.limit });
    res.status(429).json({ error: "Too many requests. Try again later." });
  },
});

/** Supervisor-only account creation */
export const accountCreateLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "account_create", limit: options.limit });
    res.status(429).json({ error: "Too many account creation attempts." });
  },
});

/** Broad API protection (authenticated traffic) */
export function createApiLimiter() {
  return rateLimit({
    ...rateLimitSafeClientKey,
    ...storeOpt(),
    windowMs: 15 * 60 * 1000,
    max: 800,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      securityLog("rate_limit_exceeded", { req, limitType: "api_global", limit: options.limit });
      res.status(429).json({ error: "Too many requests. Try again later." });
    },
  });
}

// 5 attempts per hour per IP is generous for a legitimate forgot-password flow
// and strict enough to blunt enumeration / spam.
export const sfhPasswordResetRequestLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "sfh_password_reset_request", limit: options.limit });
    res.status(429).json({ error: "Too many requests. Try again in an hour." });
  },
});

/** Reserved for future LLM / AI endpoints */
export const aiGenerationLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  ...storeOpt(),
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    securityLog("rate_limit_exceeded", { req, limitType: "ai_generation", limit: options.limit });
    res.status(429).json({ error: "AI rate limit exceeded." });
  },
});
