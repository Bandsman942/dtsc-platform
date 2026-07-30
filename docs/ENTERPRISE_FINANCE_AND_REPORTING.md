# Enterprise Finance & Reporting — ERP Core v2 Sprint 8

## Scope

Sprint 8 finalizes the large common ERP domains that were still represented by `EnterpriseCoreRecord` for organization clients. New `BUDGET`, `EXPENSE` and `REPORT` data uses dedicated models:

- `EnterpriseBudget`
- `EnterpriseBudgetLine`
- `EnterpriseBudgetCommitment`
- `EnterpriseExpense`
- `EnterpriseReport`

`EnterpriseCoreRecord` remains for legacy/history and residual domains such as `NOTICE`; historical Core BUDGET/EXPENSE/REPORT rows remain readable but are not new sources of truth.

This scope is only for customer organizations (`ORGANIZATION`). It does not replace the DTSC internal HR & CFO domain (`HrcfoBudget`, `HrcfoExpense`, payroll, `FinancialAccount`) and it does not replace specialized PHARMACY, HEALTH_CARE or future sector tables.

## Business chain

```text
EnterpriseRequest
    ↓
EnterpriseApproval
    ↓
EnterprisePurchase
    ↓
EnterpriseBudgetCommitment
    ↓
EnterprisePurchaseReceipt
    ↓
EnterpriseExpense
    ↓
Budget actual
    ↓
EnterpriseReport
```

Receiving a purchase does not automatically approve an expense. A receipt proves that goods/services were received. `EnterpriseExpense` is a distinct financial ERP object and starts in `DRAFT`, including when it is prepared from a purchase.

## Budget structure

A budget has one currency, one period and structured lines. The budget does not persist a client-provided authoritative total. Its planned total is derived server-side:

```text
planned = Σ EnterpriseBudgetLine.plannedAmount
```

Each line can carry a code, name, category and department. Line amounts use `Prisma.Decimal` with centralized two-decimal money rounding. The line implicitly uses the parent budget currency.

Budget lifecycle:

```text
DRAFT
  → PENDING_APPROVAL
  → ACTIVE
  → CLOSED

PENDING_APPROVAL → REJECTED
REJECTED → DRAFT       (explicit reopen)
DRAFT → CANCELLED
```

Only `DRAFT` is editable. `PENDING_APPROVAL` is locked. `ACTIVE` locks period, currency, lines and planned amounts; Sprint 8 does not implement amendments that rewrite financial history.

## EnterpriseApproval reuse

Budgets and expenses reuse `EnterpriseApproval`; there is no `EnterpriseBudgetApproval` or `EnterpriseExpenseApproval` table.

Submission chooses an authorized active organization member as approver. The creator/requester cannot approve the same financial object. No hidden amount threshold or manager bypass is introduced. Approval and the target financial transition are performed transactionally with expected status and optimistic revision checks.

```text
Budget PENDING_APPROVAL + Approval APPROVED → Budget ACTIVE
Budget PENDING_APPROVAL + Approval REJECTED → Budget REJECTED

Expense PENDING_APPROVAL + Approval APPROVED → Expense APPROVED
Expense PENDING_APPROVAL + Approval REJECTED → Expense REJECTED
```

## Commitments and budget position

An approved purchase can optionally target an `EnterpriseBudgetLine`. Existing/unbudgeted purchases remain valid.

For each budget line:

```text
remaining commitment = committedAmount - realizedAmount - releasedAmount

available = plannedAmount - remaining commitment - approved actual expenses
```

All calculations happen server-side with Decimal-safe arithmetic.

Example:

```text
planned = 10,000 USD
approved purchase = 2,000 USD
remaining commitment = 2,000 USD
actual = 0 USD
available = 8,000 USD
```

After approving an expense of 1,500 USD against that purchase:

```text
remaining commitment = 500 USD
actual = 1,500 USD
available = 8,000 USD
```

The 1,500 USD is converted from commitment to actual; it is not counted twice.

### Purchase approval → commitment

When an approved purchase has a valid budget line:

- the budget must be `ACTIVE`;
- purchase currency must equal budget currency;
- server availability is recalculated;
- insufficient budget blocks the approval/commitment;
- the commitment is created in the same business transaction;
- `(organizationId, sourceEntityType, sourceEntityId)` is unique, making the purchase commitment idempotent.

### Purchase cancellation → release

If an approved purchase is cancelled before all of its commitment is realized, the remaining committed amount becomes released. The released amount no longer reduces availability. Guarded updates prevent concurrent double release.

