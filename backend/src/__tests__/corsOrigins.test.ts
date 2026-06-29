/**
 * F-06 — CORS origin validation unit tests.
 * Pure-function coverage: isOriginAllowedWith.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    ALLOWED_ORIGINS: "",
    ALLOWED_ORIGIN_SUFFIXES: "",
    JWT_SECRET: "test-jwt",
    VAULT_SECRET: "test-vault-secret-must-be-32bytes!",
    BCRYPT_ROUNDS: 12,
  },
}));

import { isOriginAllowedWith } from "../lib/corsOrigins.js";

const EXACT = ["https://app.example.com", "https://other.example.com"];
const SUFFIXES = [".preview.example.com", ".vercel.app"];

describe("isOriginAllowedWith — exact match", () => {
  it("allows a listed exact origin", () => {
    expect(isOriginAllowedWith("https://app.example.com", EXACT, [])).toBe(true);
  });

  it("rejects an unlisted origin", () => {
    expect(isOriginAllowedWith("https://evil.com", EXACT, [])).toBe(false);
  });

  it("rejects an empty origin", () => {
    expect(isOriginAllowedWith("", EXACT, SUFFIXES)).toBe(false);
  });
});

describe("isOriginAllowedWith — suffix match", () => {
  it("allows a legitimate subdomain matching the suffix", () => {
    expect(isOriginAllowedWith("https://pr-123.preview.example.com", [], SUFFIXES)).toBe(true);
  });

  it("allows a vercel preview URL", () => {
    expect(isOriginAllowedWith("https://myapp-abc123.vercel.app", [], SUFFIXES)).toBe(true);
  });

  it("rejects HTTP (non-HTTPS) even with matching suffix", () => {
    expect(isOriginAllowedWith("http://pr-123.preview.example.com", [], SUFFIXES)).toBe(false);
  });

  it("rejects evil-boundary attack: evilvercel.app should NOT match .vercel.app", () => {
    expect(isOriginAllowedWith("https://evilvercel.app", [], [".vercel.app"])).toBe(false);
  });

  it("rejects unrelated domain that shares partial text with suffix", () => {
    expect(isOriginAllowedWith("https://notvercel.app", [], [".vercel.app"])).toBe(false);
  });

  it("exact match takes priority over suffix miss", () => {
    expect(isOriginAllowedWith("https://app.example.com", EXACT, [])).toBe(true);
  });
});

describe("isOriginAllowedWith — edge cases", () => {
  it("rejects when both lists are empty", () => {
    expect(isOriginAllowedWith("https://anything.com", [], [])).toBe(false);
  });

  it("handles suffix without leading dot correctly (normalises internally)", () => {
    // Suffix "vercel.app" (without dot) should still require a dot boundary
    expect(isOriginAllowedWith("https://myapp.vercel.app", [], ["vercel.app"])).toBe(true);
    expect(isOriginAllowedWith("https://evilvercel.app", [], ["vercel.app"])).toBe(false);
  });
});
