# Deploy: Render (API + DB) + Vercel (frontend)

This guide deploys the **backend** on [Render](https://render.com) (Docker + PostgreSQL) and the **frontend** on [Vercel](https://vercel.com). Pushing to GitHub can auto-deploy both.

---

## Prerequisites

- GitHub repo with this project
- Render account (Blueprint or manual Web Service)
- Vercel account linked to the same repo

---

## 1. Push to GitHub

Ensure migrations and lockfiles are committed:

```bash
git add .
git commit -m "Production deploy: Render + Vercel"
git push origin main
```

CI runs on push (`.github/workflows/ci.yml`): backend typecheck, secret scan, frontend build.

---

## 2. Render — database + API

### Option A: Blueprint (`render.yaml`)

1. Render Dashboard → **New** → **Blueprint**
2. Connect the GitHub repo
3. Render creates:
   - PostgreSQL `branch-tracker-db`
   - Web service `branch-visit-api` (Docker, `backend/Dockerfile`)
4. After first deploy, open the API service → **Environment** and set:
   - `ALLOWED_ORIGINS` = your Vercel production URL, e.g. `https://branch-visit-tracker.vercel.app`
   - Regenerate or set strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (min 32 chars each) if not using Blueprint secrets

`ALLOWED_ORIGIN_SUFFIXES=.vercel.app` is pre-set so **preview deployments** work with cookies + CORS.

### Option B: Manual

1. Create **PostgreSQL** → copy **Internal Database URL**
2. Create **Web Service** → Docker, root directory `backend`, Dockerfile path `Dockerfile`
3. Environment variables (minimum):

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | Render Postgres URL (add `?schema=public` if needed) |
| `JWT_SECRET` | 32+ random characters |
| `JWT_REFRESH_SECRET` | different 32+ random characters |
| `ALLOWED_ORIGINS` | `https://YOUR-APP.vercel.app` |
| `ALLOWED_ORIGIN_SUFFIXES` | `.vercel.app` |
| `COOKIE_SAME_SITE` | `none` |
| `ENFORCE_HTTPS` | `true` |
| `API_DEBUG` | `false` |

4. Health check path: `/health`
5. On deploy, the container runs `prisma migrate deploy` then starts the API.

**API URL example:** `https://branch-visit-api.onrender.com`

---

## 3. Vercel — frontend

1. Vercel → **Add New Project** → import the GitHub repo
2. **Root Directory:** `frontend`
3. Framework preset: **Vite** (or use `frontend/vercel.json`)
4. **Environment variables** (Production + Preview):

| Key | Value |
|-----|--------|
| `VITE_API_BASE_URL` | `https://YOUR-RENDER-SERVICE.onrender.com/api/v1` |

5. Deploy

`vercel.json` already sets SPA rewrites to `index.html`.

---

## 4. Wire CORS + cookies

1. Copy the Vercel **production** URL (e.g. `https://xxx.vercel.app` or your custom domain)
2. In Render → API service → Environment:
   - `ALLOWED_ORIGINS` = that URL (comma-separate multiple if needed, e.g. `https://app.example.com,https://www.app.example.com`)
   - **No trailing slash** — use `https://app.example.com` not `https://app.example.com/`
   - Custom domains **do not** match `.vercel.app` — you must add the exact custom URL here
3. Redeploy Render if you changed env vars

Auth uses **HttpOnly cookies** for refresh and **in-memory access JWT** for API calls.

### Recommended: same-origin API proxy (custom domains)

The frontend includes `middleware.ts` that proxies `/api/v1/*` to Render. This avoids CORS/cookie issues when you change Vercel domains.

**Vercel → Environment variables (Production):**

| Key | Value |
|-----|--------|
| `VITE_API_BASE_URL` | `/api/v1` |
| `BACKEND_API_ORIGIN` | `https://YOUR-SERVICE.onrender.com` (no `/api/v1` suffix) |

Then **Redeploy** Vercel (required — `VITE_*` is baked in at build time).

With the proxy, the browser calls `https://your-domain.com/api/v1/...` (same origin). Render `ALLOWED_ORIGINS` is still good practice but no longer blocks the main app flow.

### Alternative: direct cross-origin API

| Key | Value |
|-----|--------|
| `VITE_API_BASE_URL` | `https://YOUR-SERVICE.onrender.com/api/v1` |

Requires `ALLOWED_ORIGINS` on Render to exactly match your Vercel/custom domain and `COOKIE_SAME_SITE=none`.

---

## 4b. Custom domain on Vercel (troubleshooting)

If the site worked on `*.vercel.app` but not after adding a custom domain:

1. **Vercel → Domains** — confirm DNS shows **Valid** (not Pending)
2. **Redeploy Vercel** after any env change (`VITE_API_BASE_URL`, `BACKEND_API_ORIGIN`)
3. **Render `ALLOWED_ORIGINS`** — must include `https://your-custom-domain.com` (not just `.vercel.app`)
4. Use **`VITE_API_BASE_URL=/api/v1`** + **`BACKEND_API_ORIGIN`** (proxy mode above) — simplest fix
5. Browser DevTools → **Network** — if API calls go to `onrender.com` and fail with CORS, fix step 3 or switch to step 4

**Symptoms:**

| What you see | Likely cause |
|--------------|--------------|
| Vercel “This site can’t be reached” / DNS error | Domain DNS not pointed to Vercel yet |
| Blank page or infinite spinner | API URL wrong or CORS blocked |
| Login page loads, login fails | CORS or cookies (`COOKIE_SAME_SITE=none` on Render) |

---

## 5. First-time data (optional)

On Render **Shell** (or one-off job) with `DATABASE_URL` set:

```bash
cd /app
# Set SEED_SUPERVISOR_EMAIL + SEED_SUPERVISOR_PASSWORD in env first
npm run db:seed
```

**Do not** run seed on production if you already have live visit data.

---

## 6. Verify

```bash
# Health
curl https://YOUR-API.onrender.com/health

# From backend folder with production .env
npm run deploy:verify-env
npm run deploy:smoke
# Set SMOKE_LOGIN_EMAIL + SMOKE_LOGIN_PASSWORD for auth smoke test
```

Browser:

1. Open Vercel URL → login (supervisor email or SFH employee ID)
2. Dashboard, visits, SFH management, PDF export

---

## 7. Production checklist

- [ ] `API_DEBUG=false`
- [ ] `ALLOWED_ORIGINS` set to real Vercel URL
- [ ] `JWT_*` secrets are strong and unique
- [ ] Render Postgres backups enabled (paid plan) if required
- [ ] Users notified: **must log in again** after auth cookie deploy
- [ ] Visit data: migrations only — **no automatic data wipe**

---

## Docker Compose (single-server alternative)

For one host with nginx same-origin (`:8080`), use `docker compose up` and set `COOKIE_SAME_SITE=lax` instead of `none`.

See [README.md](README.md) for local Windows development.