### Expense approval → actual

When an expense references the same purchase and budget line, approval realizes at most the remaining purchase commitment. Budget capacity is checked as:

```text
approval capacity = current available + commitment portion being converted to actual
```

This is deliberate: the portion already reserved by the purchase is replaced by actual expense consumption rather than counted a second time.

A budgeted expense not backed by an existing purchase commitment consumes available budget directly.

## EnterpriseExpense

`EnterpriseExpense` represents ERP expense/budget consumption. It is **not** proof that a bank transfer occurred and does not create a general-ledger entry.

Lifecycle:

```text
DRAFT → PENDING_APPROVAL → APPROVED
                       ↘ REJECTED
REJECTED → DRAFT       (explicit reopen)
DRAFT → CANCELLED
```

Only `DRAFT` can be edited. `APPROVED` is immutable in the normal Sprint 8 workflow. Financial reversal/correction accounting is intentionally outside this sprint.

### Purchase-sourced expenses

When `purchaseId` is supplied, the server loads the purchase from the same organization and can prefill:

- supplier;
- purchase reference/link;
- currency;
- purchase total;
- budget line.

The expense still starts in `DRAFT`. More than one expense may reference a purchase.

If the expense amount differs from the purchase total, `amountVarianceReason` is required. The approver can see the variance instead of receiving a silently altered amount.

### Budget controls

At approval time the server recalculates planned, remaining commitment, approved actual and available amounts. A budgeted expense cannot be approved beyond available capacity. Manager/owner capability does not silently override this rule.

An expense may remain unbudgeted. It is explicitly presented as `UNBUDGETED` in APIs/workspaces/reporting; Sprint 8 never invents a budget line automatically.

### Currency

A budget-linked expense must use exactly the budget currency. A purchase-linked expense must match the purchase currency. Sprint 8 has no FX engine.

## Supplier and document integration

An expense can reference an `EnterpriseSupplier`, `EnterprisePurchase`, `EnterpriseBudgetLine` and private `EnterpriseDocument` evidence. Every relation is resolved server-side in the same `organizationId`.

Evidence is linked through `EnterpriseEntityLink`; no public `invoiceUrl` or `receiptUrl` field is introduced. Existing document visibility and signed-download rules continue to apply.

Examples of links:

```text
EnterpriseBudget   → EnterprisePurchase
EnterpriseBudget   → EnterpriseExpense
EnterprisePurchase → EnterpriseExpense
EnterpriseSupplier → EnterpriseExpense
EnterpriseDocument → EnterpriseExpense
EnterpriseBudget   → EnterpriseReport
sector entity      → EnterpriseReport
```

Cross-tenant links are denied.

## EnterpriseReport

`EnterpriseReport` is a derived immutable snapshot. Primary financial truth stays in Budget, Purchase, Commitment and Expense tables.

Each report stores:

- controlled `reportType`;
- status;
- generation timestamp;
- optional period and currency filter;
- source reference if applicable;
- `schemaVersion`;
- `filtersJson`;
- server-produced `snapshotJson`.

Initial report types:

- `BUDGET_VS_ACTUAL`
- `EXPENSE_SUMMARY`
- `PROCUREMENT_SUMMARY`
- `FINANCE_OVERVIEW`

Report status:

```text
GENERATED → PUBLISHED → ARCHIVED
GENERATED ────────────→ ARCHIVED
```

Regeneration creates a new report snapshot; an existing historical snapshot is never recomputed in place.

### Budget vs actual

The snapshot includes line and currency buckets for:

- planned;
- remaining committed;
- approved actual;
- available;
- utilization.

The detailed snapshot is bounded; it stores useful aggregates and up to a controlled number of budget-line summaries, not raw database dumps.

### Expense summary

Approved expenses are aggregated with Prisma `groupBy` by supported dimensions such as:

- currency;
- category;
- department;
- supplier;
- unbudgeted status.

### Procurement summary

The report uses the real Sprint 7 models:

- `EnterprisePurchase`
- `EnterpriseSupplier`
- `EnterprisePurchaseReceipt`

It exposes status/supplier summaries, ordered amounts, receipt count and unbudgeted purchase indicators.

### Multi-currency boundary

Currency amounts are always kept in separate buckets. The application never computes a fake monetary total such as USD + EUR + CDF. Users can filter one currency or read separate currency summaries.

## Reporting performance and privacy

