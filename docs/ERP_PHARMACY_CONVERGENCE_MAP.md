# ERP Pharmacy Convergence Map

## Scope and verified baseline

This map is based on the sector models currently present in `prisma/schema.prisma` and the common ERP models introduced by consolidation iterations 2 and 3. It is authoritative for Iteration 4. No legacy Pharmacy table is removed in this iteration.

## Ownership rule

- Common identity, commercial documents, receivables, payments, treasury and accounting: common ERP.
- Pharmaceutical attributes, prescriptions, lot-level quantities, FEFO, quarantine, recall, controlled-product rules and pharmacovigilance: Pharmacy.
- Legacy Pharmacy financial objects remain readable while new authoritative financial writes are progressively routed to the Core.

## Model-by-model mapping

| Current sector model | Current truth | Common part | Specialized part retained | Future truth | Target relation | Backfill | Cutover | Legacy | Sensitive class | Accounting event | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `PharmacyProduct` | Pharmacy | product code, commercial name, unit, price, tax, inventory flag | generic name, dosage, form, controlled status, prescription rules, storage and FEFO policy | Core + Pharmacy extension | deterministic mapping to `EnterpriseCatalogItem` | deterministic by existing migration key/internal code; otherwise manual | party/catalog flag | readable extension | PHARMACY_RESTRICTED | stock and cost events use the mapped catalog item | critical |
| `PharmacySupplier` | Pharmacy | legal identity, contacts, address, tax ID, payment terms, currency, lead time | licence, compliance, qualification, temperature and regulatory notes | Core + Pharmacy extension | `EnterpriseBusinessParty` + `EnterpriseSupplier` mapping | deterministic keys only; no name-only merge | supplier flag | readable extension | PHARMACY_RESTRICTED | supplier invoice/payable through Core | critical |
| `PharmacySupplierProduct` | Pharmacy | supplier/catalog association and price | pharmaceutical sourcing conditions | extension | mapped supplier and catalog item IDs | deterministic when both endpoints map | supplier/catalog flag | readable | PHARMACY_RESTRICTED | none directly | medium |
| `PharmacyPurchaseOrder` | Pharmacy | requester, supplier, currency, amounts, approval and purchasing status | pharmacist approval, expected lot, regulatory and temperature conditions | `EnterprisePurchase` + extension | FK mapping | deterministic when supplier and lines map | procurement flag | read-only projection after cutover | PHARMACY_RESTRICTED | later supplier invoice/payable | critical |
| `PharmacyPurchaseOrderLine` | Pharmacy | quantity, unit, price, discount and catalog item | pharmaceutical product and lot expectations | `EnterprisePurchaseItem` + extension metadata | parent mapping + catalog mapping | deterministic | procurement flag | readable | PHARMACY_RESTRICTED | purchasing commitment only | high |
| `PharmacyReceipt` | Pharmacy | supplier, PO, dates, currency and totals | quality acceptance, temperature and regulatory intake | `EnterprisePurchaseReceipt` + Pharmacy extension | FK mapping | deterministic when order maps | receipt flag | readable | PHARMACY_RESTRICTED | `PHARMACY_PURCHASE_RECEIPT_VALUED` | critical |
| `PharmacyReceiptLine` / `PharmacyReceiptBatch` | Pharmacy | common received quantities and values | lot, expiry, quarantine, recall and quality | Core receipt projection + Pharmacy lot authority | mapping and inventory accounting event | deterministic only for valid mapped products | inventory-accounting flag | authoritative for lot history | PHARMACY_RESTRICTED | valued receipt | critical |
| `PharmacyBatch` | Pharmacy | accounting cost reference and aggregated quantity projection | lot quantity, expiry, FEFO, quarantine, recall, temperature | Pharmacy | catalog/inventory mapping | deterministic by product mapping | no quantity cutover in Iteration 4 | authoritative | PHARMACY_RESTRICTED | receipt, issue, return, loss, expiry, adjustment | critical |
| `PharmacyStockMovement` | Pharmacy | accounting direction, quantity and value projection | regulatory lot movement and validation | Pharmacy for quantities; Core for accounting projection | `EnterpriseSectorInventoryEvent` | deterministic by product, lot and source movement | inventory-accounting flag | authoritative lot journal | PHARMACY_RESTRICTED | all Pharmacy inventory events | critical |
| `PharmacySale` | Pharmacy | commercial totals, customer, invoice trigger | prescription, pharmacist validation, FEFO lot selection and dispensation | Pharmacy + common invoice | mapping to `EnterpriseSalesInvoice` | deterministic for validated sales | finance flag | sector operation remains authoritative | PHARMACY_RESTRICTED | `PHARMACY_SALE_INVOICED`, stock issue | critical |
| `PharmacySaleLine` | Pharmacy | common quantity, price, tax and discount | exact lot/product dispensation | Pharmacy + invoice line mapping | source line metadata and mapped catalog item | deterministic | finance flag | readable | PHARMACY_RESTRICTED | revenue and cost of sales | critical |
| `PharmacyInvoice` | Pharmacy | legacy financial invoice | Pharmacy source reference only | `EnterpriseSalesInvoice` | one-to-one FK mapping | only when total, currency and customer are deterministic | finance flag | non-authoritative after cutover | FINANCIAL_CONFIDENTIAL | common sales invoice posting | critical |
| `PharmacyPayment` | Pharmacy | legacy collection | sector cashier, sale, prescription and point of sale | `EnterprisePayment` + extension | one-to-one FK mapping | amount, currency, payer and account must be deterministic | finance flag | non-authoritative after cutover | FINANCIAL_CONFIDENTIAL | customer payment confirmation and allocation | critical |
| `PharmacyCashSession` | Pharmacy | legacy cash session | point of sale and operational indicators | `EnterpriseCashSession` + extension | one-to-one FK mapping | deterministic account only; otherwise `LEGACY_UNMAPPED` | cash flag | readable history | FINANCIAL_CONFIDENTIAL | cash variance | critical |
| `PharmacyCashReceipt` | Pharmacy | legacy receipt | sector receipt rendering | common payment receipt/projection | contextual entity link | deterministic after payment mapping | finance flag | readable | FINANCIAL_CONFIDENTIAL | none independently | medium |
| `PharmacyRefund` / `PharmacySaleRefund` | Pharmacy | legacy refund and return state | lot condition, restock and regulatory decision | common refund payment/credit note + Pharmacy return extension | mapping to `EnterprisePayment` type `REFUND`; optional credit note | deterministic only after original payment/invoice mapping | refund flag | readable | FINANCIAL_CONFIDENTIAL | refund, credit note and reverse stock event | critical |
| `PharmacyCashDiscrepancy` | Pharmacy | sector discrepancy | POS context and incident | common cash discrepancy posting + extension | mapping to cash session | deterministic after cash mapping | cash flag | readable | FINANCIAL_CONFIDENTIAL | `PHARMACY_CASH_VARIANCE_POSTED` | high |
| `PharmacyPrescription` | Pharmacy | Pharmacy | none beyond opaque source reference | complete prescription and validation | Pharmacy | opaque `EnterpriseEntityLink` only | not applicable | unchanged | PHARMACY_RESTRICTED | none directly | low |
| `PharmacyQualityIncident` | Pharmacy | Pharmacy | tasks/workflow links only | pharmacovigilance and regulatory content | Pharmacy | entity link | not applicable | unchanged | PHARMACY_RESTRICTED | loss/write-off only when separately approved | high |
| `PharmacyDocument` and supplier/receipt documents | Pharmacy | mixed | general supplier/purchase/invoice metadata when safe | regulatory evidence and restricted documents | Core document for general files; Pharmacy document for restricted files | classification-driven | document flag | readable | most restrictive wins | none directly | high |
| `PharmacyReport*` | Pharmacy | mixed aggregation | common financial reporting dimensions | FEFO, expiry, recall and pharmacovigilance metrics | consolidated reporting projection | no destructive backfill | reporting flag | legacy comparisons retained | class-dependent | derived from posted entries without duplication | high |

## Double-source decisions

1. `PharmacyBatch` and `PharmacyStockMovement` remain authoritative for regulated lot quantities in Iteration 4.
2. `EnterpriseSalesInvoice`, `EnterpriseReceivable`, `EnterprisePayment`, `EnterpriseCashSession` and posted journal entries become authoritative for new financial balances after their respective cutovers.
3. Legacy Pharmacy totals are comparison inputs only after cutover; they never form a second balance.
4. A mapping marked `AMBIGUOUS` or `LEGACY_UNMAPPED` is never silently resolved.

## Cutover flags

- `ERP_PHARMACY_PARTY_CONVERGENCE`
- `ERP_PHARMACY_CATALOG_CONVERGENCE`
- `ERP_PHARMACY_PROCUREMENT_CONVERGENCE`
- `ERP_PHARMACY_INVENTORY_ACCOUNTING`
- `ERP_PHARMACY_FINANCE_CONVERGENCE`
- `ERP_PHARMACY_CASH_CONVERGENCE`

All flags are server-side, safe-off by default and scheduled for removal in Iteration 5.
