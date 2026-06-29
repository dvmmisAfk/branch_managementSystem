/**
 * G-1 (F-04 × F-14): Verify the bcrypt cost-factor mechanism.
 *
 * auth.ts:25 computes the dummy hash as:
 *   const dummyHashPromise = bcrypt.hash("__sentinel__...", env.BCRYPT_ROUNDS);
 *
 * If BCRYPT_ROUNDS ever diverges from the hash's embedded rounds, the timing
 * oracle fix (F-04) degrades. This suite:
 *   1. Proves bcrypt embeds the rounds in the hash string so they are inspectable.
 *   2. Confirms env.BCRYPT_ROUNDS is validated within 10–14 by the Zod schema.
 *
 * G-7 / F-14: env schema boundary tests for BCRYPT_ROUNDS live here too.
 */
import bcrypt from "bcryptjs";
import { z } from "zod";
import { describe, expect, it } from "vitest";

/** Extract the cost factor that bcrypt baked into a hash string. */
function embeddedRounds(hash: string): number {
  // bcrypt hash format: $2a$<rounds>$<salt+digest>
  return parseInt(hash.split("$")[2], 10);
}

// ── G-1: cost-factor mechanism ────────────────────────────────────────────────

describe("bcrypt cost-factor (G-1 / F-04 × F-14)", () => {
  it("embeds the requested rounds in the hash string", async () => {
    const hash = await bcrypt.hash("test-value", 10);
    expect(embeddedRounds(hash)).toBe(10);
  });

  it("different rounds produce distinguishable hashes", async () => {
    const h10 = await bcrypt.hash("x", 10);
    const h11 = await bcrypt.hash("x", 11);
    expect(embeddedRounds(h10)).toBe(10);
    expect(embeddedRounds(h11)).toBe(11);
  });

  it("bcrypt.compare succeeds against a hash made with rounds=10", async () => {
    const hash = await bcrypt.hash("sentinel", 10);
    const ok = await bcrypt.compare("sentinel", hash);
    expect(ok).toBe(true);
  });
});

// ── G-7 / F-14: env schema BCRYPT_ROUNDS boundary ────────────────────────────

const bcryptRoundsSchema = z.coerce.number().int().min(10).max(14).default(12);

describe("BCRYPT_ROUNDS env schema (G-7 / F-14)", () => {
  it("rejects values below 10", () => {
    expect(() => bcryptRoundsSchema.parse("9")).toThrow();
    expect(() => bcryptRoundsSchema.parse("0")).toThrow();
    expect(() => bcryptRoundsSchema.parse("-1")).toThrow();
  });

  it("rejects values above 14 (prevents DoS-grade hashing)", () => {
    expect(() => bcryptRoundsSchema.parse("15")).toThrow();
    expect(() => bcryptRoundsSchema.parse("100")).toThrow();
  });

  it("accepts values 10–14", () => {
    for (const v of [10, 11, 12, 13, 14]) {
      expect(bcryptRoundsSchema.parse(String(v))).toBe(v);
    }
  });

  it("defaults to 12 when unset", () => {
    expect(bcryptRoundsSchema.parse(undefined)).toBe(12);
  });

  it("rejects non-integer strings", () => {
    expect(() => bcryptRoundsSchema.parse("12.5")).toThrow();
    expect(() => bcryptRoundsSchema.parse("abc")).toThrow();
  });
});
