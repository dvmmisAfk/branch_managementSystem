# Cybersecurity Audit Report — Branch Visit Tracker

**Audit type:** White-box static analysis  
**Date:** 2026-06-29  
**Auditor:** Internal (Claude Code assisted)  
**Codebase revision:** `main` (post-commit `2eebd03`)  
**Scope:** Full backend + frontend static analysis, no live environment access

---

## 1. Executive Summary

The Branch Visit Tracker is a Node.js/Express + React SPA for internal branch-visit management. The authentication architecture is well-designed: dual-token JWT/opaque refresh session, HttpOnly cookies, bcrypt at cost 12, Zod env validation, structured security logging, and nine targeted rate limiters. The RBAC model is simple and consistently enforced at the middleware layer.

Despite these strengths, the audit identified **15 findings** including **2 HIGH**, **7 MEDIUM**, **5 LOW**, and **1 INFORMATIONAL**.

The two HIGH findings share a root cause: **`JWT_SECRET` is a single point of failure that simultaneously exposes JWT validity and the AES key protecting all stored SFH passwords**. A combined DB-dump + secret-leak (e.g., from a misconfigured environment or a compromised CI/CD variable) would let an attacker decrypt every SFH credential without any brute force. This should be addressed before public-production deployment.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 7 |
| Low | 5 |
| Informational | 1 |
| **Total** | **15** |

**Overall risk posture:** MODERATE. No remotely triggerable RCE or SQLI was found. The risk profile is dominated by key-management design gaps and defensive-depth deficiencies (missing headers, in-memory rate-limit state, over-broad CORS suffix).

---

## 2. Findings Summary Table

| ID | Title | Severity | Affected File(s) / Route(s) | Description |
|----|-------|----------|-----------------------------|-------------|
| F-01 | JWT Algorithm Not Pinned | MEDIUM | `authenticate.ts:30` | `jwt.verify()` has no `algorithms` option — accepts any algorithm the token header claims |
| F-02 | `JWT_SECRET` Dual-Purpose + Fixed Scrypt Salt | HIGH | `sfhSupervisorPasswordVault.ts:8,11` `auth.ts:36` | Single secret signs JWTs and derives AES key; hardcoded salt means one leak decrypts all SFH vault entries |
| F-03 | Plaintext SFH Password Returned in API Response | HIGH | `sfhs.ts:196,233` | `temporaryPassword` returned in plaintext JSON body on regeneration — captured by APM/proxy logs |
| F-04 | Login Timing Oracle — User Enumeration | MEDIUM | `auth.ts:77-79,101-103,109` | Unknown/inactive identifiers return before `bcrypt.compare`, creating measurable timing difference |
| F-05 | In-Memory Rate-Limit Store | MEDIUM | `rateLimits.ts` (all limiters) | Default MemoryStore resets on deploy/restart; per-instance — ineffective on horizontal scale |
| F-06 | CORS Suffix Too Broad — `*.vercel.app` With Credentials | MEDIUM | `corsOrigins.ts:24-28` `render.yaml` | Any Vercel deployment can make credentialed cross-origin requests to the API |
| F-07 | Weak Default Secrets in docker-compose.yml | MEDIUM | `docker-compose.yml` | Literal weak JWT secrets shipped as defaults; risk if deployed without change |
| F-08 | Missing Security Headers in Frontend nginx | MEDIUM | `frontend/nginx.conf` | No CSP, HSTS, Referrer-Policy, or Permissions-Policy on the SPA container |
| F-09 | Branch Facility Updates Not Audit-Logged | LOW | `visits.ts:494-498` | Infrastructure field edits bypass the audit log that other supervisor-equivalent writes produce |
| F-10 | X-Request-ID Log Injection | LOW | `requestId.ts:10-12` | Client-controlled header reflected verbatim into log entries without sanitisation |
| F-11 | Puppeteer/Chromium Runs as Root in Docker | MEDIUM | `backend/Dockerfile` | No `USER` instruction; Chromium sandboxing degrades when the process runs as root |
| F-12 | Refresh Token in Dev-Mode Response Body | LOW | `auth.ts:23-26` | Both tokens returned in JSON in non-production; captured by CI log artefacts or shared dev proxies |
| F-13 | Unvalidated Date Strings Passed to `new Date()` | LOW | `visits.ts:211,388,488` | Untrusted strings coerced to Date without format validation; surfaces internal Prisma errors on bad input |
| F-14 | `BCRYPT_ROUNDS` Sourced from Raw `process.env` | LOW | `sfhs.ts:42` | Read outside the validated Zod schema; a value ≥100 triggers DoS-grade hashing on account creation |
| F-15 | Vestigial `@supabase/supabase-js` Dependency | INFO | `frontend/package.json:18` | Unused library adds unnecessary attack surface and bundle weight |

