# Audit Remediation Summary — 2026-05-16

All 47 findings from `AUDIT_REPORT_2026-05-16.md` were addressed in code. Apply the new migration before deploy:

```bash
cd backend && npx prisma migrate deploy
```

## Critical (A-AUTH-1 … A-AUTH-3)

| ID | Fix |
|----|-----|
| A-AUTH-1 | Opaque refresh tokens in `refresh_sessions` table; rotation revokes prior token; reuse detection revokes family |
| A-AUTH-2 | HttpOnly cookies for access + refresh; in-memory access token on client; `credentials: "include"` on all API calls; removed `localStorage` token storage |
| A-AUTH-3 | CORS never uses reflective `origin: true`; dev defaults to localhost origins; production still requires `ALLOWED_ORIGINS` |

## Major

| ID | Fix |
|----|-----|
| A-API-1 / C-2 | Product uses **3 quarters per FY** (not calendar Q4). Utility API remains `max(3)` aligned with bootstrap |
| A-PDF-1 | `loadVisitPdfModel` loads utilities for all FY quarters from DB; PDF table columns are dynamic |
| A-BIZ-1 / M-6 | Dashboard `quarterly_breakdown` keys from DB quarter labels; frontend chart uses `Object.entries` |
| A-QUERY-1 / M-2 | Pending-branches report: single batched `branch.findMany` with mappings |
| A-BIZ-2 | Dashboard `avg_score` excludes null `score_percentage` |
| A-EXPORT-1 | `sanitizeExcelCellValue` on all Excel data cells |
| A-AUTH-4–8 | `requireSfhOrSupervisor` middleware on visits list, utility, reports, edit-requests, mappings |
| A-API-2–3 | Audit logs on category/subcategory reorder |
| A-FRONT-1 / M-4 | RMS vendor name field on visit form when RMS present |

## Minor / other

- Pagination (`limit`/`offset`, max 500) on visits, edit-requests, issues export, users list
- Structured error `code` + `requestId` on responses
- `visit_scores.subcategory_id` index + `visit_type` default `physical`
- `RefreshSession` model + migration `20260516180000_audit_remediation`
- Login redirect to original URL; 404 page; logout revokes refresh server-side
- `fmtPct` handles Decimal strings safely
- `POST /users` restricted to `branch_staff` role only
- Submit validation uses `HttpError` with `details` object
- PDF loader uses `queryVisitDetailForReport` (typed `include` graph) — resolves M-3 without unsafe cast
- JWT role validated with `z.nativeEnum(UserRole)` in authenticate middleware

## Verification

- `backend`: `npm run typecheck` — pass
- `frontend`: `npx tsc --noEmit` — pass

## Deploy notes

1. Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (≥32 chars); never use docker-compose dev defaults in production.
2. Set `ALLOWED_ORIGINS` to your SPA origin(s) with `credentials` support.
3. Run `npx prisma migrate deploy` on production DB.
4. Frontend and API must be same-site or CORS-configured with credentials (cookies).

## Intentionally unchanged (informational)

- **A-FEAT-1/2/3**: Report/AI endpoints remain; wire UI separately if needed.
- **A-DB-5**: `branch_staff` enum retained for future use.
- **A-ENV-2**: `PasswordResetToken` tables kept for future email flows.
- **Category reorder in-place**: Display order is not versioned (documented via audit logs); metadata edits still version.
