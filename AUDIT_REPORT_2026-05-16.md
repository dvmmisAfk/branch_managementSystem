# Project Audit Report

Generated: 2026-05-16 (read-only static audit)  
Audited by: Cursor Agent (Composer)  
Codebase snapshot: `8afde394ceb9bf559282933b722552a41887030f` (`8afde39` — fix: update branches.ts and pdfGeneration for new DgOwnership enum)

---

## Executive Summary

- **Total findings:** 47
- **Critical:** 3
- **Major:** 14
- **Minor:** 21
- **Informational:** 9
- **Sections audited:** Database schema, API routes, Auth, Business logic, ORM/queries, Frontend routing, Type safety, PDF/exports, Error handling, Environment/config
- **Files inspected:** 58 (Prisma schema + 11 migrations, 16 backend route/service files, 10 frontend pages/components, config, docker-compose, client API layer)

**Prior audit cross-reference** (from `SCORING_SCHEMA.md` — “Branch Visit Tracker” scoring audit log):

| Prior ID | Status in this snapshot |
|----------|-------------------------|
| C-1 (PDF issue badges always “open”) | **Resolved** — `pdfGeneration.service.ts` maps `resolved` / `in_progress` / `open` |
| C-2 (Q4 utility inaccessible) | **Open** — utility API, PDF loader, dashboard still Q1–Q3 only |
| C-3 (all-N/A → critical band) | **Resolved** — `scoreCalculation.service.ts` uses `not_applicable` + null % |
| M-1 (PDF summary sort ≠ detail sort) | **Resolved** — ordered by `displayOrder` |
| M-2 (N+1 pending branches report) | **Open** — loop still issues per-branch queries |
| M-3 (unsafe cast `loadVisitPdfModel`) | **Open** — `as unknown as VisitPdfModel` remains |
| M-4 (`rmsVendorName` unreachable from visit form) | **Open** — visit form has `rmsVendorPresent` only |
| M-5 (`visitType` no schema default) | **Mitigated** — draft creation sets `physical` in app code |
| M-6 (dashboard Q4 breakdown dropped) | **Open** — `fyQuarterBreakdown` skips non-Q1–Q3 |

---

## Findings

### Critical · Auth · Refresh tokens not invalidated on use

**ID:** A-AUTH-1  
**Severity:** Critical  
**File:** `backend/src/routes/auth.ts`  
**Line:** 122–141  
**Evidence:**
```typescript
router.post("/refresh", refreshLimiter, async (req, res, next) => {
  // ...
  res.json({
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  });
});
```
**Problem:** Each refresh mints a new refresh JWT but the previous refresh token is never revoked or blocklisted. Stolen refresh tokens remain valid until natural expiry (`JWT_REFRESH_EXPIRY`, default 7d).  
**Risk:** Token theft (e.g. via XSS — see A-AUTH-2) allows indefinite session renewal.  
**Recommended fix:** Store refresh token family IDs server-side; invalidate prior refresh on rotation; reject reused tokens.

---

### Critical · Auth · Access and refresh tokens stored in localStorage

**ID:** A-AUTH-2  
**Severity:** Critical  
**File:** `frontend/src/api/client.ts`  
**Line:** 29–38, 47–48, 56–57  
**Evidence:**
```typescript
let accessToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("access_token") : null;
// ...
localStorage.setItem("access_token", access);
if (refresh) localStorage.setItem("refresh_token", refresh);
```
**Problem:** Bearer tokens are readable by any script on the origin (XSS). HttpOnly cookies are not used.  
**Risk:** One XSS flaw exfiltrates long-lived credentials.  
**Recommended fix:** Move tokens to HttpOnly, Secure, SameSite cookies; add CSP; keep access tokens short-lived.

---

### Critical · Auth · Reflective CORS when `ALLOWED_ORIGINS` unset (non-production)

**ID:** A-AUTH-3  
**Severity:** Critical (if deployed with `NODE_ENV` ≠ `production` and empty origins)  
**File:** `backend/src/app.ts`  
**Line:** 40–51  
**Evidence:**
```typescript
app.use(
  cors({
    credentials: true,
    origin:
      allowedOrigins?.length ? allowedOrigins
      : true,
  })
);
```
**Problem:** `credentials: true` with `origin: true` reflects any requesting origin. Production schema requires `ALLOWED_ORIGINS`, but staging/test misconfiguration allows cross-origin credentialed calls.  
**Risk:** Malicious site triggers authenticated API calls from a victim’s browser if they have a valid token.  
**Recommended fix:** Never use reflective origin with credentials; always set an explicit allowlist per environment.

---

### Major · API · Utility API rejects quarter 4

**ID:** A-API-1  
**Severity:** Major  
**Cross-ref:** Prior **C-2** (still open)  
**File:** `backend/src/routes/utility.ts`  
**Line:** 50–53  
**Evidence:**
```typescript
const utilityBody = z.object({
  // ...
  quarter_number: z.number().int().min(1).max(3),
```
**Problem:** `utility_consumption` unique key allows any `quarter_number`, but POST/PATCH validation caps at 3. Q4 data cannot be stored via API.  
**Risk:** Incomplete utility records for the last calendar quarter of the FY window.  
**Recommended fix:** Align max with product definition (4 if FY has four quarters); update PDF/Excel loaders consistently.

---

### Major · PDF · Visit PDF/Excel utility loader ignores Q4

**ID:** A-PDF-1  
**Severity:** Major  
**Cross-ref:** Prior **C-2** (still open)  
**File:** `backend/src/services/visitReportLoader.service.ts`  
**Line:** 9–17  
**Evidence:**
```typescript
const utils = await prisma.utilityConsumption.findMany({
  where: { branchId: visit.branchId, financialYear: fy, quarterNumber: { in: [1, 2, 3] } },
```
**Problem:** Exported reports only load quarters 1–3 into `utilityByQ`.  
**Risk:** Q4 utility data never appears in PDF/Excel even if stored.  
**Recommended fix:** Extend to `[1,2,3,4]` (or dynamic from `quarters` table) and widen PDF table columns.

---

### Major · Business logic · Dashboard quarterly breakdown omits Q4

