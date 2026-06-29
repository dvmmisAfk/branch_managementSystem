/**
 * F-02 — AES-256-GCM vault unit tests.
 * Pure-function coverage: vaultEncryptCore / vaultDecryptCore.
 * env is mocked so the module can be imported without real env vars.
 */
import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    VAULT_SECRET: "test-vault-secret-must-be-32bytes!",
    JWT_SECRET: "test-jwt-secret-for-legacy-decrypt!",
    BCRYPT_ROUNDS: 12,
  },
}));

import { vaultDecryptCore, vaultEncryptCore } from "../lib/sfhSupervisorPasswordVault.js";

const SECRET = "test-vault-secret-must-be-32bytes!";
const LEGACY_SECRET = "test-jwt-secret-for-legacy-decrypt!";

describe("vaultEncryptCore / vaultDecryptCore — v2 format", () => {
  it("round-trips arbitrary plaintext", () => {
    const plain = "MyStr0ngP@ssword!";
    const blob = vaultEncryptCore(plain, SECRET);
    expect(vaultDecryptCore(blob, SECRET)).toBe(plain);
  });

  it("blobs start with v2: prefix", () => {
    const blob = vaultEncryptCore("hello", SECRET);
    expect(blob.startsWith("v2:")).toBe(true);
  });

  it("produces different ciphertext on each call (random per-record salt + IV)", () => {
    const plain = "same-plaintext";
    const a = vaultEncryptCore(plain, SECRET);
    const b = vaultEncryptCore(plain, SECRET);
    expect(a).not.toBe(b);
    // Both still decrypt to the same value
    expect(vaultDecryptCore(a, SECRET)).toBe(plain);
    expect(vaultDecryptCore(b, SECRET)).toBe(plain);
  });

  it("throws with wrong key", () => {
    const blob = vaultEncryptCore("secret", SECRET);
    expect(() => vaultDecryptCore(blob, "wrong-secret-key-32-bytes-padding!")).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const blob = vaultEncryptCore("value", SECRET);
    const raw = blob.slice("v2:".length);
    const buf = Buffer.from(raw, "base64url");
    buf[buf.length - 1] ^= 0xff;
    const tampered = "v2:" + buf.toString("base64url");
    expect(() => vaultDecryptCore(tampered, SECRET)).toThrow();
  });
});

describe("vaultDecryptCore — legacy format", () => {
  it("decrypts legacy blobs using the legacy secret when no v2 prefix", () => {
    // Build a legacy blob manually to test backward compat.
    // Legacy: base64url(iv[16] | tag[16] | ciphertext) with fixed salt "sfh-supervisor-pwd-vault-v1"
    const LEGACY_SCRYPT_SALT = Buffer.from("sfh-supervisor-pwd-vault-v1", "utf8");
    const key = crypto.scryptSync(LEGACY_SECRET, LEGACY_SCRYPT_SALT, 32);
    const iv = Buffer.alloc(16, 1);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update("legacy-plain", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const legacyBlob = Buffer.concat([iv, tag, enc]).toString("base64url");

    const decrypted = vaultDecryptCore(legacyBlob, SECRET, LEGACY_SECRET);
    expect(decrypted).toBe("legacy-plain");
  });

  it("throws when legacySecret is omitted for a legacy blob", () => {
    const legacyBlob = Buffer.alloc(40, 0x42).toString("base64url");
    expect(() => vaultDecryptCore(legacyBlob, SECRET)).toThrow(/legacySecret/i);
  });
});
