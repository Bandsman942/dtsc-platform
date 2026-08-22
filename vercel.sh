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
migration_attempt=1
migration_max_attempts=4
migration_retry_delay_seconds=5

while :; do
  migration_log="$(mktemp)"

  if pnpm prisma migrate deploy >"$migration_log" 2>&1; then
    cat "$migration_log"
    rm -f "$migration_log"
    break
  else
    migration_status=$?
  fi

  cat "$migration_log" >&2

  if ! grep -q "P1001" "$migration_log"; then
    rm -f "$migration_log"
    echo "Prisma migration failed with a non-retryable error." >&2
    exit "$migration_status"
  fi

  rm -f "$migration_log"

  if [ "$migration_attempt" -ge "$migration_max_attempts" ]; then
    echo "Prisma P1001 persisted after ${migration_max_attempts} attempts; aborting Production build." >&2
    exit "$migration_status"
  fi

  echo "Prisma P1001 on attempt ${migration_attempt}/${migration_max_attempts}; retrying in ${migration_retry_delay_seconds}s." >&2
  sleep "$migration_retry_delay_seconds"
  migration_attempt=$((migration_attempt + 1))
  migration_retry_delay_seconds=$((migration_retry_delay_seconds * 2))
done

pnpm build