**ID:** A-BIZ-1  
**Severity:** Major  
**Cross-ref:** Prior **M-6** (still open)  
**File:** `backend/src/routes/dashboard.ts`  
**Line:** 95–111  
**Evidence:**
```typescript
const keys = {
  Q1: { visited: 0, pending: 0 },
  Q2: { visited: 0, pending: 0 },
  Q3: { visited: 0, pending: 0 },
} as Record<"Q1" | "Q2" | "Q3", { visited: number; pending: number }>;
for (const q of quarters) {
  const label = `Q${q.quarterNumber}` as "Q1" | "Q2" | "Q3";
  if (label !== "Q1" && label !== "Q2" && label !== "Q3") continue;
```
**Problem:** Any quarter with `quarterNumber === 4` is skipped silently. Bootstrap only creates Q1–Q3 per FY (`quarterBootstrap.service.ts`), so Q4 is structurally absent.  
**Risk:** Supervisors/SFHs never see Q4 completion in dashboard charts (`DashboardPage.tsx` lines 169–173 only chart Q1–Q3).  
**Recommended fix:** Define whether the product uses 3 or 4 quarters per FY; extend bootstrap, dashboard keys, and frontend charts consistently.

---

### Major · Queries · N+1 queries in pending-branches report

**ID:** A-QUERY-1  
**Severity:** Major  
**Cross-ref:** Prior **M-2** (still open)  
**File:** `backend/src/routes/reports.ts`  
**Line:** 167–179  
**Evidence:**
```typescript
for (const branchId of mapped) {
  if (visitedSet.has(branchId)) continue;
  const b = await prisma.branch.findUnique({ where: { id: branchId } });
  // ...
  const mp = await prisma.sfhBranchMapping.findFirst({
    where: { branchId, isCurrent: true, /* ... */ },
    include: { sfh: { include: { user: { select: { name: true } } } } },
  });
```
**Problem:** Two DB round-trips per unvisited branch.  
**Risk:** Timeouts and DB load at hundreds/thousands of mapped branches.  
**Recommended fix:** Single query joining `branches` + current mapping + anti-join visited set.

---

### Major · Business logic · Dashboard average score treats null percentage as 0

**ID:** A-BIZ-2  
**Severity:** Major  
**File:** `backend/src/routes/dashboard.ts`  
**Line:** 74–80  
**Evidence:**
```typescript
const sum = snaps.reduce((acc, s) => acc + Number(s.scorePercentage), 0);
avgScore = Math.round((sum / snaps.length) * 100) / 100;
```
**Problem:** All-N/A visits store `score_percentage = null` (post C-3 fix). `Number(null)` is `0`, dragging averages down.  
**Risk:** Incorrect SFH/org average scores on dashboard.  
**Recommended fix:** Filter `scorePercentage != null` before averaging; or exclude `scoreBand === 'not_applicable'`.

---

### Major · Exports · No Excel formula-injection sanitization

**ID:** A-EXPORT-1  
**Severity:** Major  
**File:** `backend/src/services/excelExport.service.ts`  
**Line:** 63–75 (and all `cell.value =` assignments)  
**Evidence:**
```typescript
cell.value = v === null || v === undefined ? "" : v;
```
**Problem:** User-supplied text (`issueDescription`, `observations`, `remarks`, branch names) is written raw. Values starting with `=`, `+`, `-`, `@` can execute as formulas when opened in Excel.  
**Risk:** CSV/Excel injection against supervisors opening exports.  
**Recommended fix:** Prefix dangerous leading characters with `'` or use ExcelJS `numFmt: '@'` and sanitize `^[=+\-@]`.

---

### Major · Auth · Role checks inside handlers (visits list)

**ID:** A-AUTH-4  
**Severity:** Major  
**File:** `backend/src/routes/visits.ts`  
**Line:** 43–47  
**Evidence:**
```typescript
if (req.user!.role === UserRole.sfh) {
  const sfh = await getSfhRecordForUser(req.user!.id, req.user!.role);
  // ...
} else if (req.user!.role !== UserRole.supervisor) throw new HttpError("Forbidden", 403);
```
**Problem:** Authorization is enforced in the handler, not `requireRoles` middleware.  
**Risk:** Future routes may copy the pattern and omit a branch; harder to audit uniformly.  
**Recommended fix:** Split SFH/supervisor routers or apply `requireRoles` per route group.

---

### Major · Auth · Role checks inside handlers (utility routes)

**ID:** A-AUTH-5  
**Severity:** Major  
**File:** `backend/src/routes/utility.ts`  
**Line:** 20–28, 64–68, 110–114  
**Evidence:**
```typescript
if (req.user!.role === UserRole.sfh) {
  // ...
} else if (req.user!.role !== UserRole.supervisor) throw new HttpError("Forbidden", 403);
```
**Problem:** Same handler-level role pattern on GET/POST/PATCH.  
**Risk:** Inconsistent auth surface (see A-AUTH-4).  
**Recommended fix:** `requireRoles(UserRole.sfh)` / `requireRoles(UserRole.supervisor)` on mutating routes; shared guard for GET.

---

### Major · Auth · Role checks inside handlers (reports)

**ID:** A-AUTH-6  
**Severity:** Major  
**File:** `backend/src/routes/reports.ts`  
**Line:** 31–43 (`resolveSfhFilter`)  
**Evidence:**
```typescript
if (u.role === UserRole.sfh) { /* ... */ }
if (u.role === UserRole.supervisor) { /* ... */ }
throw new HttpError("Forbidden", 403);
```
**Problem:** All four report endpoints rely on inline role resolution, not middleware.  
**Risk:** Audit inconsistency; `branch_staff` gets 403 only after handler entry.  
**Recommended fix:** Middleware per audience or explicit `requireRoles` on each route.

---

### Major · Auth · Role checks inside handlers (edit-requests list)

**ID:** A-AUTH-7  
**Severity:** Major  
**File:** `backend/src/routes/editRequests.ts`  
**Line:** 25–48  
**Evidence:**
```typescript
if (user.role === UserRole.supervisor) { /* findMany all */ }
else if (user.role === UserRole.sfh) { /* scoped */ }
else { throw new HttpError("Forbidden", 403); }
```
**Problem:** GET `/edit-requests` uses handler branching instead of middleware.  
**Risk:** Same as A-AUTH-4.  
**Recommended fix:** `requireRoles` on split endpoints or router mounts.

---

