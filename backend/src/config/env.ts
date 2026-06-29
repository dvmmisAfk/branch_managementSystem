import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    /** Separate secret used exclusively for the SFH supervisor-password vault (AES-256-GCM key derivation). Must differ from JWT_SECRET. */
    VAULT_SECRET: z.string().min(32),
    JWT_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Comma-separated browser origins allowed for CORS (e.g. https://app.vercel.app). Empty = reflect request origin (dev-friendly; avoid in production). */
    ALLOWED_ORIGINS: z.string().optional(),
    /** Optional comma-separated host suffixes for CORS (e.g. `.vercel.app` for preview URLs). HTTPS only. */
    ALLOWED_ORIGIN_SUFFIXES: z.string().optional(),
    /** Cookie SameSite: `lax` (same-site / Docker nginx) or `none` (cross-site, e.g. Vercel + Render). */
    COOKIE_SAME_SITE: z.enum(["lax", "none", "strict"]).optional(),
    /** Base URL of the web app (for password-reset / verification links). Server-only. */
    APP_PUBLIC_URL: z.string().url().optional(),
    /** When `true`, reject login if `emailVerifiedAt` is null (except migration path). */
    REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).optional(),
    /** When `true` (default in production), reject requests where `X-Forwarded-Proto` is not `https`. */
    ENFORCE_HTTPS: z.enum(["true", "false"]).optional(),
    /**
     * When `true`: HTTP request/response timing logs, Prisma query logs, and stack traces on 5xx JSON responses.
     * Turn off before public production deploy (can leak internals).
     */
    API_DEBUG: z.enum(["true", "false"]).optional(),
    /** Optional Redis URL for distributed rate-limit state (e.g. redis://localhost:6379). Falls back to in-memory (per-process) when unset. */
    REDIS_URL: z.string().url().optional(),
    /** bcrypt cost factor for password hashing (10–14, default 12). Higher = slower hash = more brute-force resistance. */
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV !== "production") return;
    const origins =
      val.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    const suffixes =
      val.ALLOWED_ORIGIN_SUFFIXES?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    if (origins.length === 0 && suffixes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "In production set ALLOWED_ORIGINS (exact URLs) and/or ALLOWED_ORIGIN_SUFFIXES (e.g. .vercel.app).",
        path: ["ALLOWED_ORIGINS"],
      });
    }
    if (val.API_DEBUG === "true") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "API_DEBUG must not be true in production (can leak stacks and sensitive diagnostics in JSON responses).",
        path: ["API_DEBUG"],
      });
    }
    if (val.JWT_SECRET === val.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JWT_SECRET and JWT_REFRESH_SECRET must be different — each secret must be unique to its purpose.",
        path: ["JWT_REFRESH_SECRET"],
      });
    }
    if (val.VAULT_SECRET === val.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "VAULT_SECRET must differ from JWT_SECRET — they serve different cryptographic purposes.",
        path: ["VAULT_SECRET"],
      });
    }
    if (val.VAULT_SECRET === val.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "VAULT_SECRET must differ from JWT_REFRESH_SECRET — they serve different cryptographic purposes.",
        path: ["VAULT_SECRET"],
      });
    }
  });

export const env = envSchema.parse(process.env);

/** Verbose API diagnostics (see `API_DEBUG` in `.env`). */
export const apiDebug = env.API_DEBUG === "true";
