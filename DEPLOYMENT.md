# Deployment checklist

This repo does not store production secrets. Use your host’s secret manager or encrypted env files.

## 1. Backend environment

Copy `backend/.env.example` to `backend/.env` on the server and set:

- `DATABASE_URL` — PostgreSQL connection string  
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — each at least 32 characters, **different** values  
- `ALLOWED_ORIGINS` — comma-separated **exact** browser origins (scheme + host + port), e.g. `https://reports.example.com`  
- `NODE_ENV=production`  
- `API_DEBUG=false`  
- Behind TLS termination: keep default HTTPS enforcement, or set `ENFORCE_HTTPS=false` only if you fully understand the risk  

Validate (prints no secrets):

```bash
cd backend && npm run deploy:verify-env
```

## 2. Database migrations

```bash
cd backend && npx prisma migrate deploy
```

Docker: `docker-entrypoint.sh` already runs `prisma migrate deploy` before `node dist/app.js`.

## 3. Frontend build

Set the API URL the browser will call (no trailing slash on the base):

```bash
cd frontend
# Example: same host as SPA via reverse proxy
set VITE_API_BASE_URL=https://reports.example.com/api/v1
npm run build
```

Or use `frontend/.env.production` (do not commit real URLs if the repo is public). See `frontend/.env.production.example`.

## 4. Smoke tests

With the API running:

```bash
cd backend
set SMOKE_ORIGIN=http://127.0.0.1:3001
set SMOKE_API_BASE=http://127.0.0.1:3001/api/v1
npm run deploy:smoke
```

Optional login check (supervisor email + password):

```bash
set SMOKE_LOGIN_EMAIL=you@example.com
set SMOKE_LOGIN_PASSWORD=...
npm run deploy:smoke
```

Manually verify: supervisor and SFH login, visits list/detail, draft create/submit, exports you use, and mobile layout.

## 5. TLS and reverse proxy

Put the API behind HTTPS and forward `X-Forwarded-Proto: https` to Node. Example nginx (same host for SPA + `/api/`): `deploy/nginx.unified-tls.example.conf`.

## 6. Local full stack (Docker Compose)

```bash
docker compose up --build -d
```

- SPA: `http://localhost:8080`  
- API: `http://localhost:3001`  
- Compose sets `ALLOWED_ORIGINS` and `ENFORCE_HTTPS=false` for HTTP localhost  
