#!/bin/sh
set -eu

printf 'Vercel build environment: %s\n' "${VERCEL_ENV:-unknown}"

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Skipping non-production Vercel build. DTSC deploys production only."
  exit 0
fi

echo "Applying production Prisma migrations..."
pnpm prisma migrate deploy

pnpm build
