# Security Fixes — Branch Visit Tracker

Remediation log for all 15 findings from `SECURITY_AUDIT.md`.  
Implementation order: Tier 1 → Tier 2 → Tier 3 (severity / blast-radius first).  
Gap closure pass (G-1…G-8) completed 2026-06-29.

---

## Status Table

| Finding | Title | Status | Verification |
|---------|-------|--------|--------------|
| F-01 | JWT algorithm not pinned | **Fixed** | All `jwt.verify` / `jwt.sign` call sites inventoried (see F-01 detail below); unit tests in `auth.test.ts` |
| F-02 | Vault key reuse (JWT_SECRET = VAULT_SECRET) | **Fixed** | Unit tests `vault.test.ts`; re-encryption migration script shipped (G-3) |
| F-03 | Plaintext passwords in response bodies | **Fixed** | `revealToken` flow; unit test `revealToken.test.ts` |
| F-04 | Username-enumeration via bcrypt timing | **Fixed** | Dummy-hash uses `env.BCRYPT_ROUNDS` (confirmed auth.ts:25); cost-factor test in `bcryptRounds.test.ts` (G-1) |
| F-05 | Rate-limit counters reset on restart | **Fixed** | `createRateLimitStore()` wires Redis when `REDIS_URL` is set; graceful MemoryStore fallback |
| F-06 | CORS suffix too broad (`.vercel.app`) | **Fixed** | Dot-boundary suffix check; unit tests `corsOrigins.test.ts`; runtime config change pending first deploy |
| F-07 | Docker Compose secrets default to empty | **Fixed** | All secrets use `${VAR:?error message}` — compose fails fast if unset |
| F-08 | Missing security response headers on nginx | **Fixed** | `frontend/nginx.conf`: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP |
| F-09 | Branch facility updates not audit-logged | **Fixed** | `visits.ts:517–523`; structural unit test in `validation.test.ts` (G-7) |
| F-10 | `x-request-id` echo without sanitisation | **Fixed** | Allow-list regex; unit tests `requestId.test.ts` |
| F-11 | Container runs as root | **Fixed — see G-5** | `USER node` in Dockerfile; `--no-sandbox` rationale documented below; PDF end-to-end pending runtime verification (RT-08) |
| F-12 | Refresh token in JSON response body | **Fixed — see G-6** | `authJsonTokens()` returns only `{ accessToken }`; grep of scripts/tooling confirmed zero body usages |
| F-13 | Date fields not validated (free-form string) | **Fixed** | `dateStringSchema` regex in `visits.ts`; unit tests in `validation.test.ts` (G-7) |
| F-14 | bcrypt cost factor unconfigured | **Fixed** | Zod-validated `BCRYPT_ROUNDS` in `env.ts`; boundary tests in `bcryptRounds.test.ts` (G-7) |
| F-15 | Dead Supabase dependency | **Fixed** | Package removed; 0 frontend vulnerabilities |

---

## F-01 Detail — Complete `jwt.verify` / `jwt.sign` Call-Site Inventory

Grepped all `.ts` files in `backend/src/` for `jwt.verify(` and `jwt.sign(`. Every production call site is listed below. Test files are excluded.

| File | Line | Call | Algorithm pinned? |
|------|------|------|-------------------|
| `backend/src/middleware/authenticate.ts` | 31 | `jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] })` | ✅ `["HS256"]` |
| `backend/src/routes/auth.ts` | 42 | `jwt.sign({...}, env.JWT_SECRET, accessOpts)` where `accessOpts = { expiresIn: env.JWT_EXPIRY, algorithm: "HS256" }` | ✅ `"HS256"` |

No other `jwt.verify` or `jwt.sign` calls exist in the backend source (services, libraries, or other routes). `refreshSession.service.ts` uses opaque random tokens (not JWTs) for the refresh session — no JWT calls there.

This inventory should be re-verified with `grep -rn "jwt\.verify\|jwt\.sign" backend/src --include="*.ts"` before any future JWT library upgrades.

---

## G-5 Detail — Puppeteer `--no-sandbox` Rationale

`pdfGeneration.service.ts:416` launches Chromium with:
```
args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"]
```

