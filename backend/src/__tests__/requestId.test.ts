/**
 * F-10 — Request-ID sanitisation unit tests.
 * Tests that unsafe IDs (log injection characters) are rejected and replaced with a UUID.
 */
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { REQUEST_ID_HEADER, requestIdMiddleware } from "../middleware/requestId.js";

function makeReq(headerValue?: string): Partial<Request> {
  return {
    headers: headerValue !== undefined ? { [REQUEST_ID_HEADER]: headerValue } : {},
    requestId: undefined,
  };
}

function makeRes(): { headers: Record<string, string>; setHeader: (k: string, v: string) => void } {
  const headers: Record<string, string> = {};
  return { headers, setHeader: (k, v) => { headers[k] = v; } };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("requestIdMiddleware", () => {
  it("accepts a safe alphanumeric-and-hyphen ID", () => {
    const req = makeReq("abc-123_XYZ");
    const res = makeRes();
    const next: NextFunction = vi.fn();
    requestIdMiddleware(req as Request, res as unknown as Response, next);
    expect((req as Request).requestId).toBe("abc-123_XYZ");
    expect(res.headers[REQUEST_ID_HEADER]).toBe("abc-123_XYZ");
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an ID with a newline (log injection) and generates a UUID", () => {
    const req = makeReq("safe\nevil-injected-log-line");
    const res = makeRes();
    const next: NextFunction = vi.fn();
    requestIdMiddleware(req as Request, res as unknown as Response, next);
    expect((req as Request).requestId).toMatch(UUID_RE);
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
  });

  it("rejects an ID with special shell characters", () => {
    const req = makeReq("../../etc/passwd");
    const res = makeRes();
    const next: NextFunction = vi.fn();
    requestIdMiddleware(req as Request, res as unknown as Response, next);
    expect((req as Request).requestId).toMatch(UUID_RE);
  });

  it("rejects an ID that exceeds 64 characters", () => {
    const req = makeReq("a".repeat(65));
    const res = makeRes();
    const next: NextFunction = vi.fn();
    requestIdMiddleware(req as Request, res as unknown as Response, next);
    expect((req as Request).requestId).toMatch(UUID_RE);
  });

  it("generates a UUID when no x-request-id header is present", () => {
    const req = makeReq();
    const res = makeRes();
    const next: NextFunction = vi.fn();
    requestIdMiddleware(req as Request, res as unknown as Response, next);
    expect((req as Request).requestId).toMatch(UUID_RE);
  });

  it("always calls next()", () => {
    const next: NextFunction = vi.fn();
    requestIdMiddleware(makeReq("id-ok") as Request, makeRes() as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
