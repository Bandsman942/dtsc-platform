# DTSC Platform — Scalability & Capacity Engineering

Parent programme: #352
Iteration: #353 / SCALE-0

## Purpose

This document defines the measurable baseline required before DTSC Platform can claim readiness for 5,000 simultaneously active users.

The target is a capacity contract, not a claim based on account count. Certification requires reproducible load evidence, tenant isolation checks and production-like telemetry.

## Current baseline

SCALE-0A was merged on:

`main@eacc49883bee68a2050605ad06b7637443a4f7b6`

SCALE-0B added a protected Production-observability snapshot on `main@342cd1144ee2f8e61a14ab8c42d0611826a9017f`.

SCALE-0C extends that snapshot with observed API/AI throughput and persisted AI rate-limit signals. It does not certify any load stage by itself.

## SLO targets

At the final target load, the programme aims for:

- common CRUD/API P95 < 1,000 ms;
- critical internal P99 < 2,000 ms, excluding third-party provider latency;
- application error rate < 1%;
- no PostgreSQL connection exhaustion;
- no cross-tenant data exposure;
- durable writes remain idempotent;
- realtime/collaboration traffic does not require unbounded PostgreSQL writes;
- AI concurrency is independently bounded by tenant/provider budgets.

These values are targets until measured. A target without an executed load run remains `NOT_EXECUTED` evidence.

## Load stages

Certification proceeds through four explicit stages:

1. 500 active virtual users;
2. 1,000 active virtual users;
3. 2,500 active virtual users;
4. 5,000 active virtual users.

A stage is not considered passed unless its report records latency, error rate, throughput and relevant infrastructure saturation indicators.

## Workload families

A production-like run must eventually mix representative authenticated workloads across:

- shell/dashboard reads;
- common ERP read/write flows;
- Retail/Shop reads and bounded transactional writes;
- collaboration presence, messages and call-event reads;
- notifications;
- workflows/background jobs;
- reporting reads;
- AI requests under explicit quotas.

SCALE-0 starts with a smoke profile only. Later SCALE iterations must replace single-session assumptions with multiple authenticated identities and organizations.

## Metrics to archive

Every staged load report must capture, when available:

- HTTP request rate and total requests;
- P50/P95/P99 latency;
- HTTP failure rate;
- status-code distribution;
- PostgreSQL/Neon connection pressure and query latency;
- Redis/Upstash request latency/failure/fallback rate;
- serverless/runtime error counts;
- AI provider latency/rate-limit failures for AI scenarios;
- tenant-isolation assertions;
- timestamp, git SHA, environment and exact load profile parameters.

## Production observability snapshot

SCALE-0B exposes a read-only DTSC Console endpoint:

`GET /api/admin/scalability/observability?windowHours=24`

The endpoint requires the existing `SECURITY_READ` Console capability and returns `private, no-store` responses. The measurement window is validated between 1 and 168 hours.

The snapshot intentionally exposes only aggregate technical signals:

- API sample count, observed requests/minute and requests/second, server-error count/rate and P50/P95/P99 from persisted `ApiLog.durationMs`;
- a live PostgreSQL probe latency plus current/max connections from `pg_stat_activity`;
- AI sample/success/failure counts, observed calls/minute and calls/second, persisted `RATE_LIMITED` count/rate, P50/P95/P99 and first-token P95 from `AiModelCall`;
- Redis status explicitly marked `NOT_MEASURED` until SCALE-2 / #355.

Throughput values are observed averages across the selected bounded window. They are not peak RPS and must not be presented as load-test capacity. Likewise, `rateLimitedCount` only reflects calls persisted with `reasonCode = RATE_LIMITED`; it does not infer provider throttling from missing or unrelated data.

It does not return request payloads, user identifiers, organization identifiers, DSNs, credentials, cookies or provider secrets. `ApiLog` coverage is not assumed to be exhaustive: the returned sample count is part of the evidence contract.

The live PostgreSQL probe is a point-in-time application observation, not a substitute for Neon provider telemetry. Redis latency/failover evidence remains a known gap owned by #355 rather than a synthetic value.

## Reproducible smoke profile

The first repository load profile is:

`scripts/load/capacity-5000.js`

It requires:

- `BASE_URL`;
- optional `SESSION_COOKIE` for an authenticated smoke session.

Example with k6 installed locally:

```bash
BASE_URL=https://app.example.test \
SESSION_COOKIE='session=REDACTED' \
k6 run scripts/load/capacity-5000.js
```

Never commit real cookies, credentials, provider tokens or Production secrets.

## Architecture direction

```text
Browser / PWA
   |
Vercel / Next.js
   |-- interactive APIs ----------> PostgreSQL / Neon
   |-- ephemeral realtime state --> Redis / Upstash where justified
   |-- asynchronous work ---------> durable queue / workers
   |-- read-heavy dashboards -----> bounded cache / projections
   `-- AI ------------------------> governed gateway + concurrency budgets
```

PostgreSQL remains the canonical durable transactional source. Any Redis/cache layer introduced by later iterations must be explicitly ephemeral or reconstructible and must never weaken tenant isolation.

## Relationship to the superseded PR #362

PR #362 was created from an obsolete baseline and mixed SCALE-0, SCALE-2 and SCALE-3 changes. Under `docs/CONTRIBUTING.md`, its historical tree is not reused as authority.

Its useful delta is split by responsibility:

- SCALE-0 / #353: capacity contract + Production observability baseline;
- SCALE-2 / #355: presence/realtime Redis work, to be re-audited against the then-current `main`;
- SCALE-3 / #356: distributed rate-limit timeout/degradation work, to be re-audited against the then-current `main`.

No runtime presence or rate-limit change belongs to SCALE-0.

## Evidence contract

Repository inspection and CI can prove that the observability contract is protected, bounded, compile-safe and regression-safe. A deployed endpoint can provide a current Production baseline for the configured window. Neither of those facts proves 5,000-user capacity.

Until an actual staged load run is executed and archived, capacity stages stay `NOT_EXECUTED`.

## Rollback

SCALE-0C extends a read-only helper and QA/documentation only. Rollback is a revert of the SCALE-0C commit; there is no Prisma or Production data rollback.
