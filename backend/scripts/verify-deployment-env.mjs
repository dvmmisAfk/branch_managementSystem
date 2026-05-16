#!/usr/bin/env node
/**
 * Validates environment variables before production deploy (no secrets printed).
 * Usage (from backend folder): npm run deploy:verify-env
 * Loads backend/.env relative to this script.
 */
import dotenv from "dotenv";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const envPath = join(backendRoot, ".env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const errs = [];
const { NODE_ENV = "development" } = process.env;
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "";
const ALLOWED_ORIGIN_SUFFIXES = process.env.ALLOWED_ORIGIN_SUFFIXES ?? "";
const COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE ?? "";
const API_DEBUG = process.env.API_DEBUG;

if (!DATABASE_URL || DATABASE_URL.length < 12) errs.push("DATABASE_URL is missing or too short.");
if (JWT_SECRET.length < 32) errs.push("JWT_SECRET must be at least 32 characters.");
if (JWT_REFRESH_SECRET.length < 32) errs.push("JWT_REFRESH_SECRET must be at least 32 characters.");

if (NODE_ENV === "production") {
  const origins = ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0 && !ALLOWED_ORIGIN_SUFFIXES.trim()) {
    errs.push(
      "ALLOWED_ORIGINS and/or ALLOWED_ORIGIN_SUFFIXES is required in production (e.g. https://app.vercel.app and .vercel.app).",
    );
  }
  if (API_DEBUG === "true") errs.push("API_DEBUG must not be true in production.");
  if (COOKIE_SAME_SITE === "lax" && origins.length > 0) {
    console.warn(
      "[verify-deployment-env] WARN: COOKIE_SAME_SITE=lax with cross-host frontend (Vercel + Render) will break refresh cookies. Set COOKIE_SAME_SITE=none.",
    );
  }
}

if (errs.length) {
  console.error("[verify-deployment-env] FAILED:\n - " + errs.join("\n - "));
  process.exit(1);
}

console.log("[verify-deployment-env] OK (NODE_ENV=" + NODE_ENV + ").");
