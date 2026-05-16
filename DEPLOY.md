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

1. Copy the Vercel **production** URL (e.g. `https://xxx.vercel.app`)
2. In Render → API service → Environment:
   - `ALLOWED_ORIGINS` = that URL (comma-separate multiple if needed)
3. Redeploy Render if you changed env vars

Auth uses **HttpOnly cookies** (`SameSite=None; Secure`) for refresh and **in-memory access JWT** for API calls — required for cross-origin Vercel → Render.

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