### Major · Auth · Role checks inside handlers (mappings list)

**ID:** A-AUTH-8  
**Severity:** Major  
**File:** `backend/src/routes/mappings.ts`  
**Line:** 24–93  
**Evidence:**
```typescript
if (req.user!.role === UserRole.supervisor) { /* ... */ }
if (req.user!.role === UserRole.sfh) { /* ... */ }
throw new HttpError("Forbidden", 403);
```
**Problem:** Handler-level role enforcement on GET `/mappings`.  
**Risk:** Same audit gap.  
**Recommended fix:** Separate supervisor/SFH route files with `requireRoles`.

---

### Major · API · Category reorder bypasses versioning flow

**ID:** A-API-2  
**Severity:** Major  
**File:** `backend/src/routes/categories.ts`  
**Line:** 114–124  
**Evidence:**
```typescript
await prisma.$transaction(
  rows.map((r) =>
    prisma.assessmentCategory.update({
      where: { id: r.id },
      data: { displayOrder: r.displayOrder },
    })
  )
);
```
**Problem:** `PATCH /categories/reorder` mutates rows in place. `PATCH /categories/:id` creates a new version row and deactivates the old (lines 134–191).  
**Risk:** Version history and audit semantics diverge; in-flight visits may reference mixed versions.  
**Recommended fix:** Reorder via versioned copies or document reorder as non-versioned metadata with explicit rules.

---

### Major · API · Subcategory reorder bypasses versioning flow

**ID:** A-API-3  
**Severity:** Major  
**File:** `backend/src/routes/categories.ts`  
**Line:** 317–323  
**Evidence:**
```typescript
prisma.assessmentSubcategory.update({
  where: { id: r.id },
  data: { displayOrder: r.displayOrder },
})
```
**Problem:** Subcategory reorder updates in place; `PATCH .../subcategories/:subId` deactivates old row and creates new (lines 346–406).  
**Risk:** Same as A-API-2 for scorecard integrity.  
**Recommended fix:** Align reorder with deactivate/create pattern or store `display_order` on a stable surrogate.

---

### Major · Frontend · `rmsVendorName` not editable on visit form

**ID:** A-FRONT-1  
**Severity:** Major  
**Cross-ref:** Prior **M-4** (still open)  
**File:** `frontend/src/pages/VisitDetailPage.tsx`  
**Line:** 215, 288, 620 (only `bf_rms_vendor_present`)  
**Evidence:**
```typescript
bf_rms_vendor_present: v.branch.rmsVendorPresent,
// PATCH sends rmsVendorPresent only — no rmsVendorName
```
**Problem:** Branch master and `branch_facility` PATCH schema include `rmsVendorName` (`visits.ts` 408), but the visit UI never binds it.  
**Risk:** RMS vendor name cannot be captured/updated during visits.  
**Recommended fix:** Add `Form.Item` for vendor name when `rmsVendorPresent` is true; include in `branch_facility` patch.

---

### Minor · DB · Missing index on `visit_scores.subcategory_id` FK

**ID:** A-DB-1  
**Severity:** Minor  
**File:** `backend/prisma/schema.prisma`  
**Line:** 340–355  
**Evidence:**
```prisma
subcategory AssessmentSubcategory @relation(fields: [subcategoryId], references: [id], onDelete: Restrict)
// no @@index([subcategoryId])
```
**Problem:** FK to `assessment_subcategories` with `ON DELETE RESTRICT` has no supporting index (init migration lines 313–316).  
**Risk:** Slow deletes/updates on subcategories; slow joins filtering by subcategory.  
**Recommended fix:** `CREATE INDEX ON visit_scores(subcategory_id);`

---

### Minor · DB · No CHECK constraints on bounded integers

**ID:** A-DB-2  
**Severity:** Minor  
**File:** `backend/prisma/schema.prisma`  
**Line:** 237, 251, 271, 345, 394  
**Evidence:**
```prisma
quarterNumber Int      @map("quarter_number")  // no @db check
displayOrder   Int      @map("display_order")   // categories/subs
scoreGiven     Int?     @map("score_given")     // no CHECK (scoreGiven >= 0)
```
**Problem:** Ranges enforced only in Zod (`visits.ts` 137: `min(0).max(10)`), not in DB.  
**Risk:** Bad data via scripts/migrations bypassing API.  
**Recommended fix:** Add PostgreSQL `CHECK` constraints matching API rules.

---

### Minor · DB · Aggressive ON DELETE CASCADE from `users`

**ID:** A-DB-3  
**Severity:** Minor  
**File:** `backend/prisma/migrations/20250510192700_init/migration.sql`  
**Line:** 286, 325; `schema.prisma` lines 102, 146, 436  
**Evidence:**
```sql
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
-- audit_logs.actor_id, scorecard_audit_log.changed_by, sfh → visits cascade chain
```
**Problem:** Hard-deleting a user cascades to SFH, visits, scores, snapshots, audit rows. App uses soft-delete (`isActive`) for users/branches, but DB allows destructive cascade.  
**Risk:** Accidental `DELETE FROM users` in admin tooling destroys visit history.  
**Recommended fix:** Prefer `RESTRICT` on audit/visit FKs; restrict hard deletes to maintenance scripts.

---

### Minor · DB · Unbounded growth tables without archive policy

**ID:** A-DB-4  
**Severity:** Minor  
**File:** `backend/prisma/schema.prisma`  
**Line:** 137–149, 426–440  
**Evidence:**
```prisma
model AuditLog { /* no retention */ @@map("audit_logs") }
model ScorecardAuditLog { /* no retention */ @@map("scorecard_audit_log") }
```
**Problem:** No partition, TTL, or archive strategy documented or implemented.  
**Risk:** Table bloat over years of visits and scorecard edits.  
**Recommended fix:** Retention job, partitioning by `created_at`, or export-and-truncate policy.

---

### Minor · DB · `branch_staff` enum value unused in application

**ID:** A-DB-5  
**Severity:** Minor  
**File:** `backend/prisma/schema.prisma`  
**Line:** 10–14  
**Evidence:**
```prisma
enum UserRole {
  supervisor
  sfh
  branch_staff
}
```
**Problem:** Grep shows no runtime use of `branch_staff` outside schema/README; dashboard rejects unknown roles (`DashboardPage.tsx` 124).  
**Risk:** Dead enum value; confusion if set via `POST /users`.  
**Recommended fix:** Remove enum value or implement branch_staff flows end-to-end.

