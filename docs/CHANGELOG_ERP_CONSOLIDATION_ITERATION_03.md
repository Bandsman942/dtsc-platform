# ERP Consolidation — Iteration 3

Base verified: `1e2dd57fe6a98ebe1064d947c2ec660106db52d1`

Branch: `feat/erp-consolidation-iteration-03-finance-accounting`

Pull request: `#33`

## Objective

Establish unified finance, accounting, operational taxation and treasury for CLIENT organizations while preserving DTSC internal finance, Pharmacy finance and Health finance until their controlled convergence.

## Architecture

- Added a canonical static posting registry and dedicated domain services under `lib/enterprise/accounting/`.
- Enforced double-entry accounting, `Prisma.Decimal`, open-period checks, historical exchange-rate snapshots, advisory locks, Serializable transactions and stable idempotency keys.
- Kept posted entries immutable; corrections use linked reversals.
- Kept Sales Order, Purchase, Receipt, Expense, Payroll Run, Stock Movement and Asset as their operational sources of truth.
- Used invoices for receivables/payables, allocations for open balances, treasury transactions for operational cash movement and `POSTED` journal lines for the ledger.

## Prisma and migrations

Added additive models for:

- finance configuration, fiscal years, periods and close;
- chart of accounts, groups, accounts and mappings;
- journals, entries, lines, reversals and posting batches;
- currencies, exchange rates and immutable snapshots;
- customer invoices, credit notes, receivables and allocations;
- supplier invoices, credit notes, payables, allocations and three-way matching;
- payments, methods, events and allocations;
- financial accounts, treasury transactions and account transfers;
- cash sessions, movements, counts and discrepancies;
- bank statements and reconciliation;
- operational taxes;
- inventory cost layers and accounting events;
- asset accounting profiles, schedules, entries and disposals;
- accounting dimensions, opening balances and statement snapshots.

Migrations are ordered from `20260731163001` through `20260731163010`, including a deterministic module backfill. Existing migrations were not edited and no table or column was removed.

## Posting events

The static allow-list includes customer/supplier invoices and credit notes, customer/supplier/payroll payments, payment allocations, expenses, payroll liabilities, inventory receipts/issues, asset capitalization/depreciation, cash variances, bank charges and opening balances.

No client-provided SQL, JavaScript, Prisma model name, free formula or arbitrary posting account is accepted.

## Operational chains

### Order to cash

Sales Order -> Sales Invoice -> approval -> issue/posting -> Receivable -> Payment -> Allocation -> Treasury -> Reconciliation.

### Purchase to pay

Purchase -> Receipt -> Supplier Invoice -> three-way match -> review -> approval -> posting -> Payable -> Payment -> Allocation -> Treasury -> Reconciliation.

### Payroll to payment

Approved customer Payroll Run -> aggregated payroll liability -> Payment -> Treasury -> Journal Entry. DTSC internal payroll remains separate.

### Inventory to cost

Common Stock Movement -> weighted-average cost layer/event -> inventory/clearing or cost-of-sales posting. Pharmacy stock is not migrated.

### Asset to depreciation

Enterprise Asset -> accounting profile -> capitalization -> straight-line schedule -> idempotent depreciation -> disposal calculation.

## Modules and workspaces

Registered and provisioned 14 canonical modules:

- FINANCE_OVERVIEW
- FINANCE_RECEIVABLES
- FINANCE_PAYABLES
- FINANCE_PAYMENTS
- FINANCE_TREASURY
- FINANCE_CASH
- FINANCE_BANK
- FINANCE_RECONCILIATION
- FINANCE_ACCOUNTING
- FINANCE_TAX
- FINANCE_CLOSE
- FINANCE_STATEMENTS
- FINANCE_ASSETS
- FINANCE_INVENTORY

Each module has a dedicated route under `/enterprise-modules/FINANCE_*`, uses the canonical access resolver and renders a responsive finance workspace with horizontal mobile navigation, compact lists, filters, pagination, dark-mode compatibility and deep-link highlighting.

## APIs and security

Finance APIs are dedicated by domain. Mutations apply session, active organization, active membership, CLIENT organization, module, entitlement, permission, visibility, same-origin, Zod, awaited rate limit, transaction, optimistic concurrency, `ApiLog`, `AuditLog` and operational events.

Sensitive salary, banking, fiscal, payment and unpublished-report data remain permission-protected. External account references are masked and secrets are not persisted in the finance domain.

## Workflow Engine

Added finance entity adapters and draft templates for:

- supplier invoice review, approval and posting;
- supplier payment approval and confirmation;
- independent cash-session close;
- manual journal approval and posting;
- fiscal-period close review.

Adapters call dedicated domain services and never write financial statuses directly.

## Quality gates

Added and wired into `qa:regression`:

- `qa:enterprise-accounting`
- `qa:enterprise-receivables`
- `qa:enterprise-payables`
- `qa:enterprise-treasury`
- `qa:enterprise-financial-close`
- `qa:enterprise-financial-statements`

The migration Quality Gate applies every historical and Iteration 3 migration against an empty PostgreSQL 16 database with pgvector before Prisma generation.

## Rollback

Rollback is non-destructive:

- disable Finance modules or automatic posting;
- keep draft capture if authorized;
- preserve invoices, payments, allocations, treasury transactions, journal entries and periods;
- keep posted entries read-only;
- restore the prior Finance workspace temporarily;
- never remove migrations, reopen periods silently or introduce dual-write.

## Deferred to Iteration 4

- PharmacySale -> common finance
- PharmacyInvoice -> common customer invoice
- PharmacyPayment -> common payment
- PharmacyCashSession -> common treasury
- HealthMedicalInvoice -> common invoice
- HealthMedicalInvoicePayment -> common payment
- HealthInsuranceCoverage -> insurer receivable

No sector model is deleted or implicitly backfilled in this iteration.

## Production status

This file records implementation scope only. Merge SHA, Production SHA, Production migrations and authenticated smoke-test results must be added after they are actually verified.
