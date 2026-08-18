# DTSC Platform — SCALE-1 Database Safety

Parent programme: #352  
Iteration: #354 / SCALE-1

## Purpose

This runbook defines the PostgreSQL/Neon connection, transaction and query-pressure contract used by DTSC Platform before staged capacity certification.

SCALE-1 does **not** claim that 5,000 simultaneous users are certified. It makes database pressure observable and establishes serverless-safe defaults so later load stages can measure a stable contract instead of an ambiguous connection setup.

## Runtime versus Prisma CLI connections

DTSC uses two logical connection roles:

- `DATABASE_URL`: application/runtime traffic. On Neon Production this should be the **pooled** endpoint whose hostname contains `-pooler`.
- `DIRECT_URL`: optional direct PostgreSQL/Neon endpoint reserved for Prisma CLI/admin operations such as migrations. `prisma.config.ts` falls back to `DATABASE_URL` when `DIRECT_URL` is intentionally unavailable in local or CI environments.

Neither value may be exposed to the browser, user-facing errors, screenshots, fixtures or logs.

### Neon pooled runtime defaults

When `DATABASE_URL` is a Neon pooled endpoint and the operator has not already set explicit Prisma v6 URL parameters, DTSC applies these conservative runtime defaults in memory:

- `connection_limit=1` per warm serverless instance;
- `pool_timeout=5` seconds;
- `connect_timeout=10` seconds.

Explicit operator values are preserved. A direct Neon hostname is **never** rewritten automatically into a pooled hostname: endpoint selection remains an infrastructure decision.

The application emits only a generic server warning when Production uses a direct Neon runtime endpoint. It never prints the URL, hostname, username, password or database name.

## Prisma client lifecycle

Runtime code has one canonical Prisma Client source: `lib/prisma.ts`.

The singleton contract exists because every Prisma Client owns a connection pool. Creating clients inside request handlers, pages, components or domain helpers increases the risk of exhausting PostgreSQL under Vercel concurrency.

`qa-scale1-database-safety.mjs` scans `app/`, `components/` and `lib/` and fails if another runtime `new PrismaClient(...)` is introduced.

Scripts and isolated tooling may instantiate their own client only when their execution lifecycle is explicit and outside the request runtime.

## Transaction budget

The canonical Prisma client keeps the Prisma v6 interactive-transaction defaults explicit:

- acquisition `maxWait`: 2 seconds;
- transaction `timeout`: 5 seconds.

A domain may override those values only when the longer transaction is justified, bounded and tested. Long external/provider calls must not be kept inside an open database transaction.

## Production observability

`getProductionObservabilitySnapshot()` exposes only aggregate, secret-free database signals to the protected Console CTO scalability surface:

- live probe latency;
- current and maximum PostgreSQL connections;
- connection utilization;
- active connections;
- idle connections;
- idle-in-transaction connections;
- active queries running for at least one second;
- runtime connection mode (`NEON_POOLED`, `NEON_DIRECT`, other PostgreSQL, invalid/unconfigured);
- effective Prisma runtime connection limit;
- effective pool wait timeout;
- effective initial connection timeout.

The snapshot never returns the DSN, hostname, role, database name, SQL text, tenant identifier or user identifier.

### Watch conditions

The CTO dashboard marks PostgreSQL as requiring attention when at least one condition is true:

- connection utilization is at least 80%;
- at least one session is idle in transaction;
- at least one active query exceeds one second;
- the runtime connection policy is not confirmed as pooled Neon.

These signals are operational warnings, not automatic proof of a root cause.

## Query and pagination rules

SCALE-1 keeps the repository-wide rules already defined by `AGENTS.md` and `docs/CONTRIBUTING.md`:

- large lists are paginated and bounded server-side;
- no handler may load all patients, products, messages, movements, audit rows or financial entries into memory;
- N+1 query patterns must be replaced by bounded includes/selects, batched reads, aggregation or an explicit projection;
- long provider/network work must happen outside database transactions;
- indexes are added only for real filters/orderings and only through additive migrations;
- an index is not added merely because a column exists;
- no historical migration is rewritten.

A current `pg_stat_activity` query is only a point-in-time pressure signal. Historical slow-query evidence should also be correlated with Neon/provider telemetry during load certification.

## Vercel Production checklist

Before SCALE-7 staged load tests:

1. Configure Production `DATABASE_URL` with the Neon pooled connection string (`-pooler`).
2. Configure `DIRECT_URL` with the direct Neon connection string when Prisma migration/admin tooling should bypass the pooler.
3. Keep both variables server-only; never prefix them with `NEXT_PUBLIC_`.
4. Open Console → CTO → Scalability and confirm the runtime connection mode is `Neon poolé / Neon pooled`.
5. Observe connection utilization, active/idle sessions, idle-in-transaction sessions and >1 s active-query count under representative traffic.
6. Archive the Git SHA and observation window with the load report.

## Capacity evidence still required

The following remain `NOT_EXECUTED` until real evidence exists:

- intermediate-load proof that PostgreSQL does not exhaust connections;
- staged authenticated load at 500, 1,000, 2,500 and 5,000 simultaneous users;
- provider-side Neon connection/slow-query telemetry archived with those runs;
- final SCALE-7/SCALE-8 readiness decision.

SCALE-1 therefore hardens the contract but does not close the 5,000-user certification programme by itself.

## Rollback

Application rollback is a revert of the SCALE-1 changes. No Prisma schema or historical migration is modified by this iteration.

If `DIRECT_URL` is removed, Prisma CLI falls back to `DATABASE_URL`. If the runtime URL policy is reverted, the environment connection string remains the source of truth and no database data requires restoration.
