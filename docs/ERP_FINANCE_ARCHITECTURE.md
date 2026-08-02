# Enterprise Finance Architecture

## Boundary

The common finance domain belongs only to CLIENT organizations. DTSC internal finance (`Hrcfo*`, internal `FinancialAccount`) remains isolated. Pharmacy and Health may project approved sector events into the common finance domain, but they do not create a second receivable, payable, payment, allocation, treasury or posting engine.

Iterations 4 and 5 expose the common finance and accounting engines through dedicated professional workspaces. UI state is never a source of financial truth.

## Canonical chains

- Order-to-Cash: sales order → sales invoice → receivable → payment allocation → treasury → journal entry.
- Purchase-to-Pay: purchase → receipt → supplier invoice → payable → payment allocation → treasury → journal entry.
- Payroll-to-Payment: approved client payroll run → payroll liability posting → payment → treasury posting.
- Expense-to-Payment: approved expense classification → direct posting, supplier invoice projection or employee reimbursement; never double charged.
- Inventory-to-Cost: common stock movement → cost layer/event → inventory or cost-of-sales posting.
- Asset-to-Depreciation: enterprise asset → accounting profile → schedule → idempotent depreciation entry.
- Cash-to-Reconciliation: cash/bank/mobile-money transaction → statement/session → controlled reconciliation.
- Period-to-Close: open period → blocker checklist → independent approval → close/lock.
- Posting-to-Statement: validated business event → idempotent posting batch → balanced journal entry → ledger/trial balance → dynamic statement → immutable published snapshot.

## Sources of truth

| Domain | Source of truth |
| --- | --- |
| Sales order | `EnterpriseSalesOrder` |
| Customer invoice | `EnterpriseSalesInvoice` |
| Receivable balance | `EnterpriseReceivable` plus confirmed allocations |
| Supplier invoice | `EnterpriseSupplierInvoice` |
| Payable balance | `EnterprisePayable` plus confirmed allocations |
| Payment | `EnterprisePayment` |
| Payment allocation | `EnterprisePaymentAllocation` |
| Financial account | `EnterpriseFinancialAccount` |
| Operational treasury balance | confirmed `EnterpriseTreasuryTransaction` rows |
| Cash session | `EnterpriseCashSession` and its movements/counts/discrepancies |
| Bank statement | `EnterpriseBankStatement` and `EnterpriseBankStatementLine` |
| Reconciliation | `EnterpriseReconciliationSession` and confirmed matches |
| Chart of accounts | `EnterpriseChartOfAccounts` and `EnterpriseLedgerAccount` |
| Fiscal calendar | `EnterpriseFiscalYear` and `EnterpriseFiscalPeriod` |
| Journal configuration | `EnterpriseJournal` |
| Accounting balance | posted `EnterpriseJournalLine` rows |
| Posting idempotence | `EnterprisePostingBatch` plus source/version/idempotency key |
| Tax configuration | `EnterpriseTaxCode`, effective-dated rates and tax lines |
| Financial close | `EnterpriseFinancialClose` and fiscal period status |
| Published statement | immutable `EnterpriseFinancialStatementSnapshot` |
| Physical stock | common stock movements and balances |
| Inventory book value | cost layers and inventory accounting events |
| Operational asset | `EnterpriseAsset` |
| Asset book value | accounting profile, schedules and depreciation entries |
| Budget | existing `EnterpriseBudget` |
| Budget consumption | existing `EnterpriseExpense` and commitments |

## Professional workspace layer

### Iteration 4 — Operational Finance

- `FINANCE_OVERVIEW` — configuration assistant, readiness checklist and actionable alerts;
- `FINANCE_RECEIVABLES` — customer invoices, receivables, credit notes and ageing;
- `FINANCE_PAYABLES` — supplier invoices, payables, credit notes and three-way control;
- `FINANCE_PAYMENTS` — payments, approvals, confirmations and bounded allocations;
- `FINANCE_TREASURY` — financial accounts and controlled transfers;
- `FINANCE_CASH` — cash opening, operations, physical count and independent close;
- `FINANCE_BANK` — bounded statement import and line detail;
- `FINANCE_RECONCILIATION` — explainable matching and controlled completion.

### Iteration 5 — Accounting and advanced Finance

- `FINANCE_ACCOUNTING` — chart of accounts, accounts, fiscal years, periods, journals, journal entries, general ledger, trial balance, posting rules and anomalies;
- `FINANCE_TAX` — tax codes, effective-dated rates and tax account mappings;
- `FINANCE_CLOSE` — close checklist, blockers, approval, close and controlled reopening;
- `FINANCE_STATEMENTS` — dynamic previews and immutable published statements;
- `FINANCE_ASSETS` — controlled capitalization, fixed asset register and idempotent straight-line depreciation;
- `FINANCE_INVENTORY` — weighted-average cost layers, accounting valuation and immutable published valuation versions.

The workspace layer may format labels, dates and amounts, but never recalculates a canonical financial balance or bypasses a service transition. Large lists and ledger views are paginated server-side.

## Posting and immutability

A business event is posted through the single common posting engine. The stable identity includes tenant, source type, source id, posting event and posting version. Network retries and duplicate user actions reuse the existing posting batch.

A `POSTED` or `REVERSED` journal entry is immutable. Correction uses a linked reversal or a new corrective entry. The original is never rewritten or deleted.

## Published statements

A dynamic report is not a published financial statement. Publication creates an identifiable, timestamped, checksum-protected snapshot bound to its parameters. Later postings can change a new preview but never mutate the previously published version.

## Documents and comments

Financial evidence uses the common private document system with structural entity links. `EnterpriseFinanceComment` adds tenant-scoped, author-controlled, logically archived collaboration. Comments do not replace approvals, rejections, postings, reversals, close decisions or reconciliation decisions.

## Safety invariants

1. Server-side `Prisma.Decimal` is authoritative for every amount.
2. Posted entries are immutable; corrections use reversal plus a new entry.
3. Posting is blocked outside an open or explicitly authorized period.
4. Every source event has a stable tenant-aware idempotency key.
5. Payment, allocation, treasury and posting are separate durable objects.
6. Workflow adapters call dedicated services and cannot mutate financial statuses directly.
7. Reports read posted lines only and never sum different currencies as one amount.
8. A customer invoice produces at most one common receivable; a supplier invoice produces at most one common payable.
9. A cash account has at most one compatible active session.
10. A bank statement line cannot be reconciled more than once beyond its available amount.
11. A tax rate change never rewrites historical tax lines.
12. An operational asset is not automatically a fixed asset.
13. Physical stock is not changed by an accounting valuation query.
14. A depreciation or inventory accounting event cannot be posted twice for the same source and version.
15. A company relationship, a global DTSC role or an unqualified manager role does not grant Finance access.

## Commercial maturity

The six iteration 5 modules are `PROFESSIONAL_READY` and remain `commercializable: false` until explicit owner-confirmed authenticated manual E2E validation, stable Production from `main`, and commercial acceptance.

**Tests E2E manuels préparés — validation du propriétaire en attente.**