---

### Minor · API · `GET /visits` unbounded with in-memory filters

**ID:** A-API-4  
**Severity:** Minor  
**File:** `backend/src/routes/visits.ts`  
**Line:** 57–84  
**Evidence:**
```typescript
let visits = await prisma.branchVisit.findMany({ /* no take/skip */ });
if (status !== undefined) visits = visits.filter((v) => v.isSubmitted === status);
if (scoreBandRaw) visits = visits.filter((v) => v.scoreSnapshot?.scoreBand === scoreBandRaw);
```
**Problem:** Loads all matching visits, then filters status/band in Node.  
**Risk:** Memory/response size growth as visits accumulate.  
**Recommended fix:** Push `isSubmitted` and `scoreSnapshot.scoreBand` into Prisma `where`; add pagination.

---

### Minor · API · `GET /edit-requests` unbounded

**ID:** A-API-5  
**Severity:** Minor  
**File:** `backend/src/routes/editRequests.ts`  
**Line:** 29–35, 40–44  
**Evidence:**
```typescript
const requests = await prisma.visitEditRequest.findMany({
  orderBy: { createdAt: "desc" },
  /* no take */
});
```
**Problem:** Supervisors receive full history with no pagination.  
**Risk:** Slow list UI over time.  
**Recommended fix:** `take`/`skip` query params with sensible defaults.

---

### Minor · API · Report list endpoints unbounded

**ID:** A-API-6  
**Severity:** Minor  
**File:** `backend/src/routes/reports.ts`  
**Line:** 65–80, 244–264, 331–346  
**Evidence:**
```typescript
const visits = await prisma.branchVisit.findMany({ /* visited-branches — no take */ });
const issues = await prisma.visitIssue.findMany({ /* issues-summary — no take */ });
```
**Problem:** All matching rows loaded for PDF/Excel generation.  
**Risk:** OOM/timeouts on large orgs.  
**Recommended fix:** Streaming export, pagination, or async job for large reports.

---

### Minor · API · `GET /issues/export` unbounded

**ID:** A-API-7  
**Severity:** Minor  
**File:** `backend/src/routes/issuesExport.ts`  
**Line:** 25–40  
**Evidence:**
```typescript
const issues = await prisma.visitIssue.findMany({
  where: { /* sfh scoped */ },
  orderBy: { createdAt: "desc" },
});
```
**Problem:** No row limit on SFH issue export.  
**Risk:** Large XLSX for active SFHs.  
**Recommended fix:** Cap rows or require date/quarter filters.

---

### Minor · API · `GET /users` returns all supervisors/staff

**ID:** A-API-8  
**Severity:** Minor  
**File:** `backend/src/routes/users.ts`  
**Line:** 24–35  
**Evidence:**
```typescript
const users = await prisma.user.findMany({
  orderBy: { createdAt: "desc" },
  select: { id: true, name: true, email: true, role: true, /* ... */ },
});
```
**Problem:** Unbounded list (supervisor-only route).  
**Risk:** Minor performance issue at scale.  
**Recommended fix:** Pagination.

---

### Minor · API · `POST /users` accepts `role` from request body

**ID:** A-API-9  
**Severity:** Minor  
**File:** `backend/src/routes/users.ts`  
**Line:** 15–19, 44–54  
**Evidence:**
```typescript
const createUserSchema = z.object({
  role: z.nativeEnum(UserRole),
});
// ...
role: body.role,
```
**Problem:** Any supervisor can create another `supervisor` account (only `sfh` is rejected). Role is taken from body, not session.  
**Risk:** Privilege proliferation if supervisor accounts are compromised.  
**Recommended fix:** Restrict creatable roles via config; require elevated approval for new supervisors.

---

### Minor · API · Non-structured submit validation error

**ID:** A-API-10  
**Severity:** Minor  
**File:** `backend/src/routes/visits.ts`  
**Line:** 341  
**Evidence:**
```typescript
if (scoreErrors.length > 0) throw new HttpError(JSON.stringify({ error: "Incomplete scores", details: scoreErrors }), 422);
```
**Problem:** Error details are JSON-stringified into `HttpError.message`, not `details` field.  
**Risk:** Frontend receives opaque string; harder to map field errors.  
**Recommended fix:** `throw new HttpError("Incomplete scores", 422, { details: scoreErrors })`.

---

### Minor · Auth · JWT payload role cast with `as never`

**ID:** A-AUTH-9  
**Severity:** Minor  
**File:** `backend/src/middleware/authenticate.ts`  
**Line:** 21  
**Evidence:**
```typescript
req.user = { id: payload.sub, role: payload.role as never, email: payload.email, name: payload.name };
```
**Problem:** Bypasses `UserRole` typing; invalid role strings pass until a handler checks.  
**Risk:** Unexpected 403s or logic gaps if token tampered (signature should prevent this).  
**Recommended fix:** `z.nativeEnum(UserRole).parse(payload.role)`.

---

### Minor · Auth · `POST /visits/:id/unlock-date` has no visit-level guard

**ID:** A-AUTH-10  
**Severity:** Minor  
**File:** `backend/src/routes/visits.ts`  
**Line:** 369–377  
**Evidence:**
```typescript
router.post("/:id/unlock-date", requireRoles(UserRole.supervisor), async (req, res, next) => {
  const visit = await prisma.branchVisit.findUnique({ where: { id }, select: { id: true, visitDateActual: true } });
  if (!visit) throw new HttpError("Not found", 404);
```
**Problem:** Any supervisor can unlock any visit by UUID; no `assertVisitReadable` or org-scope check.  
**Risk:** May be intentional; if not, cross-SFH supervisor access.  
**Recommended fix:** Confirm product rule; add audit + optional SFH scope if needed.

---

### Minor · PDF · Unsafe type cast in visit PDF loader

**ID:** A-PDF-2  
**Severity:** Minor  
**Cross-ref:** Prior **M-3** (still open)  
**File:** `backend/src/services/visitReportLoader.service.ts`  
**Line:** 26  
**Evidence:**
```typescript
return { ...(visit as unknown as VisitPdfModel), utilityByQ: byQ };
```
**Problem:** Skips compile-time validation that visit shape matches `VisitPdfModel`.  
**Risk:** Runtime PDF render errors if query shape drifts.  
**Recommended fix:** Map fields explicitly or align `queryVisitDetailOrThrow` return type with `VisitPdfModel`.