**Why `--no-sandbox` is required:** Alpine Linux containers (and most minimal container environments) do not provide the kernel capabilities required by Chromium's setuid sandbox (`CAP_SYS_ADMIN`). Without `--no-sandbox`, Chromium fails to launch entirely. This is the standard, documented configuration for containerised Puppeteer use.

**What compensates for the missing sandbox:**
1. **Non-root user** (F-11): The process runs as `node` (UID 1000), not root. A Chromium escape lands in a low-privilege user context rather than as root inside the container.
2. **HTML escaping**: All user-controlled fields (`escapeHtml()` called throughout `pdfGeneration.service.ts`) prevent script injection into the Puppeteer-rendered HTML, so the attack surface for Chromium exploitation via the PDF template is minimal.
3. **No inbound internet traffic to Chromium**: The browser instance is entirely internal (no `page.goto()` to untrusted URLs); it only renders a server-constructed HTML string.

**Temp directory:** `/tmp` is chown'd to `node:node` in the Dockerfile. Chromium's default `--user-data-dir` writes to `/tmp/...` — this is writable post `USER node`. `PUPPETEER_CACHE_DIR` is not relevant since `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` uses the system Chromium binary.

**Verification (runtime-only, RT-08):**
1. `docker exec <container> whoami` → must return `node`
2. `docker exec <container> ls -la /tmp` → owned by `node`
3. Call `GET /visits/:id/pdf` on a real visit → confirm HTTP 200 and valid PDF Content-Type

---

## G-6 Detail — `refreshToken` in Tooling / Scripts

Grep of `backend/scripts/`, all `*.{sh,py,json,postman,mjs}` files, and all `*.{ts,tsx}` test files for `refreshToken`:

- **`backend/scripts/smoke-api.mjs`**: no `refreshToken` match
- **`backend/scripts/docker-entrypoint.sh`**: no match
- **`backend/scripts/verify-deployment-env.mjs`**: no match
- **`backend/scripts/extract-branches-from-rtf.mjs`**: no match
- **All `.md` and `.yaml` files**: references are documentation only (SECURITY_AUDIT.md, README.md)

The only `refreshToken` occurrences in backend TypeScript are:
- `auth.ts:147` — input schema `{ refreshToken?: string }` on `POST /refresh`. This is an **input path**: non-browser clients may supply the refresh token in the request body rather than a cookie. This is not the same as returning it in a response body, and is intentional behaviour.
- `auth.ts:131,155` — internal variable names, not response fields.

**Conclusion:** Zero tooling, script, or test files read `refreshToken` from a response body. No updates required.

---

## Runtime-Verification Items

| Item | Related Finding / Gap | Verification Step | Status |
|------|-----------------------|-------------------|--------|
| RT-01 | F-01 | Deploy; confirm JWT uses HS256; replay alg:none token and confirm 401 | Pending |
| RT-02 | F-02 | Deploy with `VAULT_SECRET ≠ JWT_SECRET`; create SFH, retrieve password; verify legacy rows readable until migrated | Pending |
| RT-03 | F-03 | `POST /sfhs` → confirm `revealToken` in body (not plaintext); call reveal once (200), again (404) | Pending |
| RT-04 | F-05 | Set `REDIS_URL`; check startup log; restart container; confirm counters persist | Pending |
| RT-05 | F-06 | Set exact `ALLOWED_ORIGINS`; remove suffix; confirm correct cross-origin behaviour | Pending |
| RT-06 | F-07 | Deploy compose without `JWT_SECRET`; confirm immediate error | Pending |
| RT-07 | F-08 | Load production nginx URL; confirm all 5 security headers present | Pending |
| RT-08 | F-11 / G-5 | `docker exec whoami` → `node`; `GET /visits/:id/pdf` → 200 + valid PDF; confirm Chromium launched as `node` | Pending |
| RT-09 | F-12 / G-6 | Login in browser; confirm no `refreshToken` in JSON body; `refresh_token` cookie is `HttpOnly; SameSite=None; Secure` | Pending |
| RT-10 | G-3 | After first production deploy: run `npx tsx backend/scripts/reencrypt-sfh-vault.ts --dry-run`, review output, then run without `--dry-run`; verify all rows become v2 format | Pending |

---

## Deferred Items

