# Enterprise Finance Architecture

## Boundary

The common finance domain belongs only to CLIENT organizations. DTSC internal finance (`Hrcfo*`, internal `FinancialAccount`) and sector finance (`Pharmacy*`, `HealthMedicalInvoice*`) remain isolated until Iteration 4.

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
| Operational treasury balance | confirmed `EnterpriseTreasuryTransaction` rows |
| Accounting balance | posted `EnterpriseJournalLine` rows |
| Physical stock | common stock movements and balances |
| Inventory book value | cost layers and inventory accounting events |
| Operational asset | `EnterpriseAsset` |
| Asset book value | accounting profile and depreciation entries |
| Budget | existing `EnterpriseBudget` |
| Budget consumption | existing `EnterpriseExpense` and commitments |
| Accounting | posted journal entries and lines |

## Safety invariants

1. Server-side `Prisma.Decimal` is authoritative for every amount.
2. Posted entries are immutable; corrections use reversal plus a new entry.
3. Posting is blocked outside an open/authorized period.
4. Every source event has a stable tenant-aware idempotency key.
5. Payment, allocation, treasury and posting are separate durable objects.
6. Workflow adapters call dedicated services and cannot mutate financial statuses directly.
7. Reports read posted lines only and never sum different currencies as one amount.
