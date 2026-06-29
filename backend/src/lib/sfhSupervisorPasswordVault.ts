import crypto from "crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const SALT_LEN = 32;
const V2_PREFIX = "v2:";

// Legacy constants (read-only — never used for new writes).
const LEGACY_SCRYPT_SALT = Buffer.from("sfh-supervisor-pwd-vault-v1", "utf8");

// ── Core crypto (exported for unit tests — do not call from application code) ──

/**
 * Encrypt `plaintext` using AES-256-GCM with a randomly generated per-record
 * salt fed into scrypt alongside `vaultSecret`. Returns a v2-prefixed base64url blob.
 */
export function vaultEncryptCore(plaintext: string, vaultSecret: string): string {
  const recordSalt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(vaultSecret, recordSalt, 32);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([recordSalt, iv, tag, enc]);
  return V2_PREFIX + payload.toString("base64url");
}

/**
 * Decrypt a blob produced by `vaultEncryptCore` (v2 format) or the legacy
 * fixed-salt scheme (no prefix). Provide `legacySecret` to support reading old rows.
 */
export function vaultDecryptCore(blob: string, vaultSecret: string, legacySecret?: string): string {
  if (blob.startsWith(V2_PREFIX)) {
    // ── v2 format: v2:<base64url(salt[32] | iv[16] | tag[16] | ciphertext)> ──
    const raw = Buffer.from(blob.slice(V2_PREFIX.length), "base64url");
    const minLen = SALT_LEN + IV_LEN + AUTH_TAG_LEN + 1;
    if (raw.length < minLen) throw new Error("invalid_vault_blob_v2");
    const recordSalt = raw.subarray(0, SALT_LEN);
    const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
    const data = raw.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);
    const key = crypto.scryptSync(vaultSecret, recordSalt, 32);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  // ── Legacy format: base64url(iv[16] | tag[16] | ciphertext) ──
  if (!legacySecret) {
    throw new Error("Legacy vault blob requires legacySecret (JWT_SECRET) for decryption");
  }
  const raw = Buffer.from(blob, "base64url");
  if (raw.length < IV_LEN + AUTH_TAG_LEN + 1) throw new Error("invalid_vault_blob_legacy");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = raw.subarray(IV_LEN + AUTH_TAG_LEN);
  const key = crypto.scryptSync(legacySecret, LEGACY_SCRYPT_SALT, 32);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ── Public API (reads secrets from validated env) ────────────────────────────

/** Encrypt an SFH password for supervisor-side storage. Always produces a v2 blob. */
export function encryptSfhSupervisorPasswordVault(plaintext: string): string {
  return vaultEncryptCore(plaintext, env.VAULT_SECRET);
}

/**
 * Decrypt an SFH supervisor-password blob. Handles both legacy blobs (from
 * before VAULT_SECRET was introduced) and current v2 blobs.
 */
export function decryptSfhSupervisorPasswordVault(blob: string): string {
  return vaultDecryptCore(blob, env.VAULT_SECRET, env.JWT_SECRET);
}
