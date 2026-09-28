# SCALE-7 — Staged load certification

Issue: #360
Parent programme: #352
Depends on: #359 / SCALE-6

## Objective

Certify DTSC Platform progressively at **500 → 1,000 → 2,500 → 5,000 simultaneous users** without turning a target into an unsupported capacity claim.

Each stage is tested with three explicit profiles:

- `ramp`: progressive ramp-up plus bounded plateau;
- `soak`: longer plateau for saturation/leak detection;
- `spike`: fast rise/drop/re-rise resilience.

A stage is certified only when all required profiles have archived PASS evidence for the relevant SHA/environment.

## Workload contract

`scripts/load/scale7-staged-certification.js` uses at least two authenticated tenant contexts and mixes:

- dashboard reads;
- notifications;
- common enterprise/ERP reads;
- Shop/Retail reads;
- collaboration reads;
- a low-frequency real AI request path governed by SCALE-6;
- explicit cross-tenant probes that must stay 403/404.

The secret `SCALE7_AUTH_CONTEXTS_JSON` contains an operator-provided pool of dedicated load-test identities. Paths are grouped by tenant to keep the secret compact and to avoid pretending that thousands of VUs are thousands of requests from one account.

```json
{
  "aiPath": "/api/...",
  "aiPayload": {},
  "tenants": [
    {
      "organizationId": "load-test-org-a",
      "enterpriseReadPath": "/api/...",
      "shopReadPath": "/api/...",
      "collaborationReadPath": "/api/...",
      "isolationProbePath": "/api/...foreign-tenant...",
      "sessionCookies": ["REDACTED", "REDACTED"]
    },
    {
      "organizationId": "load-test-org-b",
      "enterpriseReadPath": "/api/...",
      "shopReadPath": "/api/...",
      "collaborationReadPath": "/api/...",
      "isolationProbePath": "/api/...foreign-tenant...",
      "sessionCookies": ["REDACTED", "REDACTED"]
    }
  ]
}
```

The harness requires at least two distinct tenants and a unique authenticated identity pool sized to the stage: `max(8, ceil(targetVus / 100))`, therefore at least 8 / 10 / 25 / 50 identities for 500 / 1,000 / 2,500 / 5,000 VU. This prevents per-user limits from being measured as a fake platform bottleneck. The AI path is mandatory but intentionally represents about 1% of iterations so SCALE-6 user/organization/provider ceilings remain a governed subsystem rather than dominating the whole workload.

Use dedicated load-test organizations and data. Never point the certification harness at real customer records.

## SLO gates

Every run enforces:

- HTTP failure rate < 1%;
- aggregate P95 < 1,000 ms;
- aggregate P99 < 2,000 ms;
- checks > 99%;
- cross-tenant probe success = 100%;
- PostgreSQL connection utilization < 80%;
- no connection exhaustion;
- no idle-in-transaction sessions;
- Redis never observed as `UNAVAILABLE`.

The report additionally archives throughput, DB pressure, Redis state, queue state and AI concurrency/throttling signals.

## Stage progression

The workflow enforces progression from the versioned registry: `soak` requires a PASS `ramp` at the same stage, `spike` requires PASS `ramp` + `soak`, and 1,000/2,500/5,000 cannot start until the previous stage has PASS evidence for all three profiles.

## Execution

Workflow: `.github/workflows/scale7-staged-certification.yml`

Manual inputs:

1. stage: 500 / 1,000 / 2,500 / 5,000;
2. profile: ramp / soak / spike;
3. exact confirmation: `RUN_SCALE7_CERTIFICATION`.

Required configuration:

- repository variable `SCALE7_LOAD_BASE_URL`;
- secret `SCALE7_AUTH_CONTEXTS_JSON`;
- secret `SCALE7_CTO_SESSION_COOKIE`;
- secret `VERCEL_AUTOMATION_BYPASS_SECRET`.

No workflow runs on push, pull request or schedule.

### Owner-only Issue #360 trigger

The repository OWNER may trigger the same bounded workflow by posting an exact command on Issue #360:

- `RUN_SCALE7_500_RAMP`, `RUN_SCALE7_500_SOAK`, `RUN_SCALE7_500_SPIKE`;
- the same form for `1000`, `2500` and `5000`.

The workflow rejects non-OWNER authors, comments outside #360 and unsupported commands. It does not bypass the versioned progression gate. After an owner-triggered run it posts a `SCALE7_RESULT_JSON` secret-free summary back to #360 so the evidence can be archived through the normal PR/CI path.

## Archived certification registry

GitHub Actions artifacts are the execution evidence. After a real run, download the sanitized `scale7-certification-report.json` and archive only its safe summary:

```bash
node scripts/load/archive-scale7-certification.mjs path/to/scale7-certification-report.json
```

This updates `data/scalability/scale7-certifications.json`. The versioned registry is intentionally secret-free and feeds **Administration DTSC → CTO → Scalabilité**, where archived certification is shown separately from live observability.

The registry stores no cookie, DSN, tenant identifier, prompt, response body or provider secret.

## Promotion rule

Do not attempt a higher user stage until the prior stage has the required PASS evidence. A FAIL is an engineering signal, not something to bypass.

## Rollback

All SCALE-7 repository changes are additive application/QA/workflow/documentation changes. Rollback is a revert. No Prisma migration is introduced by this iteration.