Report generation uses bounded queries, Prisma aggregates and `groupBy`. It does not load the entire organization database into Node memory.

Snapshots must not contain full private documents, patient records, banking secrets or copied sector-sensitive records. Sector reports can be linked through `EnterpriseEntityLink` without duplicating confidential clinical/pharmaceutical content.

CSV export serializes the existing snapshot. Sprint 8 does not add a heavy spreadsheet/PDF dependency solely for export.

## Security and tenant isolation

The request chain remains:

```text
session
→ active organization
→ ACTIVE OrganizationMember
→ module enabled
→ entitlement
→ role/action permission
→ object visibility
```

A global DTSC ADMIN without an active membership in the customer organization has no finance access.

Mutation routes apply same-origin checks, awaited rate limiting, dedicated Zod validation, AuditLog/ApiLog and server-controlled `organizationId`.

Optimistic concurrency uses `revision`; a stale revision returns a conflict instead of overwriting newer financial state.

## APIs

Budgets:

```text
GET/POST  /api/enterprise/{organizationId}/budgets
GET/PATCH /api/enterprise/{organizationId}/budgets/{id}
POST      /api/enterprise/{organizationId}/budgets/{id}/actions
GET       /api/enterprise/{organizationId}/budget-lines
GET       /api/enterprise/{organizationId}/finance-summary
```

Expenses:

```text
GET/POST  /api/enterprise/{organizationId}/expenses
GET/PATCH /api/enterprise/{organizationId}/expenses/{id}
POST      /api/enterprise/{organizationId}/expenses/{id}/actions
```

Reports:

```text
GET       /api/enterprise/{organizationId}/reports
POST      /api/enterprise/{organizationId}/reports/generate
GET       /api/enterprise/{organizationId}/reports/{id}
POST      /api/enterprise/{organizationId}/reports/{id}/actions
GET       /api/enterprise/{organizationId}/reports/{id}/export
```

Budget/expense decisions use the existing `EnterpriseApproval` APIs.

## UI / UX

`FINANCE_BUDGETS` uses a dedicated finance workspace containing Budgets and Expenses. `REPORTS` uses a dedicated Reports workspace.

The DTSC workspace pattern stays:

```text
ModuleWorkspace
→ ModuleHeader
→ Metrics
→ Toolbar
→ BusinessList
→ BusinessDetail
→ ContextActions
```

Mobile views show concise financial summaries rather than wide ten-column tables. Dialogs keep the existing high mobile/iOS treatment and native selects.

## Legacy compatibility

New generic Core writes for the following types are denied when dedicated models apply:

```text
TASK
OPERATION
MEETING
MINUTES
INTERNAL_REQUEST
VALIDATION
DOCUMENT
SUPPLIER
PURCHASE
BUDGET
EXPENSE
REPORT
```

Historical `EnterpriseCoreRecord` BUDGET/EXPENSE/REPORT rows remain readable and are displayed as legacy history. No ambiguous `metadataJson` is blindly backfilled.

## Explicit boundaries

- `EnterpriseExpense` ≠ bank payment.
- `EnterpriseBudget` ≠ accounting ledger.
- `EnterpriseReport` ≠ primary financial data.
- Enterprise organization finance ≠ DTSC internal HR & CFO finance.
- Common ERP finance ≠ specialized sector finance/stock truth.
- Sprint 8 implements no FX engine, general ledger, bank reconciliation, tax/VAT engine or hidden financial override.

## Sprint 9 readiness

Sprint 8 exposes stable orchestration points for the future Common Workflow Engine:

- explicit Budget/Expense submit commands;
- existing `EnterpriseApproval` target hooks;
- guarded transition services;
- operational events for submitted/approved/rejected/closed/cancelled/commitment realized/released;
- EntityLinks between business objects;
- report generation/publish commands.

Sprint 9 can orchestrate those entrypoints. It must not recreate budget, expense, approval or purchase business rules.

## Deployment and QA

The feature branch does not receive a functional Vercel Preview. Disabled-preview normalization is expected and is not functional validation.

Quality authority remains GitHub gates:

```text
pnpm type-check
pnpm lint
pnpm qa:enterprise-core-v2
pnpm qa:enterprise-core-v2-sprint7
pnpm qa:enterprise-finance-reports
pnpm qa:regression
pnpm build
prisma migrate deploy on empty PostgreSQL
```

After merge, only `main` triggers the unique Vercel Production path, which runs `prisma migrate deploy` before `pnpm build`.
