# ERP Consolidation — Iteration 2 Changelog

## Canonical shared domains

Added thirteen canonical modules for client organizations:

- parties and customers;
- product and service catalog;
- sites and warehouses;
- CRM pipeline;
- quotes and sales orders;
- contracts;
- inventory and logistics;
- client human resources;
- time, attendance, and leave;
- operational payroll;
- projects and services;
- project time and deliverables;
- assets and maintenance.

## Data model

Added organization-aware Prisma domains for master data, CRM and sales, inventory, client HR and payroll, projects and assets. Added non-destructive procurement linkage tables. No historical migration was changed and no legacy table was deleted.

## Business services

Implemented:

- lead lifecycle and idempotent conversion to party and opportunity;
- server-calculated quotes and idempotent conversion to sales orders;
- partial fulfillment with over-delivery protection;
- commercial contracts and independent approval;
- immutable stock movement journal and controlled balance projection;
- transfers and inventory counts with independent approval;
- supplier-to-party linking and goods/service receipt distinction;
- client employees and versioned employment contracts;
- leave overlap checks and timesheet approval;
- operational payroll preparation, independent approval, rejection, cancellation, and payslips;
- project members, milestones, deliverables, risks, and issues;
- asset categories, assets, assignments, returns, maintenance, and incidents.

## API and UI

Added dedicated, paginated APIs under `/api/enterprise/{organizationId}`. Added an operational common-domain workspace with real KPIs, search, pagination, responsive horizontal sub-domain navigation, loading states, and human error states.

## Security and reliability

- canonical module access on every route;
- tenant-aware foreign-key validation;
- same-origin checks and rate limiting on mutations;
- Zod validation;
- serializable transactions for stock, payroll, and receipt posting;
- optimistic revisions;
- idempotency for retriable side effects;
- operational events, API logs, and audit logs;
- self-approval prevention.

## Explicit exclusions

Iteration 2 does not create accounting entries, payments, bank movements, or a common Finance ledger. It does not migrate or merge Health and Pharmacy data. It does not remove legacy modules or introduce permanent dual writes.

## QA

Added targeted gates for master data, CRM/sales, inventory, HR/payroll, and projects/assets. They run before the existing regression suite. Migrations continue to be verified from an empty PostgreSQL database in CI.