---

### Minor · Frontend · No return-URL after login

**ID:** A-FRONT-2  
**Severity:** Minor  
**File:** `frontend/src/pages/LoginPage.tsx`  
**Line:** 22  
**Evidence:**
```typescript
navigate("/dashboard", { replace: true });
```
**Problem:** `RequireAuth` redirects to `/login` without storing `location.state.from`.  
**Risk:** Deep links to `/visits/:id` lost after login.  
**Recommended fix:** `Navigate to="/login" state={{ from: location }}` and post-login `navigate(from)`.

---

### Minor · Frontend · Catch-all route sends unknown paths to dashboard

**ID:** A-FRONT-3  
**Severity:** Minor  
**File:** `frontend/src/App.tsx`  
**Line:** 64  
**Evidence:**
```tsx
<Route path="*" element={<Navigate to="/dashboard" replace />} />
```
**Problem:** No dedicated 404 page; invalid URLs look like success redirect.  
**Risk:** UX confusion; harder to detect broken links.  
**Recommended fix:** `NotFound` route with 404 messaging.

---

### Minor · Frontend · Supervisor nav hidden only in UI

**ID:** A-FRONT-4  
**Severity:** Minor  
**File:** `frontend/src/components/AppLayout.tsx`  
**Line:** 74–81  
**Evidence:**
```typescript
const supervisorItems =
  me?.role === "supervisor"
    ? [ /* /sfhs, /branches, /scorecard */ ]
    : [];
```
**Problem:** SFH can still hit `/scorecard` if they know the URL unless `RequireSupervisor` blocks (it does — `RequireSupervisor.tsx`). Routes `/sfhs`, `/branches` are behind `RequireSupervisor` — **OK**.  
**Risk:** Low for protected routes; pattern still relies on layout hiding for discoverability only.  
**Recommended fix:** Already mitigated by `RequireSupervisor`; document as defense-in-depth OK.

---

### Minor · Frontend · Decimal `scorePercentage` cast through `Number` / `fmtPct`

**ID:** A-TYPE-1  
**Severity:** Minor  
**File:** `frontend/src/pages/VisitsPage.tsx`  
**Line:** 265; `frontend/src/components/ui.tsx` 196–199  
**Evidence:**
```typescript
{fmtPct(r.scoreSnapshot.scorePercentage as number)}
// fmtPct: const n = typeof v === "string" ? parseFloat(v) : v;
```
**Problem:** Prisma JSON serializes `Decimal` as string; casting to `number` can lose precision for edge decimals (usually 2 dp OK).  
**Risk:** Minor display drift for very precise decimals.  
**Recommended fix:** Keep as string in types; format from string without float conversion.

---

### Minor · Type safety · `ScoreBandBadge` / `bandColor` non-exhaustive enum handling

**ID:** A-TYPE-2  
**Severity:** Minor  
**File:** `frontend/src/components/ui.tsx`  
**Line:** 20–22, 209–211  
**Evidence:**
```typescript
const cfg = BAND_CONFIG[band as ScoreBandType];
return cfg?.dot ?? "#6B7280";
```
**Problem:** New DB enum value `not_applicable` is in `ScoreBandType`, but unknown future values fall back silently.  
**Risk:** Low; acceptable fallback.  
**Recommended fix:** `default` branch logging unknown band in dev.

---

### Minor · Error handling · No machine-readable error `code` field

**ID:** A-ERR-1  
**Severity:** Minor  
**File:** `backend/src/middleware/errorHandler.ts`  
**Line:** 14–18, 48–50  
**Evidence:**
```typescript
const body: Record<string, unknown> = { error: err.message };
// 500: { error: "Internal server error" }
```
**Problem:** Clients only get `error` string (and optional `details`/`stack` in debug).  
**Risk:** Harder client i18n and automated handling.  
**Recommended fix:** Add stable `code` enum (e.g. `VISIT_LOCKED`, `VALIDATION_FAILED`).

---

### Minor · Error handling · No per-request correlation ID

**ID:** A-ERR-2  
**Severity:** Minor  
**File:** `backend/src/lib/securityLog.ts`  
**Line:** 22–33  
**Evidence:**
```typescript
console.log(JSON.stringify({ ts, type, ...rest, ...(req ? { ip, path, method } : {}) }));
```
**Problem:** Logs lack `requestId`; not returned in response headers.  
**Risk:** Hard to trace user-reported failures across log lines.  
**Recommended fix:** Middleware generating `X-Request-Id` (UUID) attached to all logs.

---

### Minor · Schema · `visitType` has no `@default` in Prisma

**ID:** A-DB-6  
**Severity:** Minor  
**Cross-ref:** Prior **M-5** (mitigated in app)  
**File:** `backend/prisma/schema.prisma`  
**Line:** 291  
**Evidence:**
```prisma
visitType VisitType @map("visit_type")  // required, no @default
```
**Problem:** Raw SQL inserts must supply `visit_type`.  
**Risk:** Low — `createVisitDraft` sets `physical` (`visit.service.ts` 93).  
**Recommended fix:** `@default(physical)` in schema for defense in depth.

---

### Informational · Env · Dev JWT secrets in `docker-compose.yml`

**ID:** A-ENV-1  
**Severity:** Informational  
**File:** `docker-compose.yml`  
**Line:** 24–25  
**Evidence:**
```yaml
JWT_SECRET: dev-access-secret-change-in-production-at-least-32-chars
JWT_REFRESH_SECRET: dev-refresh-secret-change-production-min-thirty-two
```
**Problem:** Example secrets committed for local Compose (labeled replace in prod).  
**Risk:** Accidental prod deploy without override.  
**Recommended fix:** Use `.env` + secrets manager; never reuse compose defaults in prod.

---

### Informational · Schema · `PasswordResetToken` / `EmailVerificationToken` have no API routes

