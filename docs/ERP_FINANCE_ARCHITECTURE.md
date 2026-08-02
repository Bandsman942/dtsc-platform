# Enterprise Finance Architecture

## Boundary

The common finance domain belongs only to CLIENT organizations. DTSC internal finance (`Hrcfo*`, internal `FinancialAccount`) remains isolated. Pharmacy and Health may project approved sector events into the common finance domain, but they do not create a second receivable, payable, payment, allocation, treasury or posting engine.

Iteration 4 exposes the common finance engine through dedicated professional workspaces. UI state is never a source of financial truth.

## Canonical chains

- Order-to-Cash: sales order → sales invoice → receivable → payment allocation → treasury → journal entry.
- Purchase-to-Pay: purchase → receipt → supplier invoice → payable → payment allocation → treasury → journal entry.
- Payroll-to-Payment: approved client payroll run → payroll liability posting → payment → treasury posting.
- Expense-to-Payment: approved expense classification → direct posting, supplier invoice projection or employee reimbursement; never double charged.
- Inventory-to-Cost: common stock movement → cost layer/event → inventory or cost-of-sales posting.
- Asset-to-Depreciation: enterprise asset → accounting profile → schedule → idempotent depreciation entry.
- Cash-to-Reconciliation: cash/bank/mobile-money transaction → statement/session → controlled reconciliation.
- Period-to-Close: open period → blocker checklist → independent approval → close/lock.

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
| Accounting balance | posted `EnterpriseJournalLine` rows |
| Physical stock | common stock movements and balances |
| Inventory book value | cost layers and inventory accounting events |
| Operational asset | `EnterpriseAsset` |
| Asset book value | accounting profile and depreciation entries |
| Budget | existing `EnterpriseBudget` |
| Budget consumption | existing `EnterpriseExpense` and commitments |
| Accounting | posted journal entries and lines |

## Professional workspace layer

The following canonical modules use dedicated workspaces:

- `FINANCE_OVERVIEW` — configuration assistant, readiness checklist and actionable alerts;
- `FINANCE_RECEIVABLES` — customer invoices, receivables, credit notes and ageing;
- `FINANCE_PAYABLES` — supplier invoices, payables, credit notes and three-way control;
- `FINANCE_PAYMENTS` — payments, approvals, confirmations and bounded allocations;
- `FINANCE_TREASURY` — financial accounts and controlled transfers;
- `FINANCE_CASH` — cash opening, operations, physical count and independent close;
- `FINANCE_BANK` — bounded statement import and line detail;
- `FINANCE_RECONCILIATION` — explainable matching and controlled completion.

The workspace layer may format labels, dates and amounts, but never recalculates a canonical financial balance or bypasses a service transition.

## Documents and comments

Financial evidence uses the common private document system with structural entity links. `EnterpriseFinanceComment` adds tenant-scoped, author-controlled, logically archived collaboration. Comments do not replace approvals, rejections, postings or reconciliation decisions.

## Safety invariants

1. Server-side `Prisma.Decimal` is authoritative for every amount.
2. Posted entries are immutable; corrections use reversal plus a new entry.
3. Posting is blocked outside an open/authorized period.
4. Every source event has a stable tenant-aware idempotency key.
5. Payment, allocation, treasury and posting are separate durable objects.
6. Workflow adapters call dedicated services and cannot mutate financial statuses directly.
7. Reports read posted lines only and never sum different currencies as one amount.
8. A customer invoice produces at most one common receivable; a supplier invoice produces at most one common payable.
9. A cash account has at most one compatible active session.
10. A bank statement line cannot be reconciled more than once beyond its available amount.

## Commercial maturity

Dedicated operational Finance modules may reach `PROFESSIONAL_READY` after automated gates. `COMMERCIAL_READY` additionally requires explicit owner-confirmed authenticated manual E2E validation.
