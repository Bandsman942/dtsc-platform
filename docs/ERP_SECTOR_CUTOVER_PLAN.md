# ERP Sector Cutover Plan

## Objective

Move new transversal and financial writes from Pharmacy and Health legacy financial objects to the common ERP in controlled, independently reversible domains. Iteration 4 retains all legacy tables and historical reads. Destructive cleanup belongs to Iteration 5.

## Preconditions

- Canonical module registry is active.
- Common master data, catalog, procurement, inventory, HR/payroll, projects/assets are deployed.
- Common Finance, receivables, payables, payments, treasury, cash and accounting are deployed.
- Organization Finance configuration is ready and required periods are open.
- Convergence monitoring and feature flags are deployed before any write cutover.

## Feature flags

| Flag | Default | Enables |
|---|---|---|
| `ERP_PHARMACY_PARTY_CONVERGENCE` | off | Pharmacy supplier -> common party/supplier |
| `ERP_PHARMACY_CATALOG_CONVERGENCE` | off | Pharmacy product -> common catalog |
| `ERP_PHARMACY_PROCUREMENT_CONVERGENCE` | off | Pharmacy purchase and receipt links |
| `ERP_PHARMACY_INVENTORY_ACCOUNTING` | off | idempotent accounting projection of Pharmacy stock movements |
| `ERP_PHARMACY_FINANCE_CONVERGENCE` | off | common invoice, receivable, payment and refund authority |
| `ERP_PHARMACY_CASH_CONVERGENCE` | off | common cash-session authority for new sessions |
| `ERP_HEALTH_PATIENT_FINANCE_CONVERGENCE` | off | minimal patient financial party profile |
| `ERP_HEALTH_SERVICE_CATALOG_CONVERGENCE` | off | Health billing service -> common catalog |
| `ERP_HEALTH_BILLING_CONVERGENCE` | off | common invoice and payer components |
| `ERP_HEALTH_PAYMENT_CONVERGENCE` | off | common patient/third-party payments and allocations |
| `ERP_HEALTH_INSURANCE_CONVERGENCE` | off | insurer parties and insurance receivable components |
| `ERP_HEALTH_INTERNAL_PHARMACY_ACCOUNTING` | off | accounting projection for Health internal pharmacy |

Flags are server-side, non-secret, safe-off by default and removed during Iteration 5 after stable cutover.

## Deployment order

1. Deploy additive schema and compatible code.
2. Enable convergence status/observability only.
3. Run all backfills in `--dry-run` mode by organization.
4. Resolve deterministic schema/configuration blockers.
5. Backfill Pharmacy suppliers and Health/insurer financial parties.
6. Verify counts, duplicates and classifications.
7. Backfill Pharmacy products and Health service catalog.
8. Verify code/unit/currency mappings.
9. Backfill procurement and financial links that are fully deterministic.
10. Enable Pharmacy supplier/catalog creation convergence for a pilot organization.
11. Enable Pharmacy procurement, then inventory accounting, then finance, then cash separately.
12. Enable Health patient/service mappings for a pilot organization.
13. Enable Health billing, then payments, then insurance separately.
14. Disable legacy new financial writes for each completed domain while preserving reads.
15. Run production smoke tests and reconciliation reports.

## Domain cutover conditions

### Pharmacy supplier

- all active new suppliers create/reference a common party and supplier;
- no deterministic duplicate remains;
- ambiguous historical suppliers are marked and queued;
- common identity fields are no longer independently editable in Pharmacy.

### Pharmacy product

- every new Pharmacy product references one common catalog item;
- unit, currency, tax and inventory flags are valid;
- regulatory data remains only in Pharmacy;
- catalog archival cannot delete regulated records.

### Pharmacy procurement

- new Pharmacy purchase orders and receipts receive unique common links;
- supplier and product mappings are complete;
- no common receipt mutates regulated lot quantities directly;
- approvals remain valid and no double commitment is created.

### Pharmacy inventory accounting

- every eligible source movement has at most one accounting event/version;
- lot quantity remains sector authority;
- mapped product, cost and open accounting period are required;
- comparison reports show no duplicate valuation.

### Pharmacy finance and cash

- new invoices and payments exist only once in the Core financially;
- sale balance derives from common allocations;
- new cash sessions use the common cash service;
- close validation remains independent;
- legacy Pharmacy finance objects become read-only projections/extensions.

### Health patient and service catalog

- patient projection contains no clinical fields;
- every new billable standard service references a common catalog item;
- insurer identities reference common parties with role `INSURER`;
- restricted clinical nomenclature remains in Health.

### Health billing and payment

- one common invoice exists per Health invoice;
- patient/insurer/other payer components sum to invoice total;
- common allocations determine paid/open status;
- no Health invoice is `PAID` without confirmed common allocation;
- no dispensation/lab/consultation is billed twice.

### Health insurance

- coverage requests link to the correct insurer party and common invoice;
- requested, approved, settled, rejected and patient-responsibility amounts remain explicit;
- insurer payments may allocate across several invoice components;
- differences require reassignment, rejection, dispute or approved write-off.

## Backfill policy

Every script supports applicable options:

```text
--dry-run
--organization-id
--limit
--cursor
--resume
--from-date
--to-date
```

Backfills must:

- be idempotent;
- use deterministic keys and tenant checks;
- report analyzed, mapped, skipped, ambiguous and failed IDs;
- avoid logging clinical data;
- never post ambiguous historical journal entries;
- never invent cash/bank accounts, currencies, payers or suppliers;
- never alter posted financial documents or delete legacy objects.

## Dual-write policy

A temporary compatibility write is allowed only when:

- a persisted `EnterpriseSectorSyncState` records the operation;
- the common target is authoritative for the new financial balance;
- retries use the same idempotency key;
- the legacy object is marked as projection/non-authoritative;
- a specific flag and withdrawal condition exist.

Permanent dual-write is forbidden.

## Monitoring gates

Before each flag activation, the restricted convergence dashboard must show:

- zero failed deterministic mappings for the pilot domain;
- reviewed ambiguous/unmapped counts;
- zero duplicate common invoices/payments;
- zero missing required journal entries for posted events;
- no clinical-data classification violation;
- tenant isolation checks green.

## Rollback

Rollback is non-destructive and domain-specific:

1. disable the affected convergence flag;
2. stop new synchronization/retries;
3. preserve mappings, invoices, payments, allocations and posted entries;
4. restore legacy new-write routing only for not-yet-common financial events;
5. keep both historical read paths available;
6. reconcile and correct through common reversal/credit-note services, never deletion;
7. re-enable after root-cause correction and idempotent replay.

Rollback must not detach allocated payments, delete posted entries, reuse invoice numbers, lose stock movements or expose restricted data.

## Iteration 5 exit list

Deferred explicitly:

- removal of old sector finance workspaces and APIs;
- removal of legacy fields/tables proven unused;
- retirement of temporary dual-write/projection code and feature flags;
- final archival of unmapped legacy records;
- removal of aliases and compatibility routes;
- final journal/quantity authority decision for Pharmacy stock;
- performance hardening, cleanup and long-term stabilization.
