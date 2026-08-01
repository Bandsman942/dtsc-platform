# ERP Sector Reporting

## Reporting authority

After a domain cutover, financial reports use common invoices, receivables, payables, payments, financial accounts and posted journal entries. Legacy sector financial tables are comparison sources only and are excluded when a common mapping exists.

Operational sector reports continue to use sector-owned data for regulated or clinical dimensions.

## Pharmacy reports

- sales and margin by site and currency;
- purchases and supplier liabilities;
- stock value from common valuation;
- regulated quantity, batch and FEFO from Pharmacy;
- expiry, loss, recall and adjustment events;
- refunds and physical returns shown separately;
- cash sessions and discrepancies through common cash;
- customer receivables and supplier payables.

## Health reports

- medical billing by service, site and currency;
- patient collections;
- patient receivables;
- insurer receivables;
- insurance request, approval, rejection and settlement rates;
- patient remainder after insurer decisions;
- laboratory and dispensations billed once;
- revenue by service without diagnosis or clinical content.

## Consolidated views

- global revenue by currency;
- global purchases by currency;
- global receivables and payables;
- global treasury;
- result by sector and site;
- common inventory value versus Pharmacy regulated quantities;
- sector synchronization and unmapped-item counts.

## Deduplication

Every sector-origin common document is identified by its extension and sync key. Consolidated reports classify a financial object once:

- `PHARMACY` when linked by a Pharmacy invoice/payment/inventory extension;
- `HEALTH_CARE` when linked by a Health billing/payment/payer extension;
- `CORE` when it has no sector extension.

A report never adds a legacy sector invoice to its mapped common invoice.

## Currency

Reports group by transaction currency unless they explicitly use posted functional-currency journal lines. Currencies are never summed together without an exchange-rate snapshot and a declared reporting currency.

## Confidentiality

Health reporting excludes diagnosis, symptoms, prescriptions, laboratory results, clinical notes and medical documents. Patient labels are pseudonymized where identity is unnecessary. Pharmacy regulatory details require Pharmacy permissions.

## Performance

Reporting queries rely on organization, sector, target, status and date indexes. Heavy views should be materialized only after measured need and must preserve tenant isolation and cutover deduplication.
