import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Comma-separated browser origins allowed for CORS (e.g. https://app.vercel.app). Empty = reflect request origin (dev-friendly; avoid in production). */
    ALLOWED_ORIGINS: z.string().optional(),
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
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV !== "production") return;
    const origins =
      val.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    if (origins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ALLOWED_ORIGINS is required in production: set a comma-separated list of exact browser origins (e.g. https://app.example.com). Empty origins enable reflective CORS and are unsafe.",
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
  });

export const env = envSchema.parse(process.env);

/** Verbose API diagnostics (see `API_DEBUG` in `.env`). */
export const apiDebug = env.API_DEBUG === "true";
