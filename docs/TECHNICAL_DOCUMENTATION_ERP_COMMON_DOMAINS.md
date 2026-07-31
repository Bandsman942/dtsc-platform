# Technical Documentation — ERP Common Domains

## Purpose

The common ERP layer provides reusable operational domains for every client organization while preserving the specialized Health and Pharmacy implementations and the internal DTSC operating model.

## Architecture

The layer is organized into:

- canonical definitions in `lib/enterprise/module-registry-common-domains.json`;
- central access in `lib/enterprise/module-access.ts`;
- multi-file Prisma schemas under `prisma/enterprise-*.prisma`;
- business services under `lib/enterprise/{domain}`;
- dedicated routes under `app/api/enterprise/[organizationId]`;
- a shared operational workspace in `components/enterprise/enterprise-common-domain-workspace.tsx`;
- targeted QA scripts in `scripts/qa-enterprise-*-checks.mjs`.

The application route `app/enterprise-modules/[moduleCode]/page.tsx` resolves aliases and permissions first. It then routes Core, common, Health, Pharmacy, administration, and AI modules through explicit allow-lists.

## Sources of truth

| Concern | Source of truth |
| --- | --- |
| Module identity and dependencies | Canonical module registry |
| Tenant access | `OrganizationMember` + central module resolver |
| Parties | `EnterpriseBusinessParty` and roles |
| Products/services | `EnterpriseCatalogItem` and units |
| Locations | `EnterpriseSite`, `EnterpriseWarehouse`, `EnterpriseStorageLocation` |
| Sales pipeline | Leads, opportunities, quotes, orders, fulfillments |
| Inventory | Stock movement journal plus balance projection |
| Client workforce | `EnterpriseEmployee` and versioned employment contracts |
| Approved time | `EnterpriseTimesheet` and entries |
| Operational payroll | Payroll period, run, item, and payslip |
| Projects | Project, member, milestone, deliverable, risk, and issue |
| Assets | Asset, assignment, maintenance, and incident |
| Decisions | Existing `EnterpriseApproval` |
| Traceability | Operational event, API log, and audit log |

## Transaction boundaries

Transactions protect all multi-record state changes. Serializable isolation is used where duplicate execution or concurrent balances would be harmful: stock movements, transfers, inventory counts, purchase-receipt posting, and payroll preparation/approval.

Mutable records use optimistic revisions. State transitions check both current status and revision. Immutable journals and migration links use unique idempotency constraints.

## Procurement adapter

Existing procurement remains the owner of suppliers, purchases, items, and receipts. The common layer adds explicit links:

- supplier → business party;
- purchase → destination/project/asset context;
- purchase item → catalog and unit;
- receipt → operational posting;
- receipt item → stock movement or service acceptance.

No legacy procurement record is rewritten. The adapter is invoked explicitly and can be disabled independently.

## Payroll boundary

The common payroll lifecycle is:

`OPEN PERIOD → PREPARED → PENDING_APPROVAL → APPROVED | REJECTED | CANCELLED`

Approval creates operational payslips and closes the period. It does not create a payment, transaction, expense, bank operation, or accounting entry. Cancelled or rejected runs remain auditable and do not prevent a new run for the same period.

## Workspace behavior

The common workspace displays only data returned by secured APIs. It provides:

- horizontal domain tabs;
- horizontally scrollable KPIs on mobile;
- search;
- pagination;
- loading, empty, and error states;
- responsive cards;
- no database-controlled dynamic imports;
- no fabricated metrics.

## Operational commands

```bash
pnpm prisma:generate
pnpm prisma:deploy
pnpm qa:enterprise-master-data
pnpm qa:enterprise-crm-sales
pnpm qa:enterprise-inventory
pnpm qa:enterprise-hr-payroll
pnpm qa:enterprise-projects-assets
pnpm qa:regression
pnpm type-check
pnpm lint
pnpm build
```

Supplier backfill remains dry-run unless `--apply` is explicitly supplied.
