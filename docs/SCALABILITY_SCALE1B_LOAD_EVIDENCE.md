# DTSC Platform — SCALE-1B Intermediate Database Load Evidence

Parent programme: #352
Parent SCALE-1: #354
Evidence gate: #410
Harness: #411
Vercel automation bypass fix: #413
Pooled concurrency tuning: #416
SCALE-7 certification: #360

## Purpose

SCALE-1B provides the reproducible, bounded evidence needed to answer one specific question before DTSC moves deeper into the 5,000-user programme:

> Does the current Vercel + Prisma + Neon runtime avoid PostgreSQL connection exhaustion and preserve the required HTTP latency under an authenticated, read-heavy intermediate load up to 500 active virtual users?

This is **not** the 5,000-user certification. SCALE-7 / #360 remains the only owner of the 1,000 / 2,500 / 5,000 VU stages and of the final mixed-workload capacity run.

## Production prerequisites

The workflow never runs on `push`, `pull_request` or cron. It supports two explicit operator paths:

- manual `workflow_dispatch` with bounded inputs;
- an owner-only Issue command on #410, used for controlled reruns after a Production tuning deployment.

Before a Production execution, configure the repository with:

- repository variable `SCALE1_LOAD_BASE_URL`: canonical HTTPS application origin for the Production run; the expected DTSC application origin is `https://app.dtsc-platform.com` unless infrastructure ownership deliberately changes it;
- repository secret `SCALE1_LOAD_SESSION_COOKIE`: a dedicated authenticated application session able to read `/dashboard` and `/api/notifications/unread-count`;
- repository secret `SCALE1_CTO_SESSION_COOKIE`: a DTSC internal Console session authorized with `SECURITY_READ`, used only to read `/api/admin/scalability/observability`;
- repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`: the Protection Bypass for Automation secret generated for the DTSC Vercel project and used only to authorize the GitHub Actions load runner through Vercel protection.

Never store a cookie or the Vercel automation bypass secret in the repository, Issues, PR bodies, screenshots, artifacts or shell traces. Sessions should be scoped as narrowly as practical and rotated/revoked after the load campaign. The Vercel bypass secret should also be rotated or revoked when the campaign is complete.

## Vercel automation bypass contract

The first real SCALE-1B attempt, GitHub Actions run `32141033725` on `main@437be49f63a3d8d060ffdec357cf39d826c0a190`, stopped during the authenticated preflight with HTTP `429` before k6 started. The route itself does not implement a 429 response and no matching application-runtime request was observed for that window, so the harness now treats Vercel edge authorization as a separate prerequisite from DTSC session authentication.

For this load harness, enable **Protection Bypass for Automation** for the Vercel project and copy the generated secret into the GitHub Actions repository secret named exactly `VERCEL_AUTOMATION_BYPASS_SECRET`.

Every automated Production request made by SCALE-1B sends:

`x-vercel-protection-bypass: <secret>`

This header authorizes the automation through Vercel protection. It does **not** replace DTSC authentication or authorization:

- the load read paths still require `SCALE1_LOAD_SESSION_COOKIE`;
- CTO database observability still requires `SCALE1_CTO_SESSION_COOKIE` and the DTSC internal `SECURITY_READ` contract;
- redirects, `401`, `403`, `429` and other non-`200` responses still fail the preflight/checks;
- the bypass value is never copied into the evidence artifact.

Do not disable the Vercel Firewall globally, do not weaken system protections for ordinary users, and do not add an unauthenticated application route solely for load testing.

## Operator trigger contract

Workflow: `.github/workflows/scale1-db-load.yml`

### Manual dispatch

Inputs:

- `target_vus`: `100`, `250` or `500`; `500` is the SCALE-1B acceptance target;
- `confirmation`: must equal `RUN_SCALE1_DB_LOAD` exactly.

### Owner Issue command

A repository owner may add the exact comment below to Issue #410:

`RUN_SCALE1_DB_LOAD_500`

The workflow accepts that event only when all three conditions are true:

- the Issue number is exactly `410`;
- GitHub reports the comment author association as `OWNER`;
- the comment body equals `RUN_SCALE1_DB_LOAD_500` exactly.

That path always uses the bounded 500-VU profile. Other issue comments do not start the load job.

The workflow fails closed when:

- the manual confirmation is incorrect or the Issue command is not authorized;
- the base URL is absent or is not HTTPS;
- either DTSC session secret is absent;
- the Vercel automation bypass secret is absent;
- the requested target is not one of the allowed intermediate values;
- the authenticated preflight does not return HTTP 200;
- the protected CTO observability endpoint cannot provide the initial database snapshot.

## Workload profile

`scripts/load/scale1-db-intermediate.js` uses only read paths:

- `/dashboard` tagged `dashboard-read`;
- `/api/notifications/unread-count` tagged `notifications-read`.

A 500-VU execution ramps progressively through 50, 100, 250 and 500 VUs, holds 500 VUs for three minutes, then ramps down. Each VU waits a randomized four-to-eight seconds between requests so the profile models active users rather than a tight-loop denial-of-service pattern.

SCALE-1B deliberately excludes writes, AI calls, collaboration mutation traffic and the higher SCALE-7 stages. It therefore proves only the bounded database/HTTP contract described here.

## HTTP gates

k6 fails the run when any required HTTP contract is missed:

- request failure rate must stay below 1%;
- aggregate P95 must stay below 1,000 ms;
- aggregate P99 must stay below 2,000 ms;
- `dashboard-read` P95/P99 must independently stay below 1,000/2,000 ms;
- `notifications-read` P95/P99 must independently stay below 1,000/2,000 ms;
- check success rate must stay above 99%;
- authenticated read checks must return HTTP 200.

Redirects, anonymous `401` responses and other non-authenticated responses do not count as success.

The generated report archives aggregate latency plus the P50/P95/P99 breakdown for both workloads so a fast endpoint cannot hide a slow one.

## PostgreSQL evidence sampling

Before, during and after the k6 load, the workflow samples:

`GET /api/admin/scalability/observability?windowHours=1`

The workflow keeps only the already sanitized `snapshot.database` payload plus its generated timestamp. Cookies, bypass secrets, DSNs, hostnames, SQL text, user identifiers and organization identifiers are not copied into the evidence artifact.

The database report fails unless all of these conditions hold:

- at least two database samples exist;
- runtime policy is exactly `NEON_POOLED` with status `OK`;
- maximum observed connection utilization stays below 80%;
- no observed connection is `idle in transaction`;
- observed current connections stay strictly below PostgreSQL `max_connections`;
- the k6 HTTP gates also pass.

The report also records the effective `connection_limit`, `pool_timeout` and `connect_timeout` observed during the run. This is required by #416 so each tuning result is tied to the actual runtime configuration instead of an assumed value.

A point-in-time snapshot can miss a short spike. SCALE-1B mitigates that limitation by sampling every 15 seconds during the run, but provider-side Neon telemetry remains desirable and SCALE-7 still owns final capacity certification.

## Evidence artifacts

Every authorized run uploads, when files have been produced:

- `k6-summary.json`;
- `db-observability.ndjson`;
- `scale1-db-load-report.json`;
- `scale1-db-load-report.md`.

The artifact name contains the Git SHA and target VU count and is retained for 30 days by the workflow. A preflight that fails before evidence files exist is a failed attempt but is not misrepresented as a completed load run.

When executed inside GitHub Actions, the report marks the load execution as `CI_PROVEN`. A developer running the same report locally receives `LOCAL_EXECUTED`. Merely merging the harness is not evidence: #410 remains open until a real Production workflow run has produced a passing archived artifact.

## Tuning sequence (#416)

The first pooled 500-VU baseline with `connection_limit=1` proved connection safety but failed latency badly: P95 ≈ 18 s, P99 ≈ 29 s, 0 % HTTP failures, 100 % checks and only 16 / 901 PostgreSQL connections observed. The tuning loop therefore keeps Neon pooled and raises only the application-side Prisma pool in small measured steps.

1. Start from the current Production `main` and preserve Neon pooled.
2. Deploy the candidate `connection_limit` only through the normal Issue → branch → PR → CI → merge → Production path.
3. Wait for the Production deployment to be `READY` on the expected SHA.
4. Run the same 500-VU profile.
5. Compare aggregate and per-workload latency plus PostgreSQL pressure.
6. Keep the **smallest** candidate that passes every HTTP and DB gate.
7. Never lower the thresholds to accept a candidate.
8. If a candidate increases DB pressure materially without meeting latency, roll back through a traceable change and test the next justified option.

## Acceptance sequence

1. Merge harness/runtime tuning only after normal Quality Gates are green.
2. Confirm Production is `READY` on the merged SHA.
3. Ensure Vercel Protection Bypass for Automation and the dedicated session secrets are still valid.
4. Trigger 500 VU manually or with the exact owner Issue command on #410.
5. Keep the resulting artifact and workflow run ID as the evidence for #410/#416.
6. Close #416 only when the smallest tested pooled connection limit satisfies every acceptance gate.
7. Close #410 only if the final report is `PASS` and the workflow itself succeeds.
8. Close #354 only when the rest of its scope is also satisfied; do not infer slow-query/index evidence that was not measured.
9. Continue to SCALE-2 / #355 and later SCALE-7 / #360 without re-labeling the 500-VU result as 5,000-user certification.
10. Rotate/revoke the Vercel automation bypass secret and dedicated load sessions after the load campaign.

## Failure handling

A failed load run is evidence, not a reason to weaken the thresholds. Record the failing gate, correlate it with PostgreSQL/Vercel/Neon telemetry, fix the root cause on a normal feature branch, and repeat the same bounded workflow.

Do not increase connection budgets, transaction timeouts or accepted error rates merely to turn the report green. A higher `connection_limit` is acceptable only when the corresponding archived 500-VU run shows that the database still retains the required safety margin.

## Rollback

The SCALE-1B harness changes are additive CI/load tooling. Runtime pool tuning is rollback-safe through a normal repository change because it modifies only the effective Prisma connection URL parameters; it does not alter Prisma schema, migrations or Production data. Neon pooled remains the required runtime endpoint throughout tuning.
