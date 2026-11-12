# Joint RETAIL POS #1118 and Finance #1119 isolated E2E gate

**Integration test candidate only — do NOT merge this PR.** This branch combines existing, individually green candidate work for simultaneous build, migration, regression and Playwright execution. No Production deployment, no real customer data and no Vercel Preview.

Baseline POS #1118: `9a624075136986fd8bca9287cf055de58f071dcf`; overlay Finance #1119: `cd71c3951d98dedebaecf90af7f7f0e5b758d75b`; common files manually reconciled: package.json, Quality Gate, behavioral workflow and the CI auth/reset contract.

Both `qa:retail-five-lots-1116` and `qa:retail-financial-kpi-v2` run. Both authenticated browser suites run after their own disposable Redis reset; Production sign-in rate limiting is unchanged. Version stays 1.12.0.

The owner still must validate the two original PRs separately. A green integration candidate is not fiscal certification, PWA true-offline certification or real-hardware certification. Never merge this integration-only PR, and do not merge either original until explicit E2E BON and approval.