**ID:** A-ENV-2  
**Severity:** Informational  
**File:** `backend/prisma/schema.prisma`  
**Line:** 110–134  
**Evidence:**
```prisma
model PasswordResetToken { /* ... */ }
model EmailVerificationToken { /* ... */ }
```
**Problem:** Tables and `forgotPasswordLimiter` exist; no routes call them (supervisor email reset / verify not implemented). SFH reset uses `SfhPasswordResetRequest` queue.  
**Risk:** Dead schema complexity.  
**Recommended fix:** Implement flows or remove unused models/limiters.

---

### Informational · API · Backend report routes unused by frontend

**ID:** A-FEAT-1  
**Severity:** Informational  
**File:** `backend/src/routes/reports.ts` (entire file)  
**Line:** 58–396  
**Evidence:** Grep of `frontend/` shows no `/reports/` API calls.  
**Problem:** Four report endpoints exist with no UI consumer.  
**Risk:** Untested in production UI; bitrot.  
**Recommended fix:** Wire dashboard export buttons or remove routes.

---

### Informational · API · `GET /issues/export` unused by frontend

**ID:** A-FEAT-2  
**Severity:** Informational  
**File:** `backend/src/routes/issuesExport.ts`  
**Line:** 13  
**Evidence:** No frontend references to `/issues/export`.  
**Problem:** Orphan export endpoint.  
**Risk:** Same as A-FEAT-1.  
**Recommended fix:** Add UI download or deprecate.

---

### Informational · API · AI placeholder endpoint

**ID:** A-FEAT-3  
**Severity:** Informational  
**File:** `backend/src/routes/ai.ts`  
**Line:** 9–10  
**Evidence:**
```typescript
res.status(501).json({ error: "AI generation is not configured." });
```
**Problem:** Authenticated stub always 501.  
**Risk:** None if unused.  
**Recommended fix:** Remove from production router until implemented.

---

### Informational · Auth · Logout does not revoke refresh tokens

**ID:** A-AUTH-11  
**Severity:** Informational  
**File:** `backend/src/routes/auth.ts`  
**Line:** 150–152  
**Evidence:**
```typescript
router.post("/logout", (req, res) => {
  securityLog("auth_logout", { req });
  res.status(204).send();
});
```
**Problem:** Client clears localStorage; server cannot invalidate outstanding refresh JWTs.  
**Risk:** Stolen refresh works after logout until expiry.  
**Recommended fix:** Server-side refresh token store with revoke on logout.

---

### Informational · DB · FY uses 3 quarters per year in bootstrap

**ID:** A-DB-7  
**Severity:** Informational  
**File:** `backend/src/services/quarterBootstrap.service.ts`  
**Line:** 15–39  
**Evidence:**
```typescript
return [
  { quarterNumber: 1, startDate: new Date(Date.UTC(y, 3, 1)), /* Apr–Jun */ },
  { quarterNumber: 2, /* Jul–Sep */ },
  { quarterNumber: 3, /* Oct–Mar */ },
];
```
**Problem:** Product models Indian FY as three fiscal quarters (not four calendar quarters). Utility/PDF/dashboard treat “Q4” inconsistently (see C-2).  
**Risk:** Terminology confusion only if stakeholders expect four quarters.  
**Recommended fix:** Document “3 quarters per FY” in product spec; remove Q4 references from UI labels.

---

## Endpoint Inventory

Base prefix: `/api/v1` (rate-limited). Global: `GET /health` (no auth).

