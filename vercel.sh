#!/bin/sh
set -eu

printf 'Vercel build environment: %s\n' "${VERCEL_ENV:-unknown}"
printf 'Vercel Git ref: %s\n' "${VERCEL_GIT_COMMIT_REF:-unknown}"

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Skipping non-production Vercel build. DTSC deploys production only."
  exit 0
fi

if [ "${VERCEL_GIT_COMMIT_REF:-}" != "main" ]; then
  echo "Skipping Production build outside main. DTSC Production is main-only."
  exit 0
fi

echo "Applying production Prisma migrations..."
pnpm prisma migrate deploy

pnpm build
