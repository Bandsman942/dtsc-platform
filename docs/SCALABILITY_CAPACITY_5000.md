# DTSC Platform — Scalability & Capacity Engineering

Parent programme: #352
Iteration: #353 / SCALE-0

## Purpose

This document defines the measurable baseline required before DTSC Platform can claim readiness for 5,000 simultaneously active users.

The target is a capacity contract, not a claim based on account count. Certification requires reproducible load evidence, tenant isolation checks and production-like telemetry.

## Current baseline

Canonical starting point for SCALE-0:

`main@a4e66c1655d363b1115334c10ea55006dae54ed0`

This baseline includes the collaboration hotfix delivered through #395/#396 and must be preserved by every scalability change.

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

- SCALE-0 / #353: documentation + reproducible staged load profile;
- SCALE-2 / #355: presence/realtime Redis work, to be re-audited against the then-current `main`;
- SCALE-3 / #356: distributed rate-limit timeout/degradation work, to be re-audited against the then-current `main`.

No runtime presence or rate-limit change belongs to this SCALE-0 branch.

## Evidence contract

For SCALE-0, repository inspection and CI can prove that the artefacts compile and remain regression-safe. They do **not** prove 5,000-user capacity.

Until an actual load run is executed and archived, capacity stages stay `NOT_EXECUTED`.

## Rollback

SCALE-0 adds documentation and load-test tooling only. Rollback is a revert of the SCALE-0 commit; there is no Prisma or Production data rollback.