| Method | Path | Auth | Role (middleware) | Handler file | Line |
|--------|------|------|-------------------|--------------|------|
| POST | `/auth/login` | No | — | `routes/auth.ts` | 42 |
| POST | `/auth/refresh` | No | — | `routes/auth.ts` | 122 |
| POST | `/auth/logout` | No | — | `routes/auth.ts` | 150 |
| GET | `/auth/me` | Bearer | — | `routes/auth.ts` | 155 |
| POST | `/auth/sfh/request-password-reset` | No | — | `routes/auth.ts` | 181 |
| GET | `/users` | Bearer | supervisor | `routes/users.ts` | 22 |
| POST | `/users` | Bearer | supervisor | `routes/users.ts` | 42 |
| PATCH | `/users/:id` | Bearer | supervisor | `routes/users.ts` | 75 |
| DELETE | `/users/:id` | Bearer | supervisor | `routes/users.ts` | 92 |
| GET | `/sfhs` | Bearer | supervisor | `routes/sfhs.ts` | 69 |
| GET | `/sfhs/generate-password` | Bearer | supervisor | `routes/sfhs.ts` | 118 |
| GET | `/sfhs/password-reset-requests` | Bearer | supervisor | `routes/sfhs.ts` | 122 |
| POST | `/sfhs/password-reset-requests/:requestId/fulfill` | Bearer | supervisor | `routes/sfhs.ts` | 153 |
| POST | `/sfhs/:id/regenerate-password` | Bearer | supervisor | `routes/sfhs.ts` | 202 |
| GET | `/sfhs/:id/supervisor-password` | Bearer | supervisor | `routes/sfhs.ts` | 239 |
| POST | `/sfhs` | Bearer | supervisor | `routes/sfhs.ts` | 273 |
| PATCH | `/sfhs/:id` | Bearer | supervisor | `routes/sfhs.ts` | 332 |
| GET | `/branches` | Bearer | handler | `routes/branches.ts` | 223 |
| POST | `/branches` | Bearer | supervisor | `routes/branches.ts` | 256 |
| POST | `/branches/bulk-upload` | Bearer | supervisor | `routes/branches.ts` | 266 |
| GET | `/branches/unmapped` | Bearer | supervisor | `routes/branches.ts` | 371 |
| GET | `/branches/:id` | Bearer | handler | `routes/branches.ts` | 388 |
| PATCH | `/branches/:id` | Bearer | supervisor | `routes/branches.ts` | 436 |
| DELETE | `/branches/:id` | Bearer | supervisor | `routes/branches.ts` | 569 |
| GET | `/mappings` | Bearer | handler | `routes/mappings.ts` | 24 |
| GET | `/mappings/current` | Bearer | handler | `routes/mappings.ts` | 99 |
| POST | `/mappings` | Bearer | supervisor | `routes/mappings.ts` | 131 |
| PATCH | `/mappings/:id/approve` | Bearer | supervisor | `routes/mappings.ts` | 194 |
| PATCH | `/mappings/:id/reject` | Bearer | supervisor | `routes/mappings.ts` | 233 |
| GET | `/quarters` | Bearer | any authenticated | `routes/quarters.ts` | 9 |
| GET | `/quarters/current` | Bearer | any authenticated | `routes/quarters.ts` | 18 |
| GET | `/categories` | Bearer | any authenticated | `routes/categories.ts` | 62 |
| POST | `/categories` | Bearer | supervisor | `routes/categories.ts` | 82 |
| PATCH | `/categories/reorder` | Bearer | supervisor | `routes/categories.ts` | 114 |
| PATCH | `/categories/:id` | Bearer | supervisor | `routes/categories.ts` | 134 |
| DELETE | `/categories/:id` | Bearer | supervisor | `routes/categories.ts` | 216 |
| POST | `/categories/:categoryId/subcategories` | Bearer | supervisor | `routes/categories.ts` | 249 |
| PATCH | `/categories/:categoryId/subcategories/reorder` | Bearer | supervisor | `routes/categories.ts` | 310 |
| PATCH | `/categories/:categoryId/subcategories/:subId` | Bearer | supervisor | `routes/categories.ts` | 346 |
| DELETE | `/categories/:categoryId/subcategories/:subId` | Bearer | supervisor | `routes/categories.ts` | 425 |
| GET | `/visits` | Bearer | handler | `routes/visits.ts` | 26 |
| POST | `/visits` | Bearer | sfh | `routes/visits.ts` | 92 |
| GET | `/visits/:id/scores` | Bearer | readable* | `routes/visits.ts` | 114 |
| PUT | `/visits/:id/scores` | Bearer | sfh + draft | `routes/visits.ts` | 143 |
| GET | `/visits/:id/issues` | Bearer | readable* | `routes/visits.ts` | 176 |
| POST | `/visits/:id/issues` | Bearer | sfh + draft | `routes/visits.ts` | 195 |
| PATCH | `/visits/:id/issues/:issueId` | Bearer | sfh + draft | `routes/visits.ts` | 216 |
| DELETE | `/visits/:id/issues/:issueId` | Bearer | sfh + draft | `routes/visits.ts` | 254 |
| GET | `/visits/:id/pdf` | Bearer | readable* | `routes/visits.ts` | 267 |
| GET | `/visits/:id/excel` | Bearer | readable* | `routes/visits.ts` | 281 |
| GET | `/visits/:id/issues-excel` | Bearer | readable* | `routes/visits.ts` | 295 |
| POST | `/visits/:id/submit` | Bearer | sfh + draft | `routes/visits.ts` | 324 |
| POST | `/visits/:id/unlock-date` | Bearer | supervisor | `routes/visits.ts` | 369 |
| PATCH | `/visits/:id` | Bearer | sfh + draft | `routes/visits.ts` | 456 |
| GET | `/visits/:id` | Bearer | readable* | `routes/visits.ts` | 564 |
| GET | `/utility` | Bearer | handler | `routes/utility.ts` | 13 |
| POST | `/utility` | Bearer | handler | `routes/utility.ts` | 61 |
| PATCH | `/utility/:id` | Bearer | handler | `routes/utility.ts` | 102 |
| GET | `/dashboard/sfh` | Bearer | sfh | `routes/dashboard.ts` | 115 |
| GET | `/dashboard/sfh/:sfhId` | Bearer | supervisor | `routes/dashboard.ts` | 133 |
| GET | `/dashboard/supervisor` | Bearer | supervisor | `routes/dashboard.ts` | 149 |
| GET | `/reports/visited-branches` | Bearer | handler | `routes/reports.ts` | 58 |
| GET | `/reports/pending-branches` | Bearer | handler | `routes/reports.ts` | 142 |
| GET | `/reports/issues-summary` | Bearer | handler | `routes/reports.ts` | 234 |
| GET | `/reports/yearly-summary` | Bearer | handler | `routes/reports.ts` | 303 |
| GET | `/issues/export` | Bearer | sfh | `routes/issuesExport.ts` | 13 |
| POST | `/ai/generate` | Bearer | any | `routes/ai.ts` | 9 |
| GET | `/edit-requests` | Bearer | handler | `routes/editRequests.ts` | 25 |
| POST | `/edit-requests` | Bearer | sfh | `routes/editRequests.ts` | 55 |
| PATCH | `/edit-requests/:id/approve` | Bearer | supervisor | `routes/editRequests.ts` | 92 |
| PATCH | `/edit-requests/:id/reject` | Bearer | supervisor | `routes/editRequests.ts` | 135 |

\*Readable = `assertVisitReadable` in handler (supervisor: any visit; SFH: own visits).

**Route ordering:** `PATCH /categories/reorder` before `/:id`; `GET /branches/unmapped` before `/:id`; `PATCH .../subcategories/reorder` before `/:subId` — correct.

**Duplicate routes:** None registered twice.

**Public endpoints:** `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/sfh/request-password-reset`.

---

## Frontend Route Inventory

| Path | Component | Auth required | Role required |
|------|-----------|---------------|---------------|
| `/login` | `LoginPage` | No | — |
| `/request-password-reset` | `RequestPasswordResetPage` | No | — |
| `/dashboard` | `DashboardPage` | Yes (`RequireAuth`) | sfh or supervisor (handler) |
| `/visits` | `VisitsPage` | Yes | sfh or supervisor |
| `/visits/:id` | `VisitDetailPage` | Yes | sfh or supervisor (API enforces) |
| `/sfhs` | `SfhManagementPage` | Yes | supervisor (`RequireSupervisor`) |
| `/branches` | `BranchesManagementPage` | Yes | supervisor |
| `/scorecard` | `ScorecardPage` | Yes | supervisor |
| `/mappings` | Redirect → `/branches` | Yes | supervisor (if navigated) |
| `/` | Redirect → `/dashboard` | — | — |
| `*` | Redirect → `/dashboard` | — | — |

**Unguarded sensitive routes:** None under `RequireAuth` without login. Supervisor routes double-guarded with `RequireSupervisor`.

**Dead routes:** `/mappings` redirect only.

**Missing frontend for backend features:** `/reports/*`, `/issues/export`, `/ai/generate`, `/utility` standalone UI (utility may be embedded in visit flow only).

---

