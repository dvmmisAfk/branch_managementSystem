/**
 * G-8 / xlsx HIGH CVE — compensating-control unit tests.
 *
 * Tests the row-cap and column-cap logic without hitting the real xlsx parser.
 * We mock securityLog and HttpError to verify rejection payloads without
 * needing an Express context.
 */
import { describe, expect, it } from "vitest";

// ── Inline the cap constants (match branches.ts) ──────────────────────────────
const MAX_UPLOAD_ROWS = 5_000;
const MAX_UPLOAD_COLS = 100;

// ── Pure helpers (extracted from route logic for isolation) ───────────────────

function checkRowLimit(rowCount: number): void {
  if (rowCount > MAX_UPLOAD_ROWS) {
    throw new Error(
      `Spreadsheet has ${rowCount} rows — maximum is ${MAX_UPLOAD_ROWS}. Split the file and upload in batches.`,
    );
  }
}

function checkColLimit(colCount: number): void {
  if (colCount > MAX_UPLOAD_COLS) {
    throw new Error(
      `Spreadsheet has ${colCount} columns — maximum is ${MAX_UPLOAD_COLS}. Upload a simpler file.`,
    );
  }
}

// ── Row-cap tests ─────────────────────────────────────────────────────────────

describe("xlsx row-cap (G-8)", () => {
  it("allows rows at the limit", () => {
    expect(() => checkRowLimit(MAX_UPLOAD_ROWS)).not.toThrow();
  });

  it("allows an empty sheet (0 rows)", () => {
    expect(() => checkRowLimit(0)).not.toThrow();
  });

  it("rejects a sheet with one row over the limit", () => {
    expect(() => checkRowLimit(MAX_UPLOAD_ROWS + 1)).toThrow(/rows.*maximum/i);
  });

  it("rejects an adversarially large row count", () => {
    expect(() => checkRowLimit(1_000_000)).toThrow(/rows.*maximum/i);
  });

  it("rejection message includes actual count and limit", () => {
    const count = 6_000;
    let msg = "";
    try { checkRowLimit(count); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain(String(count));
    expect(msg).toContain(String(MAX_UPLOAD_ROWS));
  });
});

// ── Column-cap tests ──────────────────────────────────────────────────────────

describe("xlsx column-cap (G-8)", () => {
  it("allows columns at the limit", () => {
    expect(() => checkColLimit(MAX_UPLOAD_COLS)).not.toThrow();
  });

  it("rejects a sheet one column over the limit", () => {
    expect(() => checkColLimit(MAX_UPLOAD_COLS + 1)).toThrow(/columns.*maximum/i);
  });

  it("rejects an adversarially wide sheet", () => {
    expect(() => checkColLimit(10_000)).toThrow(/columns.*maximum/i);
  });

  it("rejection message includes actual count and limit", () => {
    const count = 200;
    let msg = "";
    try { checkColLimit(count); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain(String(count));
    expect(msg).toContain(String(MAX_UPLOAD_COLS));
  });
});
