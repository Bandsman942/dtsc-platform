# ERP Sector Financial Mapping

## Purpose

This document defines how Pharmacy and Health business events enter the common commercial, receivables, payments, treasury and accounting chains without creating duplicate balances.

## Authoritative chains

### Pharmacy sales

```text
PharmacySale
  -> PharmacySalesExtension
  -> EnterpriseSalesInvoice
  -> EnterpriseReceivable
  -> EnterprisePayment + EnterprisePaymentAllocation
  -> EnterpriseFinancialAccount / EnterpriseCashSession
  -> EnterpriseJournalEntry
```

### Pharmacy procurement

```text
PharmacyPurchaseOrder
  -> PharmacyPurchaseExtension
  -> EnterprisePurchase
  -> EnterprisePurchaseReceipt
  -> EnterpriseSupplierInvoice
  -> EnterprisePayable
  -> EnterprisePayment + EnterprisePaymentAllocation
  -> Treasury
  -> EnterpriseJournalEntry
```

### Pharmacy inventory accounting

```text
PharmacyStockMovement (regulated quantity authority)
  -> EnterpriseSectorInventoryEvent (idempotent projection)
  -> EnterpriseInventoryAccountingEvent / valuation service
  -> EnterpriseInventoryValuation
  -> EnterpriseJournalEntry
```

### Health billing

```text
HealthMedicalInvoice
  -> HealthBillingExtension
  -> EnterpriseSalesInvoice
  -> payer components (patient / insurer / employer / partner)
  -> EnterpriseReceivable
  -> EnterprisePayment + allocations
  -> Treasury
  -> EnterpriseJournalEntry
```

## Event mapping

| Sector event | Common event or service | Required mapping keys | Accounting effect |
|---|---|---|---|
| `PHARMACY_SALE_INVOICED` | common sales invoice create/approve/issue | sale, customer party, mapped catalog items, unique invoice extension | revenue, tax and receivable |
| `PHARMACY_CUSTOMER_PAYMENT_CONFIRMED` | common payment create/approve/confirm + allocation | Pharmacy payment, common invoice/receivable, payer, financial account | treasury debit and receivable credit |
| `PHARMACY_REFUND_CONFIRMED` | common refund payment and optional sales credit note | original payment/allocation, invoice, reason | reverse treasury and/or receivable/revenue |
| `PHARMACY_PURCHASE_RECEIVED` | common purchase receipt link | supplier, purchase, mapped catalog lines | no supplier liability by itself |
| `PHARMACY_SUPPLIER_INVOICE_POSTED` | common supplier invoice | mapped supplier/purchase/receipt | inventory or expense and payable |
| `PHARMACY_STOCK_ISSUED` | inventory issue valuation service | source movement, product, lot, cost | cost of sales and inventory |
| `PHARMACY_STOCK_RETURNED` | inventory return valuation service | original issue and validated lot return | inventory and cost reversal |
| `PHARMACY_STOCK_LOSS` | sector inventory accounting adapter | movement, reason, mapped product and cost | loss expense and inventory |
| `PHARMACY_STOCK_EXPIRED` | sector inventory accounting adapter | expired lot, approved write-off | expiry expense and inventory |
| `PHARMACY_CASH_VARIANCE_POSTED` | common cash variance posting | mapped common cash session | cash shortage/overage account |
| `HEALTH_MEDICAL_INVOICE_POSTED` | common sales invoice create/approve/issue | Health invoice, patient party profile, mapped services, unique extension | revenue, tax and receivable components |
| `HEALTH_PATIENT_PAYMENT_CONFIRMED` | common customer payment and allocation | patient payer component and financial account | treasury and patient receivable |
| `HEALTH_INSURANCE_RECEIVABLE_CREATED` | payer-component creation | insurer party, coverage request and common invoice | insurer receivable subdivision; no duplicate invoice |
| `HEALTH_INSURANCE_PAYMENT_CONFIRMED` | common payment with multi-invoice allocations | insurer party and approved components | treasury and insurer receivables |
| `HEALTH_CREDIT_NOTE_POSTED` | common sales credit note | common invoice and authorized reason | receivable/revenue/tax reduction |
| `HEALTH_DISPENSATION_INVOICED` | Health billing item on common invoice | unique dispensation mapping | revenue only once; stock event separate |
| `HEALTH_WRITE_OFF_APPROVED` | controlled receivable write-off | payer component, approval and account mapping | bad debt/write-off and receivable |

## Idempotency

Every adapter uses the stable tuple:

```text
organizationId
sector
sourceEntityType
sourceEntityId
eventType
eventVersion
```

The tuple is stored in `EnterpriseSectorSyncState` and, when a journal entry is produced, in the common posting batch/idempotency structures. Repeating the same event must return the existing target objects.

## Currency boundaries

- A sector source, common invoice, receivable component, payment and allocation must use compatible currency.
- No adapter converts a currency without an explicit, persisted exchange-rate snapshot.
- Reporting groups totals by currency unless it uses the common functional-currency ledger.
- Legacy sector base-currency fields are comparison evidence, not authority after cutover.

## Balance authority

| Balance | Authority after cutover |
|---|---|
| Pharmacy sale operational status | `PharmacySale` |
| Pharmacy lot quantity | `PharmacyBatch` / `PharmacyStockMovement` |
| Customer invoice total and open balance | `EnterpriseSalesInvoice` + `EnterpriseReceivable` + confirmed allocations |
| Supplier liability | `EnterpriseSupplierInvoice` + `EnterprisePayable` + confirmed allocations |
| Cash position | `EnterpriseFinancialAccount` / `EnterpriseCashSession` and posted entries |
| Health patient/insurer open amounts | payer components and common receivable allocations |
| Ledger and statements | posted `EnterpriseJournalEntry` lines only |

## Anti-duplication controls

- Unique sector extension per source object and common target.
- Unique sync key per event/version.
- One common invoice per sector invoice.
- One authoritative common payment per new sector payment.
- A Health dispensation, consultation or lab request cannot be invoiced twice.
- A Pharmacy stock movement cannot create two valuation events.
- Common reports use common financial objects after cutover and exclude the matching legacy projection.

## Failure handling

- `PENDING`: source accepted, target not complete.
- `SYNCED`: target created and verified.
- `FAILED`: retryable technical or rule failure.
- `AMBIGUOUS`: human reconciliation required.
- `LEGACY_UNMAPPED`: historic source cannot be mapped without invention.
- `CUTOVER_COMPLETE`: domain is authoritative in the Core for new financial writes.

A failed adapter never marks a sector source paid, posted or synchronized unless the common transaction committed. Where source and target cannot share one transaction, a persisted sync state and idempotent retry provide compensation and recovery.
