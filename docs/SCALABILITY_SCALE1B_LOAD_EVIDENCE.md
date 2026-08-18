# DTSC Platform — SCALE-1B Intermediate Database Load Evidence

Parent programme: #352
Parent SCALE-1: #354
Evidence gate: #410
Harness: #411
SCALE-7 certification: #360

## Purpose

SCALE-1B provides the reproducible, bounded evidence needed to answer one specific question before DTSC moves deeper into the 5,000-user programme:

> Does the current Vercel + Prisma + Neon runtime avoid PostgreSQL connection exhaustion under an authenticated, read-heavy intermediate load up to 500 active virtual users?

This is **not** the 5,000-user certification. SCALE-7 / #360 remains the only owner of the 1,000 / 2,500 / 5,000 VU stages and of the final mixed-workload capacity run.

## Production prerequisites

The workflow is intentionally `workflow_dispatch` only. It never runs on `push`, `pull_request`, cron or Vercel Preview.

Before the first Production execution, configure the repository with:

- repository variable `SCALE1_LOAD_BASE_URL`: canonical HTTPS application origin for the Production run; the expected DTSC application origin is `https://app.dtsc-platform.com` unless infrastructure ownership deliberately changes it;
- repository secret `SCALE1_LOAD_SESSION_COOKIE`: a dedicated authenticated application session able to read `/dashboard` and `/api/notifications/unread-count`;
- repository secret `SCALE1_CTO_SESSION_COOKIE`: a DTSC internal Console session authorized with `SECURITY_READ`, used only to read `/api/admin/scalability/observability`.

Never store either cookie in the repository, Issues, PR bodies, screenshots, artifacts or shell traces. A session should be scoped as narrowly as practical and rotated/revoked after the load campaign.

## Manual dispatch contract

Workflow: `.github/workflows/scale1-db-load.yml`

Inputs:

- `target_vus`: `100`, `250` or `500`; `500` is the SCALE-1B acceptance target;
- `confirmation`: must equal `RUN_SCALE1_DB_LOAD` exactly.

The workflow fails closed when:

- the confirmation is incorrect;
- the base URL is absent or is not HTTPS;
- either session secret is absent;
- the requested target is not one of the allowed intermediate values;
- the authenticated preflight does not return HTTP 200;
- the protected CTO observability endpoint cannot provide the initial database snapshot.

## Workload profile

`scripts/load/scale1-db-intermediate.js` uses only read paths:

- `/dashboard`;
- `/api/notifications/unread-count`.

A 500-VU execution ramps progressively through 50, 100, 250 and 500 VUs, holds 500 VUs for three minutes, then ramps down. Each VU waits a randomized four-to-eight seconds between requests so the profile models active users rather than a tight-loop denial-of-service pattern.

SCALE-1B deliberately excludes writes, AI calls, collaboration mutation traffic and the higher SCALE-7 stages. It therefore proves only the bounded database-connection contract described here.

## HTTP gates

k6 fails the run when any required HTTP contract is missed:

- request failure rate must stay below 1%;
- P95 must stay below 1,000 ms;
- P99 must stay below 2,000 ms;
- check success rate must stay above 99%;
- authenticated read checks must return HTTP 200.

Redirects, anonymous `401` responses and other non-authenticated responses do not count as success.

## PostgreSQL evidence sampling

Before, during and after the k6 load, the workflow samples:

`GET /api/admin/scalability/observability?windowHours=1`

The workflow keeps only the already sanitized `snapshot.database` payload plus its generated timestamp. Cookies, DSNs, hostnames, SQL text, user identifiers and organization identifiers are not copied into the evidence artifact.

The database report fails unless all of these conditions hold:

- at least two database samples exist;
- runtime policy is exactly `NEON_POOLED` with status `OK`;
- maximum observed connection utilization stays below 80%;
- no observed connection is `idle in transaction`;
- observed current connections stay strictly below PostgreSQL `max_connections`;
- the k6 HTTP gates also pass.

A point-in-time snapshot can miss a short spike. SCALE-1B mitigates that limitation by sampling every 15 seconds during the run, but provider-side Neon telemetry remains desirable and SCALE-7 still owns final capacity certification.

## Evidence artifacts

Every manually dispatched run uploads, even when a gate fails:

- `k6-summary.json`;
- `db-observability.ndjson`;
- `scale1-db-load-report.json`;
- `scale1-db-load-report.md`.

The artifact name contains the Git SHA and target VU count and is retained for 30 days by the workflow.

When executed inside GitHub Actions, the report marks the load execution as `CI_PROVEN`. A developer running the same report locally receives `LOCAL_EXECUTED`. Merely merging the harness is not evidence: #410 remains `NOT_EXECUTED` until a real manual workflow run has produced an archived artifact.

## Acceptance sequence

1. Merge the harness only after its normal Quality Gates are green.
2. Confirm Production is `READY` on the merged harness SHA.
3. Configure/refresh the three repository runtime values listed above.
4. Dispatch the workflow with `target_vus=500` and confirmation `RUN_SCALE1_DB_LOAD`.
5. Keep the resulting artifact and workflow run ID as the evidence for #410.
6. Close #410 only if the report is `PASS` and the workflow itself succeeds.
7. Close #354 only when the rest of its scope is also satisfied; do not infer slow-query/index evidence that was not measured.
8. Continue to SCALE-2 / #355 and later SCALE-7 / #360 without re-labeling the 500-VU result as 5,000-user certification.

## Failure handling

A failed load run is evidence, not a reason to weaken the thresholds. Record the failing gate, correlate it with PostgreSQL/Vercel/Neon telemetry, open or update the responsible Issue, fix the root cause on a normal feature branch, and repeat the same bounded workflow.

Do not increase connection budgets, transaction timeouts or accepted error rates merely to turn the report green.

## Rollback

The SCALE-1B harness is additive CI/load tooling only. Rollback is a revert of the workflow, load scripts, QA and documentation. It has no Prisma migration, schema change or Production data rollback.