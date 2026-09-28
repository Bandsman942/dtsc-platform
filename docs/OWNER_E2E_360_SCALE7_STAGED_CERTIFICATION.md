# OWNER E2E #360 — SCALE-7 staged certification

## Preconditions

- dedicated load-test tenants exist and are isolated from real customer data;
- `SCALE7_LOAD_BASE_URL`, `SCALE7_AUTH_CONTEXTS_JSON`, `SCALE7_CTO_SESSION_COOKIE` and `VERCEL_AUTOMATION_BYPASS_SECRET` are configured;
- the branch SHA under test is the intended SHA;
- Console → CTO → Scalabilité is accessible with `SECURITY_READ`.

## Sequence

For each stage **500 → 1,000 → 2,500 → 5,000**:

1. run `ramp`;
2. inspect the report and infrastructure evidence;
3. run `soak`;
4. inspect the report;
5. run `spike`;
6. stop immediately on FAIL; do not advance to the next stage.

For every successful run:

- retain the GitHub Actions artifact;
- archive the sanitized report with `archive-scale7-certification.mjs`;
- verify the dashboard displays the archived stage/profile without exposing secrets.

## Acceptance

- HTTP error rate remains below 1%;
- P95/P99 respect 1,000/2,000 ms;
- tenant isolation remains 100%;
- no PostgreSQL exhaustion;
- Redis never reaches UNAVAILABLE;
- AI saturation remains bounded by SCALE-6 and does not destabilize ERP/Shop;
- archived evidence reference points to the real workflow run;
- FR/EN, responsive and secret-free CTO view remains intact.

Do not report a stage as certified from repository inspection alone.
