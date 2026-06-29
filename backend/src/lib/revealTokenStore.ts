import crypto from "node:crypto";

const TTL_MS = 2 * 60 * 1000; // 2 minutes

interface RevealEntry {
  encryptedBlob: string;
  expiresAt: number;
  used: boolean;
}

const store = new Map<string, RevealEntry>();

function tokenHash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/**
 * Store an encrypted password blob and return a short-lived opaque token.
 * The token is valid for 2 minutes and can only be redeemed once.
 */
export function createRevealToken(encryptedBlob: string): string {
  purgeExpired();
  const raw = crypto.randomBytes(24).toString("base64url");
  store.set(tokenHash(raw), {
    encryptedBlob,
    expiresAt: Date.now() + TTL_MS,
    used: false,
  });
  return raw;
}

/**
 * Redeem a reveal token. Returns the encrypted blob on success and marks the
 * token as used. Returns null if the token is unknown, expired, or already used.
 */
export function redeemRevealToken(raw: string): string | null {
  purgeExpired();
  const hash = tokenHash(raw);
  const entry = store.get(hash);
  if (!entry || entry.used || entry.expiresAt <= Date.now()) return null;
  entry.used = true;
  return entry.encryptedBlob;
}
