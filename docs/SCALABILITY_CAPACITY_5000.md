# DTSC Platform — Scalability & Capacity Engineering 5,000 concurrent users

Parent programme: #352

## Goal

Certify DTSC Platform for at least 5,000 simultaneously active users with a realistic workload mix across ERP, Shop, collaboration, notifications, workflows and governed AI.

This is a capacity target, not a claim based on account count. Certification requires reproducible load evidence.

## Current production signals

The first observed pressure points are collaboration presence/call event polling, distributed rate limiting and PostgreSQL connectivity. The programme therefore starts by reducing write amplification and bounding external infrastructure latency before adding more compute.

## SLO target

- common CRUD/API P95 < 1,000 ms at target load;
- critical internal P99 < 2,000 ms excluding third-party provider latency;
- application error rate < 1%;
- no PostgreSQL connection exhaustion;
- no cross-tenant data exposure;
- durable writes remain idempotent;
- realtime presence does not require a PostgreSQL write per heartbeat;
- AI concurrency is separately bounded by tenant and provider budgets.

## Architecture direction

```text
Browser / PWA
   |
Vercel / Next.js
   |-- interactive APIs ----------> PostgreSQL / Neon pooled connection
   |-- ephemeral presence --------> Redis / Upstash TTL state
   |-- asynchronous work ---------> Queue / workers
   |-- read-heavy dashboards -----> bounded cache / projections
   `-- AI ------------------------> governed AI gateway + concurrency budgets
```

PostgreSQL remains the canonical durable transactional source. Redis is only authoritative for short-lived presence/realtime state that can expire and be reconstructed.

## Load levels

Certification progresses through 500, 1,000, 2,500 and 5,000 active virtual users. Every level must pass before the next one is accepted.

The initial k6 profile is `scripts/load/capacity-5000.js`. Production-like certification must use representative authenticated sessions and a tenant mix; one shared session is only suitable for smoke testing.

## First implementation wave

1. Add a distributed TTL cache for collaboration presence.
2. Coalesce PostgreSQL presence journal writes instead of writing every heartbeat.
3. Bound Upstash calls to a short timeout so Redis degradation does not stall interactive requests.
4. Establish load-test and SLO artefacts.
5. Verify production `DATABASE_URL` points to the Neon pooled endpoint before claiming SCALE-1 complete.

## Remaining programme

- PostgreSQL pooling, slow query and index audit;
- realtime/polling reduction;
- distributed rate-limit hardening;
- async queues/workers;
- dashboard/report projections;
- AI concurrency controls;
- full staged load test and CI capacity gate.

## Release policy

All scalability work follows repository CI/CD rules. Intermediate branch commits are not a production release. Production changes originate only from the final merge to `main`. No preview deployment is required by this programme.
