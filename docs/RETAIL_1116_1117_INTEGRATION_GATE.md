# Joint RETAIL POS #1118 and Finance #1119 isolated E2E gate

**Integration test candidate only — do NOT merge this PR.** This branch combines existing, individually green candidate work for simultaneous build, migration, regression and Playwright execution. No Production deployment, no real customer data and no Vercel Preview.

Baseline POS #1118: `9a624075136986fd8bca9287cf055de58f071dcf`; overlay Finance #1119: `cd71c3951d98dedebaecf90af7f7f0e5b758d75b`; common files manually reconciled: package.json, Quality Gate, behavioral workflow and the CI auth/reset contract.

Both `qa:retail-five-lots-1116` and `qa:retail-financial-kpi-v2` run. Both authenticated browser suites run after their own disposable Redis reset; Production sign-in rate limiting is unchanged. Version stays 1.12.0.

The owner still must validate the two original PRs separately. A green integration candidate is not fiscal certification, PWA true-offline certification or real-hardware certification. Never merge this integration-only PR, and do not merge either original until explicit E2E BON and approval.

## Evidence observed on 2026-11-12

- [PASS] Joint [Shop 2 behavioral workflow run #1977](https://github.com/Bandsman942/dtsc-platform/actions/runs/43202887629), SHA `faa554ce0292e173ad6034d2c141444f2ab699de`: clean test database, app build, all legacy browser groups, extra offline Finance draft replay **PASS**, extra 12-KPI source evidence **PASS**, separate disposable CI Redis resets.
- [PENDING] Full integration Quality Gate: initial run failed PR governance/SemVer metadata, not product runtime. PR title, issue link, acknowledgements, labels and milestone have been corrected. A fresh `pull_request.synchronize` event must re-evaluate the *current* PR metadata; reruns of the original event retain its old snapshot.
- [PENDING] Owner final E2E #1118 and #1119, hardware/PWA real-offline and full source reconciliation. Do not infer their certification from the isolated browser suite.

**The test-only integration branch must never be merged.** After the source PRs receive owner approval, reconcile the four common files on the newest `main` and rerun the complete CI, not a manual Vercel deployment.
