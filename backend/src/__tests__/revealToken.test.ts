/**
 * F-03 — Reveal-token store unit tests.
 * Tests single-use enforcement and TTL expiry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRevealToken, redeemRevealToken } from "../lib/revealTokenStore.js";

describe("createRevealToken / redeemRevealToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redeems the token and returns the encrypted blob", () => {
    const blob = "encrypted-blob-abc";
    const token = createRevealToken(blob);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const result = redeemRevealToken(token);
    expect(result).toBe(blob);
  });

  it("is single-use — second redemption returns null", () => {
    const token = createRevealToken("blob-single-use");
    const first = redeemRevealToken(token);
    const second = redeemRevealToken(token);
    expect(first).toBe("blob-single-use");
    expect(second).toBeNull();
  });

  it("returns null for unknown tokens", () => {
    expect(redeemRevealToken("not-a-real-token")).toBeNull();
  });

  it("returns null after TTL has elapsed", () => {
    const token = createRevealToken("time-sensitive-blob");
    // Advance past the 2-minute TTL
    vi.advanceTimersByTime(2 * 60 * 1000 + 1);
    expect(redeemRevealToken(token)).toBeNull();
  });

  it("works within TTL window", () => {
    const token = createRevealToken("within-ttl");
    vi.advanceTimersByTime(2 * 60 * 1000 - 1);
    expect(redeemRevealToken(token)).toBe("within-ttl");
  });

  it("each token is independent", () => {
    const t1 = createRevealToken("blob-1");
    const t2 = createRevealToken("blob-2");
    expect(redeemRevealToken(t1)).toBe("blob-1");
    expect(redeemRevealToken(t2)).toBe("blob-2");
    // Both consumed
    expect(redeemRevealToken(t1)).toBeNull();
    expect(redeemRevealToken(t2)).toBeNull();
  });
});