| Package | Severity | Advisory | Reason deferred | Mitigation in place |
|---------|----------|----------|-----------------|---------------------|
| `xlsx *` | **High** | GHSA-4r6h-8v6p-xvw6 (Prototype Pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS) | No upstream fix available | 10 MB Multer file-size cap; 5,000-row cap; 100-column cap; `suspicious_upload_rejected` security log event; supervisor-only upload (authenticated); worker-thread isolation tracked as follow-up |
| `exceljs ≥3.5.0` / `uuid` | Moderate | GHSA-w5hq-g745-h8pq | Fix requires breaking downgrade to `exceljs@3.4.0` | Track upstream; exceljs is used for PDF/Excel export, not user-uploaded parsing |
| `esbuild` | Low | Dev-only vulnerability in Vite/Vitest dev server file read | Backend devDependency only; not in production runtime image (omitted by `npm ci --omit=dev` in Dockerfile) | No action required; monitor for upstream patch |
| F-06 (config) | — | `ALLOWED_ORIGIN_SUFFIXES=.vercel.app` in render.yaml | Production URL not yet known; bootstrap value | Replace with exact origin after first deploy |

**`npm audit` summary as of 2026-06-29:**
- **Backend:** `4 vulnerabilities (1 low, 2 moderate, 1 high)` — all deferred per table above
- **Frontend:** `0 vulnerabilities`

---

## Deferred Items — Legacy Vault Format

The legacy vault format (no `v2:` prefix) can be decrypted using `JWT_SECRET` as the scrypt password. This legacy decrypt path (`vaultDecryptCore` in `sfhSupervisorPasswordVault.ts`) should be removed once all rows are migrated.

**Migration script:** `backend/scripts/reencrypt-sfh-vault.ts`  
**Dry-run:** `npx tsx backend/scripts/reencrypt-sfh-vault.ts --dry-run`  
**Apply:** `npx tsx backend/scripts/reencrypt-sfh-vault.ts`  
**On Render:** run as a one-off job with the same `DATABASE_URL`, `VAULT_SECRET`, and `JWT_SECRET` env vars as the API service.

**Planned removal of legacy-format decrypt:** Once the script has been applied and all rows report `Already v2 format`, remove the `legacySecret` parameter and legacy branch from `vaultDecryptCore`.

---

## Follow-up Items

Issues discovered while closing gaps G-1…G-8 that are out of scope to fix immediately:

| # | Description | Severity | Recommended Action |
|---|-------------|----------|--------------------|
| FU-01 | `xlsx.read()` is synchronous — a ReDoS payload blocks the Node.js event loop until the parse completes or times out. The row/col caps (G-8) reduce the maximum parse size but do not prevent a hang for adversarial files within the cap. | Medium | Move `XLSX.read()` into a `worker_threads` worker so a hang does not affect the main request-handling process. The worker can be killed after a configurable timeout. |
| FU-02 | `dateStringSchema` (F-13) validates format (`YYYY-MM-DD`) but not calendar semantics (month 13, day 45 pass the regex). Prisma will reject resulting invalid dates with a 500, not a 400. | Low | Add `.refine(s => !isNaN(Date.parse(s)), "Invalid calendar date")` to the schema to return a proper 422. |
| FU-03 | After running `reencrypt-sfh-vault.ts` and confirming all rows are v2, remove the `legacySecret` parameter from `vaultDecryptCore` and delete the legacy decrypt branch to harden the code against future JWT_SECRET leaks. | Low | Remove post-migration confirmation. |

---

## Files Changed

