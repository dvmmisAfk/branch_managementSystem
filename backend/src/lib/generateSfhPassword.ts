import crypto from "crypto";

/** URL-safe-ish mix of letters, digits, and symbols for SFH initial / reset passwords. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function generateSfhPassword(length = 14): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length] ?? "X";
  }
  return out;
}
