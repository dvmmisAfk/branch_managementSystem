#!/usr/bin/env node
/**
 * Minimal API smoke checks. Does not print tokens.
 *
 * Usage:
 *   SMOKE_ORIGIN=http://127.0.0.1:3001 SMOKE_API_BASE=http://127.0.0.1:3001/api/v1 node scripts/smoke-api.mjs
 * Optional login (supervisor email + password):
 *   SMOKE_LOGIN_EMAIL=... SMOKE_LOGIN_PASSWORD=... (same vars as above)
 */
const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3001";
const apiBase = process.env.SMOKE_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const email = process.env.SMOKE_LOGIN_EMAIL;
const password = process.env.SMOKE_LOGIN_PASSWORD;

async function main() {
  const health = await fetch(`${origin}/health`);
  if (!health.ok) throw new Error(`GET /health expected 2xx, got ${health.status}`);
  const hj = await health.json();
  if (!hj?.ok) throw new Error("GET /health body missing { ok: true }");

  if (email && password) {
    const login = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId: email, password }),
    });
    if (!login.ok) {
      const t = await login.text();
      throw new Error(`POST /auth/login failed ${login.status}: ${t.slice(0, 200)}`);
    }
    const body = await login.json();
    if (!body?.accessToken) throw new Error("POST /auth/login missing accessToken");
    const me = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    if (!me.ok) throw new Error(`GET /auth/me failed ${me.status}`);
  } else {
    console.log("[smoke-api] Skipping login (set SMOKE_LOGIN_EMAIL + SMOKE_LOGIN_PASSWORD to test auth).");
  }

  console.log("[smoke-api] OK");
}

main().catch((e) => {
  console.error("[smoke-api] FAILED:", e.message);
  process.exit(1);
});