## Query Inventory

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `routes/visits.ts` | 57 | `branchVisit.findMany` no `take` | Unbounded visit list |
| `routes/visits.ts` | 147 | `visitScore.findMany` per visit | OK (scoped to one visit) |
| `routes/editRequests.ts` | 29, 40 | `visitEditRequest.findMany` | Unbounded |
| `routes/users.ts` | 24 | `user.findMany` | Unbounded |
| `routes/branches.ts` | 250, 378 | `branch.findMany` | All branches for role |
| `routes/reports.ts` | 65, 244, 331 | `findMany` in reports | Unbounded export |
| `routes/reports.ts` | 167–179 | **N+1** loop `findUnique` + `findFirst` | Performance |
| `routes/issuesExport.ts` | 25 | `visitIssue.findMany` | Unbounded |
| `routes/dashboard.ts` | 154–162 | `for` + `buildSfhStatRow` each SFH | N×queries per SFH |
| `routes/sfhs.ts` | 93 | `stateFacilityHead.findMany` | All SFHs |
| `routes/mappings.ts` | 32, 85, 102 | `sfhBranchMapping.findMany` | Unbounded |
| `routes/categories.ts` | 64 | `assessmentCategory.findMany` + subs | Scorecard size bounded |
| `services/scoreCalculation.service.ts` | 15 | `visitScore.findMany` + include | Per visit OK |
| `services/visit.service.ts` | 82 | `assessmentSubcategory.findMany` | Active subs only |
| `routes/quarters.ts` | 11 | `quarter.findMany` | ~12 rows |

**Missing `select` exposing `passwordHash`:** None in API responses (login reads hash internally only).

**Multi-table writes without `$transaction`:**

| File | Line | Operation |
|------|------|-----------|
| `routes/categories.ts` | 159–192 | Category version: `create` then separate `updateMany`/`update` (race possible) |
| `routes/visits.ts` | 343–348 | Submit: `update` visit then `recalculateScoreSnapshot` (separate) |

**Raw SQL:** `categories.ts` 326 — tagged template (safe).

**Soft-delete leakage (`is_active`):** `branches` list respects `isActive` for SFH; supervisor can pass `includeInactive`. `assessmentCategory.findMany` filters `isActive: true` on GET. `assessmentSubcategory` filtered in category GET.

---

## Formula Verification

| Location | Formula | Status |
|----------|---------|--------|
| `scoreCalculation.service.ts` 45 | `max <= 0 ? 0 : round(earned*10000/max)/100` (category) | OK |
| `scoreCalculation.service.ts` 50–51 | `maxTotal <= 0 ? null : round(earnedTotal*10000/maxTotal)/100` | OK (C-3 fixed) |
| `scoreCalculation.service.ts` 4–9 | `bandFromPct` thresholds 90/80/70/60 | OK — single source |
| `scoreCalculation.service.ts` 52 | `maxTotal <= 0 ? "not_applicable" : bandFromPct(...)` | OK |
| `routes/dashboard.ts` 72, 173 | `round(x*10000/total)/100` | OK (guarded `total === 0`) |
| `pdfGeneration.service.ts` 450 | Displays snapshot `scorePercentage` | OK (immutable snapshot) |
| `routes/reports.ts` | Uses `scoreSnapshot.scorePercentage` string | OK |
| Frontend `fmtPct` | `parseFloat` + 1 decimal | OK for display |
| **Duplicate `bandFromPct`** | No other implementations found | OK |

**`recalculateScoreSnapshotForVisit` call sites:** `visits.ts` 168 (after score PUT), 348 (after submit). No other `visitScore` writers — **complete**.

**Edge cases:**

- `maxTotal = 0`: null % + `not_applicable` band — OK.
- `earned > max`: capped in service line 30 — OK.
- Negative `score_given`: blocked by Zod `min(0)` on PUT — OK at API; no DB CHECK.

---

## Type Safety Inventory

| Kind | File | Line | Notes |
|------|------|------|-------|
| `as unknown as` | `backend/src/lib/prisma.ts` | 4 | Prisma singleton pattern — intentional |
| `as unknown as` | `backend/src/services/visitReportLoader.service.ts` | 26 | PDF model bypass — **M-3** |
| `as never` | `backend/src/middleware/authenticate.ts` | 21 | JWT role — see A-AUTH-9 |
| `any` explicit | — | — | **None found** in `*.ts` / `*.tsx` |
| `!` non-null | `routes/visits.ts`, `categories.ts`, etc. | many | After `authenticate` — `req.user!` assumed |
| `unknown` + cast | `VisitDetailPage.tsx` | 60, 91, 493 | `scorePercentage as number` |
| `unknown` + cast | `VisitsPage.tsx` | 18, 265 | `scorePercentage as number` |
| `tsc --noEmit` | backend + frontend | — | **0 errors** (2026-05-16 run) |

**Prisma `Decimal` fields (schema):** `carpetAreaSqft`, `upsCapacityKva`, `acTonnage`, `electricityLoadKw`, `dgCapacityKva`, `weightPercent`, `weightWithinCategory`, `previousVisitScore`, `electricityLastQuarter`, utility amounts, `scorePercentage` — JSON API returns strings; frontend sometimes coerces to number (see A-TYPE-1).

---

## Open Questions

1. **Quarters per FY:** Is the product intentionally **3 quarters** per Indian FY (`quarterBootstrap.service.ts`), or should a fourth quarter exist? This determines whether C-2/M-6 are bugs or spec mismatches.
2. **Migration apply order:** Static review only — confirm `npx prisma migrate deploy` succeeds on a fresh DB and on production from `20250510192700_init` through `20260516140000_scorecard_audit_log_and_score_band_update` in CI.
3. **`POST /visits/:id/unlock-date`:** Should supervisors be able to unlock **any** visit org-wide, or only visits in their oversight scope?
4. **`PasswordResetToken` / email verification:** Planned for supervisor email login or deprecated?
5. **Prior audit document:** No file named “Branch Visit Tracker — Complete Audit Log” was found in-repo; cross-reference used `SCORING_SCHEMA.md` bug section only.
6. **Refresh token storage:** Is stateless JWT refresh acceptable for threat model, or is server-side session store required for compliance?
7. **Reports API:** Keep for future dashboard exports or remove to reduce attack surface?

---

*End of report. No code, schema, or configuration was modified during this audit.*
