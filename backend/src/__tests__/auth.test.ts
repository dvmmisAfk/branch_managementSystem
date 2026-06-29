/**
 * F-01 — JWT algorithm restriction unit tests.
 * Verifies that tokens signed with alg:none or unexpected algorithms are rejected.
 */
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

const SECRET = "test-jwt-secret-for-auth-tests-x";

function verifyStrict(token: string): unknown {
  return jwt.verify(token, SECRET, { algorithms: ["HS256"] });
}

describe("JWT — algorithm restriction (HS256 only)", () => {
  it("accepts a valid HS256 token", () => {
    const token = jwt.sign({ sub: "user-1", role: "supervisor" }, SECRET, {
      algorithm: "HS256",
      expiresIn: "5m",
    });
    const payload = verifyStrict(token);
    expect((payload as { sub: string }).sub).toBe("user-1");
  });

  it("rejects an alg:none token with no signature", () => {
    // jsonwebtoken won't produce an alg:none token directly, so craft one manually.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "attacker", role: "supervisor" })).toString("base64url");
    const algNoneToken = `${header}.${body}.`;
    expect(() => verifyStrict(algNoneToken)).toThrow();
  });

  it("rejects an HS512-signed token when only HS256 is allowed", () => {
    const token = jwt.sign({ sub: "user-1" }, SECRET, { algorithm: "HS512" });
    expect(() => verifyStrict(token)).toThrow();
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const token = jwt.sign({ sub: "user-1", role: "sfh" }, SECRET, { algorithm: "HS256" });
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "user-1", role: "supervisor" })).toString("base64url");
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(() => verifyStrict(tampered)).toThrow();
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: "user-1" }, SECRET, { algorithm: "HS256", expiresIn: -1 });
    expect(() => verifyStrict(token)).toThrow(/expired/i);
  });
});
