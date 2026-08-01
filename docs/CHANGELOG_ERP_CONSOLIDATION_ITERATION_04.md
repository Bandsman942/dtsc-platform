# Changelog — ERP Consolidation Iteration 04

## Baseline

- verified start SHA: `b83502c8b98b721c2a23dc7f61b776cf004e8d43`;
- Iterations 1, 2 and 3 verified merged before implementation;
- target branch: `feat/erp-consolidation-iteration-04-sector-convergence`.

## Added

- Pharmacy and Health convergence/ownership maps;
- sector financial mapping, data classification and cutover plan;
- additive sector extension and synchronization models;
- reversible per-organization cutover state and safe-off feature flags;
- Pharmacy supplier, catalog, procurement, receipt, invoice, payment, cash and inventory-accounting bridges;
- Health patient financial profile, service catalog, insurer, billing, payer-component and payment bridges;
- static accounting sector adapters;
- restricted convergence administration APIs;
- deterministic dry-run/apply backfills;
- Pharmacy/Health confidentiality, financial and cutover QA gates;
- canonical registry dependency and permission overlays;
- sector accounting, billing, workflow and reporting documentation.

## Authority decisions

- Pharmacy regulated lot quantities remain Pharmacy-authoritative in Iteration 4.
- Common ERP invoices, receivables, payments, treasury and posted journals own new financial balances after cutover.
- Health clinical data remains Health-authoritative and is not copied into Finance.
- Patient and insurer responsibilities are explicit payer components of one common receivable.
- Permanent dual write is prohibited.

## Safety

- no legacy table or column deletion;
- no old migration modification;
- no automatic merge by name similarity;
- no invented cash/bank account, payer, supplier or historical posting;
- no clinical payload in Finance logs, journal descriptions or push notifications;
- ambiguous records are marked for controlled reconciliation.

## Incident record

During connector-based implementation, early file mutations using an unsupported branch argument advanced `main` through commit `138823081636eb3979fa58b0f6775d3a6614e297` before the feature PR. The history was not rewritten. The feature branch was synchronized with `main` through PR #35, and PR #34 remains the review/quality-gate vehicle for the complete correction. The accidental `main` deployment failed and did not provide a verified new Production release.

## Deferred to Iteration 5

- destructive removal of obsolete sector finance workspaces, APIs, fields and tables;
- retirement of compatibility routes, aliases, projections and feature flags;
- final archive of unmapped legacy data;
- final Pharmacy regulated quantity journal decision;
- long-term performance stabilization and cleanup.
