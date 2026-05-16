#!/bin/sh
set -e
if [ "$NODE_ENV" = "production" ]; then
  node scripts/verify-deployment-env.mjs
fi
npx prisma migrate deploy
exec node dist/app.js
