import crypto from "crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
/** Fixed salt for scrypt; changing breaks decryption of existing rows. */
const SCRYPT_SALT = Buffer.from("sfh-supervisor-pwd-vault-v1", "utf8");

function vaultKey(): Buffer {
  return crypto.scryptSync(env.JWT_SECRET, SCRYPT_SALT, 32);
}

/** AES-256-GCM ciphertext as base64url (iv + tag + data). */
export function encryptSfhSupervisorPasswordVault(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSfhSupervisorPasswordVault(blob: string): string {
  const raw = Buffer.from(blob, "base64url");
  if (raw.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error("invalid_vault_blob");
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = raw.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, vaultKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
