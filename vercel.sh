#!/bin/sh
set -eu

printf 'Vercel build environment: %s\n' "${VERCEL_ENV:-unknown}"

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Applying production Prisma migrations..."
  pnpm prisma migrate deploy
else
  echo "Skipping Prisma migrations outside Vercel production."
fi

pnpm build