---

## 3. Detailed Findings

---

### F-01 — JWT Algorithm Not Pinned (MEDIUM)

**Description**  
`jwt.verify()` is called without an `algorithms` option. The jsonwebtoken library will therefore verify a token using whatever algorithm is declared in the token's header. While `alg: none` is rejected by jsonwebtoken ≥ 9.x and the current setup is symmetric-only, the absence of explicit pinning means any future algorithm addition (e.g., RS256) would require coordinated changes to the verification call, and that risk is not enforced by the code.

**Evidence**

[backend/src/middleware/authenticate.ts:30](backend/src/middleware/authenticate.ts#L30)
```typescript
const payload = jwt.verify(token, env.JWT_SECRET) as JwtUser;
```

[backend/src/routes/auth.ts:36](backend/src/routes/auth.ts#L36)
```typescript
return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, env.JWT_SECRET, accessOpts);
// accessOpts = { expiresIn: env.JWT_EXPIRY } — no explicit algorithm
```

**Exploit Scenario**  
Currently low impact for HMAC-only deployments. The risk escalates if:
1. A second signing key (RS256) is introduced in future without updating `jwt.verify()` — enables algorithm-confusion where an attacker flips the header to HS256 and signs with the RS256 public key
2. A future jsonwebtoken regression re-enables `alg: none` processing

**Impact**  
MEDIUM — not immediately exploitable; defence-in-depth failure.

**Fix**
```typescript
// authenticate.ts:30 — add algorithms option
const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtUser;

// auth.ts:33 — make algorithm explicit in sign options
const accessOpts = { expiresIn: env.JWT_EXPIRY, algorithm: "HS256" } as SignOptions;
```

---

### F-02 — `JWT_SECRET` Dual-Purpose + Fixed Scrypt Salt (HIGH)

**Description**  
`JWT_SECRET` serves two entirely separate cryptographic functions:
1. HMAC key for signing JWT access tokens
2. Password input to `scryptSync()` for deriving the AES-256-GCM key used to encrypt SFH supervisor passwords stored in the `supervisor_password_enc` column

Additionally, the scrypt salt is a fixed, hardcoded string — not a per-record random salt. This means **every row in the `state_facility_heads` table is encrypted with the identical key**. If an attacker obtains `JWT_SECRET` and a DB dump, they can derive the AES key in milliseconds and decrypt all SFH passwords without any brute force.

**Evidence**

[backend/src/lib/sfhSupervisorPasswordVault.ts:8](backend/src/lib/sfhSupervisorPasswordVault.ts#L8)
```typescript
const SCRYPT_SALT = Buffer.from("sfh-supervisor-pwd-vault-v1", "utf8"); // fixed, not per-record
```

[backend/src/lib/sfhSupervisorPasswordVault.ts:11](backend/src/lib/sfhSupervisorPasswordVault.ts#L11)
```typescript
return crypto.scryptSync(env.JWT_SECRET, SCRYPT_SALT, 32); // JWT_SECRET used as key material
```

[backend/src/routes/auth.ts:36](backend/src/routes/auth.ts#L36)
```typescript
jwt.sign({ ... }, env.JWT_SECRET, accessOpts); // same secret — JWT signing
```

**Exploit Scenario**  
1. Attacker leaks `JWT_SECRET` (e.g., Render dashboard misconfiguration, GitHub Actions log exposure, compromised `.env`)
2. Attacker dumps DB (via compromised DB credentials, Render managed DB access, or SQL injection)
3. For each row: compute `scryptSync(JWT_SECRET, "sfh-supervisor-pwd-vault-v1", 32)` → decrypt `supervisor_password_enc` with AES-256-GCM
4. All SFH plaintext passwords recovered in under one second

**Impact**  
HIGH — complete SFH credential compromise follows any single-secret leak, which is a realistic threat path.

**Fix**
- Separate `JWT_SECRET` and a new `VAULT_SECRET` (different env var, added to env schema with min-32-char validation)
- Generate a random per-record salt at encrypt time and store it alongside the ciphertext (e.g., prepend to the blob before the IV)
- Migration path: on next password regeneration, re-encrypt with new scheme; old rows remain readable with old key until rotated

```typescript
// New vault key — uses separate secret and per-record salt
export function encryptSfhSupervisorPasswordVault(plaintext: string): string {
  const recordSalt = crypto.randomBytes(32); // per-record random salt
  const key = crypto.scryptSync(env.VAULT_SECRET, recordSalt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([recordSalt, iv, tag, enc]).toString("base64url");
}
```

---

### F-03 — Plaintext SFH Password Returned in API Response (HIGH)

**Description**  
`POST /api/v1/sfhs/:id/regenerate-password` and `POST /api/v1/sfhs/password-reset-requests/:requestId/fulfill` both return `{ temporaryPassword: "..." }` in the JSON response body. The password travels over HTTPS in transit, but it is captured verbatim by:
- Application Performance Monitoring tools (Datadog, New Relic, Sentry) that log HTTP response bodies
- Reverse proxy access logs configured to log responses
- Browser DevTools network panel, which stores responses in session history
- Any HTTP intercepting proxy on the supervisor's device

**Evidence**

[backend/src/routes/sfhs.ts:196](backend/src/routes/sfhs.ts#L196)
```typescript
res.json({ temporaryPassword });  // password-reset-requests/:requestId/fulfill
```

[backend/src/routes/sfhs.ts:233](backend/src/routes/sfhs.ts#L233)
```typescript
res.json({ temporaryPassword });  // /:id/regenerate-password
```

**Exploit Scenario**  
A supervisor's device or a shared APM dashboard is compromised. The attacker reviews logged API responses and recovers the most recent `temporaryPassword` for any SFH account, without needing to touch the DB or JWT_SECRET.

**Impact**  
HIGH — direct credential exposure via a common logging vector.

**Fix**  
Return a one-time retrieval token instead of the password directly, or require the supervisor to view the password via a separate short-lived endpoint that is not logged. At minimum, add explicit instructions to disable response-body logging for `/api/v1/sfhs` in any APM configuration.

As an interim partial mitigation, hash the response in security logs so the password never appears in structured log output:
```typescript
// Do not log the password value in any securityLog or console.log call
securityLog("auth_supervisor_sfh_password_set", {
  req, targetUserId: ..., via: "regenerate"
  // do NOT include the password here
});
```

---

### F-04 — Login Timing Oracle — User Enumeration (MEDIUM)

**Description**  
The login handler has two distinct code paths:

- **Unknown / inactive identifier:** returns 401 immediately, before calling `bcrypt.compare()` (~0–5 ms)
- **Known and active identifier:** runs `bcrypt.compare()` before returning (~100–300 ms depending on cost factor)

This asymmetry lets an attacker distinguish valid accounts by measuring response time, even though the error message is identical in both cases.

**Evidence**

[backend/src/routes/auth.ts:77-79](backend/src/routes/auth.ts#L77)
```typescript
if (!row?.isActive || row.role !== UserRole.supervisor) {
  securityLog("auth_login_failure", { req, reason: "invalid_credentials" });
  throw new HttpError("Invalid credentials", 401 ...);  // returns before bcrypt
}
```

[backend/src/routes/auth.ts:101-103](backend/src/routes/auth.ts#L101)
```typescript
if (!sfh?.user?.isActive || sfh.user.role !== UserRole.sfh) {
  securityLog("auth_login_failure", { req, reason: "invalid_credentials" });
  throw new HttpError("Invalid credentials", 401 ...);  // returns before bcrypt
}
```

[backend/src/routes/auth.ts:109](backend/src/routes/auth.ts#L109)
```typescript
const ok = await bcrypt.compare(body.password, user.passwordHash); // only runs for valid accounts
```

**Exploit Scenario**  
Attacker sends login requests with a wordlist of employee codes. Requests that return in < 10 ms indicate non-existent/inactive accounts; those taking 150+ ms indicate valid active accounts. This narrows the brute-force target list significantly.

**Impact**  
MEDIUM — account enumeration; exploitability requires network timing access but is realistic for an inside threat or attacker on the same network segment.

**Fix**  
Run `bcrypt.compare()` against a static dummy hash whenever the user is not found, then discard the result:

```typescript
// Module-level dummy hash (pre-computed at startup)
const DUMMY_HASH = await bcrypt.hash("dummy-sentinel-value-never-used", 12);

// In the not-found branch:
await bcrypt.compare(body.password, DUMMY_HASH); // constant-time padding
securityLog("auth_login_failure", ...);
throw new HttpError("Invalid credentials", 401 ...);
```

---

### F-05 — In-Memory Rate-Limit Store (MEDIUM)

**Description**  
All 9 rate limiters use the default `MemoryStore` from `express-rate-limit`. This store is process-local:
1. **Deploy reset:** every time Render restarts the container (deploy, crash recovery, scale event), all rate-limit counters reset to zero
2. **Horizontal scaling:** if the service ever runs more than one instance, each instance maintains independent counters — an attacker can exceed the effective limit N× by distributing requests across instances
3. **Login limiter:** keys on `IP + loginId` (good), but the state is lost on any restart, allowing a resumed brute-force after a deploy

**Evidence**

[backend/src/middleware/rateLimits.ts:37-48](backend/src/middleware/rateLimits.ts#L37)
```typescript
export const loginLimiter = rateLimit({
  ...rateLimitSafeClientKey,
  windowMs: 15 * 60 * 1000,
  max: 10,
  // No store: option — defaults to MemoryStore
  ...
});
```

**Impact**  
MEDIUM — brute-force mitigation is unreliable on every deploy; critical for the login limiter (10 attempts per 15 min).

**Fix**  
Add a Redis-backed store using `rate-limit-redis` or `ioredis` + `@express-rate-limit/redis`. On Render, this requires a Redis add-on (e.g., Upstash free tier).

```typescript
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

export const loginLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: keyLogin,
  ...
});
```

---

### F-06 — CORS Suffix Allow-List Too Broad (`*.vercel.app`) (MEDIUM)

**Description**  
`render.yaml` sets `ALLOWED_ORIGIN_SUFFIXES: .vercel.app`. The `isOriginAllowed()` function matches any HTTPS origin whose hostname ends in `.vercel.app` and passes it through with `credentials: true`. Any Vercel project — including attacker-controlled ones, experiment forks, or typosquats — can make fully credentialed cross-origin API calls (cookies included).

**Evidence**

[backend/src/lib/corsOrigins.ts:24-28](backend/src/lib/corsOrigins.ts#L24)
```typescript
for (const suffix of getAllowedOriginSuffixes()) {
  const s = suffix.startsWith(".") ? suffix : `.${suffix}`;
  const host = new URL(lower).hostname;
  if (host === s.slice(1) || host.endsWith(s)) return true; // *.vercel.app passes
}
```

`render.yaml`:
```yaml
- key: ALLOWED_ORIGIN_SUFFIXES
  value: .vercel.app
```

**Exploit Scenario**  
1. Attacker deploys a page at `attacker.vercel.app`
2. Page includes JavaScript that makes `fetch("https://branch-visit-api.onrender.com/api/v1/sfhs", { credentials: "include" })`
3. The supervisor's browser executes this (via phishing or XSS on an unrelated site) — the CORS preflight passes because the origin is `*.vercel.app`
4. Attacker receives the SFH list or performs state-changing operations using the supervisor's session cookie

**Impact**  
MEDIUM — requires the supervisor to visit a malicious page, but the CORS configuration makes that sufficient for a full session hijack attack.

**Fix**  
After the production Vercel deployment is stable, replace the suffix with the exact URL:
```yaml
- key: ALLOWED_ORIGINS
  value: https://your-exact-app.vercel.app
# Remove ALLOWED_ORIGIN_SUFFIXES entirely
```

If preview deployments are needed for review, generate per-PR allowed-origin values in CI rather than using a blanket suffix.

---

### F-07 — Weak Default Secrets in docker-compose.yml (MEDIUM)

**Description**  
The shipped `docker-compose.yml` contains literal weak JWT secrets as environment variable defaults. Any operator who clones the repo and runs `docker-compose up` in a production context without customising the file will have predictable secrets in use.

**Evidence**

`docker-compose.yml`:
```yaml
JWT_SECRET: dev-access-secret-change-in-production-at-least-32-chars
JWT_REFRESH_SECRET: dev-refresh-secret-change-production-min-thirty-two
```

The database is also configured with a default password `postgres` for the `postgres` user.

**Impact**  
MEDIUM — an attacker who knows the secret can forge arbitrary JWTs and authenticate as any user. The default DB password is an additional risk if the port is ever exposed (it is commented out in the compose file, which is good practice, but the secret is still weak).

**Fix**  
Replace the literal values with a `docker-compose.override.yml` pattern or a `.env` file reference:
```yaml
environment:
  JWT_SECRET: ${JWT_SECRET:?JWT_SECRET must be set in .env}
  JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET must be set in .env}
```

Document in `README.md` that the `.env` file must be created from `.env.example` before first run and must never contain the example values.

---

### F-08 — Missing Security Headers in Frontend nginx (MEDIUM)

**Description**  
`frontend/nginx.conf` sets only `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. When running the Docker Compose stack, the SPA is served from this nginx with no:
- `Content-Security-Policy` — no XSS mitigation
- `Strict-Transport-Security` — no HSTS; HTTP downgrade attacks possible
- `Referrer-Policy` — internal URLs (employee codes, branch IDs) may leak in Referer header to third-party scripts
- `Permissions-Policy` — no restriction on camera, microphone, geolocation

Note: The backend does benefit from Helmet 8 defaults (`app.ts:57`), which include CSP, HSTS, and Referrer-Policy for API responses.

**Evidence**

[frontend/nginx.conf](frontend/nginx.conf):
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
# Missing: CSP, HSTS, Referrer-Policy, Permissions-Policy
```

**Impact**  
MEDIUM — XSS exploitability is amplified without CSP; HSTS absence allows protocol downgrade.

**Fix**
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://your-api.onrender.com; frame-ancestors 'none';" always;
  # HSTS — only add if TLS is terminated upstream
  # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  location / {
    try_files $uri /index.html;
  }
}
```

---

### F-09 — Branch Facility Updates Not Audit-Logged (LOW)

**Description**  
`PATCH /api/v1/visits/:id` calls `applyBranchFacilitySlice()` to update branch infrastructure master data (UPS capacity, AC tonnage, DG ownership, electricity load, RMS vendor). These are persistent branch-level fields — not visit-specific data. No audit log entry is written for these changes. Other privileged writes (visit-date unlock, SFH creation, password changes) do produce audit records.

**Evidence**

[backend/src/routes/visits.ts:494-498](backend/src/routes/visits.ts#L494)
```typescript
if (body.branch_facility && Object.keys(body.branch_facility).length) {
  await applyBranchFacilitySlice(
    visit.branchId,
    body.branch_facility as Parameters<typeof applyBranchFacilitySlice>[1]
  );
  // No writeAudit() call here
}
```

For comparison, visit-date unlock does write an audit:
[backend/src/routes/visits.ts:393-399](backend/src/routes/visits.ts#L393)
```typescript
await writeAudit({ actorId: req.user!.id, action: "visit_date_unlock", ... });
```

**Impact**  
LOW — data integrity risk; a malicious or careless SFH can modify branch infrastructure records without a traceable log entry.

**Fix**
```typescript
if (body.branch_facility && Object.keys(body.branch_facility).length) {
  const prevFacility = await prisma.branch.findUnique({
    where: { id: visit.branchId },
    select: { upsCapacityKva: true, acTonnage: true, dgOwnership: true /* ... */ }
  });
  await applyBranchFacilitySlice(visit.branchId, body.branch_facility as ...);
  await writeAudit({
    actorId: req.user!.id,
    action: "branch_facility_update",
    entityType: "Branch",
    entityId: visit.branchId,
    metadata: { visitId: visit.id, previous: prevFacility, updated: body.branch_facility },
  });
}
```

---

### F-10 — X-Request-ID Log Injection (LOW)

**Description**  
`requestIdMiddleware` accepts a client-supplied `x-request-id` header (up to 64 characters, trimmed) and uses it verbatim as the request ID — which is then included in structured log lines. If the value contains newlines, JSON-control characters, or log-format metacharacters, a client can inject fake log lines into the application log stream.

**Evidence**

[backend/src/middleware/requestId.ts:10-12](backend/src/middleware/requestId.ts#L10)
```typescript
const incoming = req.headers[REQUEST_ID_HEADER];
const id =
  typeof incoming === "string" && incoming.trim().length > 0 && incoming.length <= 64 ?
    incoming.trim()  // no sanitisation of control chars
  : crypto.randomUUID();
```

**Exploit Scenario**  
`x-request-id: abc\n{"type":"auth_login_success","userId":"admin-uuid"}` — if the SIEM processes logs line-by-line, the injected JSON fragment appears as a legitimate security event.

**Impact**  
LOW — log integrity only; no direct data access.

**Fix**  
Restrict the accepted value to UUID format or alphanumeric-dash characters:
```typescript
const SAFE_REQUEST_ID = /^[a-zA-Z0-9\-_]{1,64}$/;
const id =
  typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming.trim()) ?
    incoming.trim()
  : crypto.randomUUID();
```

---

### F-11 — Puppeteer/Chromium Runs as Root in Docker (MEDIUM)

**Description**  
The backend `Dockerfile` has no `USER` instruction. The Node.js process — and Chromium spawned by Puppeteer for PDF generation — run as `root` inside the container. Chromium's own sandbox provides partial isolation, but its efficacy is reduced when the outer process is root. If an attacker finds an injection point in the visit report template (e.g., HTML/CSS injection via branch name or SFH observation fields), Chromium exploitation would run as root inside the container.

**Evidence**

`backend/Dockerfile` — no `USER` directive:
```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN apk add --no-cache chromium ...
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY ...
EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
# Missing: USER node
```

**Impact**  
MEDIUM — conditional on finding an injection path into PDF rendering (currently not identified, but the PDF template includes user-controlled fields like observations and issue descriptions).

**Fix**
```dockerfile
# Add before ENTRYPOINT:
RUN chown -R node:node /app
USER node
```

Also verify that `buildVisitPdfFromModel()` HTML-encodes all user-controlled field values before inserting them into the Puppeteer HTML template.

---

### F-12 — Refresh Token Returned Plaintext in Dev-Mode Response Body (LOW)

**Description**  
`authJsonTokens()` returns both `accessToken` and `refreshToken` in the JSON body when `NODE_ENV !== "production"`. If this runs in a shared development environment, CI pipeline log capture, or an HTTP proxy shared among developers, the refresh tokens are exposed.

**Evidence**

[backend/src/routes/auth.ts:23-26](backend/src/routes/auth.ts#L23)
```typescript
function authJsonTokens(accessToken: string, refreshToken: string) {
  if (env.NODE_ENV === "production") return { accessToken };
  return { accessToken, refreshToken };  // refresh token in body in non-production
}
```

**Impact**  
LOW — only affects non-production environments.

**Fix**  
Remove `refreshToken` from the body response entirely, or replace it with a boolean `{ refreshIssued: true }`. The cookie already carries the refresh token; the body value is redundant.

---

### F-13 — Unvalidated Date Strings Passed to `new Date()` (LOW)

**Description**  
Several routes accept date strings from the request body and coerce them with `new Date(untrustedString)` without format validation. An invalid string (e.g., `"not-a-date"`) produces `Invalid Date` (NaN-based Date object). Prisma rejects this and throws a `PrismaClientKnownRequestError`, which the error handler returns as a 503 "SCHEMA_OUT_OF_DATE" or 500 "INTERNAL_ERROR" response — neither of which accurately describes the issue, and the latter leaks an internal stack trace when `API_DEBUG=true`.

**Evidence**

[backend/src/routes/visits.ts:211](backend/src/routes/visits.ts#L211)
```typescript
scheduledClosureDate: b.scheduled_closure_date?.trim()?.length ?
  new Date(b.scheduled_closure_date)  // no format check
: null,
```

[backend/src/routes/visits.ts:388](backend/src/routes/visits.ts#L388)
```typescript
visitDateActual: hasCorrectedDate ? new Date(body.visit_date_actual!) : visit.visitDateActual,
```

[backend/src/routes/visits.ts:488](backend/src/routes/visits.ts#L488)
```typescript
const next = new Date(body.visit_date_actual);
```

**Impact**  
LOW — incorrect error messages; no direct data access.

**Fix**  
Use `z.coerce.date()` or a regex-validated date schema in Zod:
```typescript
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");
```

---

### F-14 — `BCRYPT_ROUNDS` Read from Raw `process.env` (LOW)

**Description**  
`sfhs.ts:42` reads `BCRYPT_ROUNDS` directly from `process.env`, bypassing the validated `env` object from `config/env.ts`. The guard `rounds >= 10` correctly rejects values below 10, but does not cap the upper bound. A value of `BCRYPT_ROUNDS=100` would be accepted and make each hash operation take minutes — an effective DoS on the SFH account-creation endpoint.

**Evidence**

[backend/src/routes/sfhs.ts:42-43](backend/src/routes/sfhs.ts#L42)
```typescript
const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10);
return bcrypt.hash(plain, Number.isFinite(rounds) && rounds >= 10 ? rounds : 12);
```

**Impact**  
LOW — requires control of the environment variable; no remote triggering.

**Fix**  
Add `BCRYPT_ROUNDS` to the Zod env schema with a bounded range:
```typescript
BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
```
Then reference `env.BCRYPT_ROUNDS` in `sfhs.ts`.

---

### F-15 — Vestigial `@supabase/supabase-js` Dependency (INFORMATIONAL)

**Description**  
`frontend/package.json` lists `@supabase/supabase-js` as a production dependency. The backend uses its own PostgreSQL/Prisma stack with no Supabase integration. This appears to be a residual dependency from an earlier architecture or experiment. It is not imported in any audited source file.

**Evidence**

[frontend/package.json:18](frontend/package.json#L18)
```json
"@supabase/supabase-js": "^2.105.4",
```

**Impact**  
INFORMATIONAL — unnecessary dependency; increases npm audit surface, bundle size, and supply-chain exposure.

**Fix**
```bash
cd frontend && npm uninstall @supabase/supabase-js
```

Verify no files import from `@supabase/supabase-js` before removing.

---

## 4. Items Requiring Runtime / Dynamic Testing

The following cannot be assessed from static analysis alone and require a live environment:

| # | Test | What to Verify |
|---|------|----------------|
| RT-01 | Login timing measurement | Measure response-time distribution for known vs. unknown employee codes using `ab` or `wrk` against staging; confirm bcrypt blind is detectable above network jitter |
| RT-02 | Rate-limit restart bypass | Trigger login limiter 10×, restart the container, verify counter resets; confirms F-05 impact |
| RT-03 | CORS credentialed request from `attacker.vercel.app` | Deploy a test page, confirm that a credentialed fetch to the API returns data; validates F-06 impact |
| RT-04 | Puppeteer HTML injection | Submit a visit observation containing `<script>`, HTML entities, or CSS payload; verify the PDF generator sanitises or encodes output and Chromium does not execute it |
| RT-05 | Concurrent refresh rotation race | Send two simultaneous `/auth/refresh` requests with the same refresh cookie; verify only one succeeds and the family is not erroneously revoked |
| RT-06 | `npm audit` dependency scan | Run `npm audit --audit-level=high` against `backend/package-lock.json` and `frontend/package-lock.json`; check for known CVEs in `jsonwebtoken`, `puppeteer`, `xlsx`, `express` |
| RT-07 | X-Request-ID newline injection | Send `x-request-id: abc\n{"injected":"true"}` and verify it appears in structured log output |
| RT-08 | SFH password response body logging | Confirm APM/proxy tool (if configured) does not record response bodies for `/api/v1/sfhs/:id/regenerate-password` |
| RT-09 | Docker Compose default secret check | Deploy with default `docker-compose.yml` and verify JWT_SECRET is not the literal default; enforce in a pre-deploy check script |

---

## 5. Out of Scope / Assumptions

- **Physical / network access:** No assessment of the Render hosting environment, managed PostgreSQL access controls, or Vercel project permissions
- **Email infrastructure:** No email sending is implemented; email-verification flag exists but `REQUIRE_EMAIL_VERIFICATION` defaults to off — no SMTP attack surface assessed
- **Frontend XSS:** No evidence of `dangerouslySetInnerHTML` or `eval()` found in audited files; full XSS assessment requires dynamic browser testing
- **SQL injection:** `prisma.$queryRaw` usage in `categories.ts:333` uses tagged-template parameterisation (safe by Prisma's implementation); no `$queryRawUnsafe` calls found in any audited file
- **All `req.body` inputs pass through Zod** — confirmed by grep across all route files; mass-assignment to Prisma is not present
- **`visitPatchSchema` uses `.strict()`** — extra keys in the request body are rejected (`visits.ts:459`)
- **Refresh token rotation is atomic** — `prisma.$transaction([revoke, create])` prevents split-state issues (`refreshSession.service.ts:74-87`)
- **No `alg:none` currently exploitable** — jsonwebtoken ≥ 9.x rejects unsigned tokens by default
- **Render free tier is single-instance** — F-05 impact is currently theoretical; becomes real on any paid-tier horizontal scale or migration
- **Vercel frontend** — Vercel's edge network adds its own security headers (e.g., HSTS) that are not visible in source; F-08 applies specifically to the Docker Compose nginx deployment path
- **Secrets in version control:** No hardcoded secrets found in source files; `JWT_SECRET` and `JWT_REFRESH_SECRET` are always sourced from environment; the compose defaults (F-07) are the closest concern
- **AI route (`/api/v1/ai`):** Currently returns 501 Not Implemented — no attack surface at this time
- **`xlsx` library:** Used only for reading uploaded branch Excel files in `branches.ts`; no file path traversal or formula injection was confirmed without dynamic testing

---

*End of report. This audit was conducted via white-box static analysis of the repository at the revision noted above. Findings are based on code observable at audit time; deploy-time configuration, runtime behaviour, and dependency CVEs require separate dynamic and dependency scanning.*