| File | Findings / Gaps Addressed |
|------|--------------------------|
| `backend/src/config/env.ts` | F-02 (`VAULT_SECRET`), F-05 (`REDIS_URL`), F-14 (`BCRYPT_ROUNDS`) |
| `backend/src/lib/sfhSupervisorPasswordVault.ts` | F-02 (per-record salt, `VAULT_SECRET`, legacy compat) |
| `backend/src/lib/revealTokenStore.ts` _(new)_ | F-03 |
| `backend/src/lib/rateLimitStore.ts` _(new)_ | F-05 |
| `backend/src/lib/corsOrigins.ts` | F-06 |
| `backend/src/lib/securityLog.ts` | G-8 (`suspicious_upload_rejected` event type) |
| `backend/src/middleware/rateLimits.ts` | F-05 |
| `backend/src/middleware/requestId.ts` | F-10 |
| `backend/src/middleware/authenticate.ts` | F-01 |
| `backend/src/routes/auth.ts` | F-01, F-04, F-12 |
| `backend/src/routes/sfhs.ts` | F-02, F-03, F-14 |
| `backend/src/routes/visits.ts` | F-09, F-13 |
| `backend/src/routes/branches.ts` | G-8 (row/col cap, security log) |
| `backend/src/app.ts` | F-05 |
| `backend/Dockerfile` | F-11 |
| `backend/.env.example` | F-02, F-05, F-14 |
| `backend/vitest.config.ts` _(new)_ | Test infrastructure |
| `backend/scripts/reencrypt-sfh-vault.ts` _(new)_ | G-3 / F-02 migration |
| `backend/src/__tests__/vault.test.ts` _(new)_ | F-02 |
| `backend/src/__tests__/revealToken.test.ts` _(new)_ | F-03 |
| `backend/src/__tests__/corsOrigins.test.ts` _(new)_ | F-06 |
| `backend/src/__tests__/requestId.test.ts` _(new)_ | F-10 |
| `backend/src/__tests__/auth.test.ts` _(new)_ | F-01 |
| `backend/src/__tests__/bcryptRounds.test.ts` _(new)_ | G-1 (cost-factor), G-7/F-14 (env bounds) |
| `backend/src/__tests__/validation.test.ts` _(new)_ | G-7/F-13 (date schema), G-7/F-09 (audit log) |
| `backend/src/__tests__/xlsxLimits.test.ts` _(new)_ | G-8 (row/col cap) |
| `frontend/nginx.conf` | F-08 |
| `frontend/src/pages/SfhManagementPage.tsx` | F-03 |
| `frontend/src/lib/supabaseBrowser.ts` _(deleted)_ | F-15 |
| `docker-compose.yml` | F-07 |
| `render.yaml` | F-02, F-06 |
| `frontend/package.json` | F-15 |

---

## Test Results

### After original remediation pass (35 tests):
```
 ✓ src/__tests__/revealToken.test.ts   (6 tests)
 ✓ src/__tests__/requestId.test.ts     (6 tests)
 ✓ src/__tests__/corsOrigins.test.ts  (11 tests)
 ✓ src/__tests__/auth.test.ts          (5 tests)
 ✓ src/__tests__/vault.test.ts         (7 tests)
Test Files  5 passed (5) | Tests  35 passed (35)
```

### After gap-closure pass (61 tests) — final:
```
 ✓ src/__tests__/xlsxLimits.test.ts     (9 tests)
 ✓ src/__tests__/requestId.test.ts      (6 tests)
 ✓ src/__tests__/revealToken.test.ts    (6 tests)
 ✓ src/__tests__/validation.test.ts     (9 tests)
 ✓ src/__tests__/corsOrigins.test.ts   (11 tests)
 ✓ src/__tests__/auth.test.ts           (5 tests)
 ✓ src/__tests__/bcryptRounds.test.ts   (8 tests)
 ✓ src/__tests__/vault.test.ts          (7 tests)

Test Files  8 passed (8) | Tests  61 passed (61)
```

Backend TypeScript build: clean (0 errors).  
Frontend audit (2026-06-29): **0 vulnerabilities**.  
Backend audit (2026-06-29): **4 vulnerabilities (1 low, 2 moderate, 1 high)** — all deferred.

---

## What Cannot Be Verified Without a Live Deploy

The following items are genuinely runtime-only and cannot be confirmed by static analysis or local unit tests:

| Item | Why runtime-only |
|------|-----------------|
| RT-08 (F-11/G-5) | Docker container must be running to confirm `whoami=node`; PDF must be generated end-to-end against the running non-root container to confirm Chromium launches successfully without setuid sandbox |
| RT-02 (F-02) | Legacy vault row decrypt requires a DB with real legacy-format rows; re-encryption migration (G-3) requires the production DB |
| RT-04 (F-05) | Redis persistence across container restarts requires a running Redis and container restart cycle |
| RT-05 (F-06) | CORS enforcement requires a real browser sending credentialed cross-origin requests |
| RT-10 (G-3) | Migration script must run against the live production DB to migrate existing rows |
