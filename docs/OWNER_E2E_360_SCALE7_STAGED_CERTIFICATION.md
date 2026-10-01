# OWNER E2E #360 — SCALE-7 staged certification

## Preconditions

- the governed GitHub Actions OIDC provisioning route is deployed on the Production SHA being certified;
- the managed SCALE-7 tenants are synthetic and isolated from real customer data;
- `VERCEL_AUTOMATION_BYPASS_SECRET` is present; SCALE-7 observability uses GitHub Actions OIDC and does not require a CTO session cookie;
- `SCALE7_AUTH_CONTEXTS_JSON` is optional and used only when an operator intentionally overrides the managed OIDC pool;
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

- confirm the workflow log reports the governed multi-tenant pool topology only as tenant/identity counts, never cookies;
- confirm the initial observability snapshot succeeds through GitHub OIDC before k6 starts and no CTO cookie is required;
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
