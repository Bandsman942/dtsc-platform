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

By default, the workflow provisions its dedicated multi-tenant auth pool through **GitHub Actions OIDC**. No cookie secret is required for this path.

The application accepts the provisioning request only when the OIDC token is cryptographically valid and all claims match the exact DTSC contract:

- issuer `https://token.actions.githubusercontent.com`;
- audience `dtsc-scale7`;
- repository `Bandsman942/dtsc-platform`;
- ref `refs/heads/main`;
- workflow `.github/workflows/scale7-staged-certification.yml`;
- event `issue_comment` or `workflow_dispatch`.

The managed pool uses two fixed synthetic organizations, no customer data, and synthetic identities that cannot authenticate with a product password. Sessions are signed by the application at run time and remain only in the GitHub Actions runner environment. The returned topology is never written to Issues, artifacts or the versioned certification registry.

The same OIDC verifier authorizes **only** `GET /api/admin/scalability/observability` for this exact workflow. An OIDC request must also carry an exact same-origin `Origin` header. The route keeps its existing `SECURITY_READ` path for human CTO users; OIDC is not a general Console bypass and does not authorize any other Administration DTSC route.

Because `/api/admin/*` is normally session-gated by `middleware.ts`, the middleware delegates only this exact observability path when a Bearer header is present. That delegation grants no access by itself: invalid or non-SCALE-7 bearers still fail in the route verifier. All other Admin APIs remain session/context protected in middleware.

To avoid measuring per-user AI/rate-limit ceilings as if they were platform capacity, the governed pool is deliberately larger than the minimum contract: it uses approximately **10% of the VU target**, i.e. 50 / 100 / 250 / 500 unique sessions for 500 / 1,000 / 2,500 / 5,000 VU, split across the two synthetic tenants.

An operator may still provide `SCALE7_AUTH_CONTEXTS_JSON` as an **operator override**. When present, the workflow uses it instead of OIDC provisioning. The same harness validation still requires at least two distinct tenants, unique sessions and the stage-specific minimum `max(8, ceil(targetVus / 100))`.

The AI path remains mandatory and intentionally represents about 1% of iterations so SCALE-6 user/organization/provider ceilings remain a governed subsystem rather than dominating the whole workload.

For SCALE-7B, that 1% workload uses the canonical **Enterprise AI** route `POST /api/enterprise/ai/chat`, bound to the current synthetic tenant with `useKnowledge=false` and `useTools=false`. The previous `/api/chat/v2` path is a PERSONAL chatbot surface and therefore measured STARTER/personal admission ceilings instead of the Enterprise organization provisioned for SCALE-7; it is no longer used as the representative Enterprise AI capacity probe.

Use only the managed synthetic organizations or an equivalent dedicated operator pool. Never point the certification harness at real customer records.

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

## 500-ramp remediation baseline

The Production run `36906230174` on `main@036f550c1c9c470e335aa02b558b3be97d602def` established the SCALE-7B baseline after the Prisma pooled candidate 9:

- HTTP failure rate: 0.6218% — PASS;
- checks: 99.376% — PASS;
- tenant isolation: 100% — PASS;
- P95: 1,190.43 ms — FAIL;
- P99: 3,118.61 ms — FAIL;
- Dashboard: 1,950.49 / 3,504.73 ms;
- Shop/Retail: 1,206.44 / 2,598.60 ms;
- Collaboration: 871.71 / 2,284.22 ms;
- Enterprise: 725.13 / 1,776.83 ms;
- PostgreSQL: 63 / 901 max connections (6.99%), no P2024, no idle-in-transaction;
- Redis: OK.

SCALE-7B keeps `connection_limit=9` and all SLOs unchanged. Its first remediation targets are therefore application read-path fan-out and the representative AI surface, not additional database pool growth.

## Stage progression

The workflow enforces progression from the versioned registry: `soak` requires a PASS `ramp` at the same stage, `spike` requires PASS `ramp` + `soak`, and 1,000/2,500/5,000 cannot start until the previous stage has PASS evidence for all three profiles.

## Execution

Workflow: `.github/workflows/scale7-staged-certification.yml`

Manual inputs:

1. stage: 500 / 1,000 / 2,500 / 5,000;
2. profile: ramp / soak / spike;
3. exact confirmation: `RUN_SCALE7_CERTIFICATION`.

Required configuration:

- secret `VERCEL_AUTOMATION_BYPASS_SECRET`.

SCALE-7 no longer requires a human CTO session cookie. The workflow mints short-lived GitHub Actions OIDC tokens with audience `dtsc-scale7` and uses them only for the governed auth-pool endpoint and the Scalability observability snapshot. The normal Administration DTSC UI still requires a human session with `SECURITY_READ`.

Optional configuration:

- secret `SCALE7_AUTH_CONTEXTS_JSON` — operator override only. Without it, the workflow mints a GitHub Actions OIDC token and requests the managed synthetic pool from `/api/internal/scale7/auth-pool`.

Governed fallbacks reduce duplicate Production configuration:

- application origin: `SCALE7_LOAD_BASE_URL` overrides `SCALE1_LOAD_BASE_URL`; if neither repository variable exists, the canonical Production origin `https://app.dtsc-platform.com` is used.

The older SCALE-7 CTO-cookie fallback from #687 is intentionally superseded for this workflow because a human session can expire before a certification run. SCALE-1 may continue to use its own governed CTO session contract. SCALE-7 instead renews its short-lived OIDC authorization while sampling observability.

This does not weaken the workload topology. A dedicated SCALE-7 multi-tenant identity pool remains mandatory; it is either generated through the governed OIDC path or supplied explicitly by the operator override.

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
