# SCALE-4G — Durable Finance report generation

Issue: #516

## Objective

Heavy Finance report generation no longer runs inside the interactive HTTP request. DTSC Platform reuses the canonical SCALE-4 durable queue (`EnterpriseDomainEvent`) and the existing protected bulk worker.

```text
POST report request
→ tenant/RBAC/Zod/same-origin/rate-limit validation
→ EnterpriseDomainEvent PENDING
→ atomic worker claim/lease
→ permission/source revalidation
→ consistent Finance snapshot transaction
→ immutable EnterpriseReport
→ PROCESSED/DEAD
→ tenant-scoped status + existing report consultation/export
```

No second jobs table or queue is introduced.

## Report families

The durable worker generates the four report families already implemented by `report-service.ts`:

- `BUDGET_VS_ACTUAL`;
- `EXPENSE_SUMMARY`;
- `PROCUREMENT_SUMMARY`;
- `FINANCE_OVERVIEW`.

The reporting service remains Decimal-safe and preserves separate currency buckets. A report stays a derived projection; it never mutates Budget, Expense, Purchase, Treasury or Accounting truth.

## Durable identity and crash recovery

A request is normalized and hashed with SHA-256 from:

- `organizationId`;
- requesting `actorUserId` because visibility is actor-dependent;
- calculation version;
- five-minute freshness bucket;
- normalized report definition/filters.

The digest becomes both the durable request identity and `EnterpriseReport.generationKey`. The additive unique constraint `(organizationId, generationKey)` prevents duplicate snapshots.

Recovery cases:

- identical enqueue in the same freshness bucket reuses the existing non-DEAD event;
- DEAD retry resets the same event;
- crash before report commit rolls back the snapshot transaction and the queue retries;
- crash after report commit but before worker acknowledgement is recovered by finding the existing `generationKey` before recalculation;
- a uniqueness race (`P2002`) resolves by loading the already-created report.

`calculationVersion` is persisted on the report and inside snapshot metadata. A future formula change must increment this version rather than silently changing the meaning of an old snapshot.

## Freshness

Generation requests with the same tenant, actor and normalized parameters deduplicate for five minutes. A request in a later freshness bucket can create a new immutable snapshot. Existing snapshots are never recalculated in place and no implicit infinite refresh loop exists.

## Transaction budget and consistency

The rest of DTSC Platform keeps the Prisma global interactive transaction budget (`maxWait=2s`, `timeout=5s`). SCALE-4G does not widen it globally.

Finance report calculation explicitly uses:

- `maxWait = 2,000 ms`;
- `timeout = 90,000 ms`;
- PostgreSQL/Prisma `REPEATABLE READ`;
- worker lease = 240 seconds;
- canonical worker batch = 2, concurrency = 1.

Two worst-case 90-second report transactions remain below the 240-second lease and the internal worker route's 300-second runtime budget. `REPEATABLE READ` keeps all aggregates contributing to one snapshot consistent within the report transaction.

## Permissions and tenant isolation

Interactive enqueue requires:

- same-origin request;
- authenticated session;
- active organization/membership through canonical Finance access;
- `REPORTS` submit/create capability;
- Zod validation;
- awaited rate limiting.

The worker revalidates `REPORTS` create capability at processing time. `generateEnterpriseReport` then re-resolves source capabilities for `FINANCE_BUDGETS` and/or `SUPPLIERS_PURCHASES`, including the actor's visibility scope. Explicit budget/source references are revalidated tenant-side before the snapshot is committed.

The DomainEvent payload contains only request metadata and normalized filters. It never contains `snapshotJson`, amounts, generated report rows or private documents.

The job status route is scoped by `organizationId`, event type and actor visibility. It never returns `snapshotJson` or raw worker error codes. Human failure messages are mapped server-side.

## UX and i18n

The Reports workspace now treats generation as nonblocking:

- `202 Accepted` closes the creation form immediately;
- FR/EN states: queued, processing, retrying, ready, failed;
- the active job id is kept in organization-scoped `sessionStorage`;
- the user can leave and return to the module;
- polling is every 3 seconds and capped at 100 attempts;
- no permanent spinner blocks the workspace.

## Export isolation

Current detailed report snapshots are already bounded to at most 500 detailed rows. Direct CSV export uses the same 500-row ceiling and therefore remains a bounded READY-snapshot operation.

If a future report family produces more than this budget, the current route fails closed with `REPORT_EXPORT_REQUIRES_DURABLE_JOB`; it must then be connected to the existing SCALE-4F private artifact mechanism rather than reintroducing a massive synchronous export or creating another queue.

CSV values neutralize spreadsheet formula injection and responses remain `private, no-store`.

## Observability

The protected internal worker endpoint exposes Finance-report operational metadata without financial contents:

- queued;
- processing;
- failed/retrying;
- completed in the last 24 hours;
- DEAD in the last 24 hours;
- terminal failure rate;
- average successful generation duration from a bounded recent sample;
- duration sample size.

The canonical queue snapshot continues to expose total ready depth, processing depth, DEAD depth and oldest-ready age.

## Prisma

Migration `20260906131500_add_enterprise_report_generation_key` is additive only:

- nullable `generationKey` preserves all historical snapshots;
- `calculationVersion` defaults to 1;
- tenant-scoped unique index protects new durable generation.

No historical migration is modified.

## Rollback

Rollback disables new durable report requests/worker dispatch while preserving every `EnterpriseReport` already generated. The additive columns/index can remain safely present. Rollback must not restore unbounded synchronous generation in the interactive route.

## Known boundaries

There is currently no mutable standalone `EnterpriseReportDefinition` entity. The queued normalized definition is immutable inside the durable request, while code-level formula semantics are pinned by `calculationVersion`. If a persistent report-definition model is introduced later, the worker must revalidate its tenant ownership and version before calculation.

A financial-period CLOSED/LOCKED rule is not currently part of the reporting input contract: reports are read-only projections and do not post entries. Existing date validation remains authoritative.

## QA

Permanent gate: `scripts/qa-scale4g-durable-finance-reports.mjs`, imported by `qa:regression`.

It protects canonical queue reuse, migration/idempotence, worker permissions, crash recovery, transaction budget/isolation, tenant status, FR/EN nonblocking UX, observability, bounded exports and the historical #574 OWNER_E2E durable flow.
