# ERP Common Domain API

## Scope

Iteration 2 exposes dedicated, tenant-aware routes for shared ERP domains. Every route is scoped by `organizationId`, requires an active client-organization membership, resolves the canonical module, checks entitlement and position permissions, and applies Zod validation. Mutations additionally require same-origin validation, rate limiting, an operational event, `ApiLog`, and `AuditLog` for sensitive changes.

## Route families

| Domain | Main routes | Canonical module |
| --- | --- | --- |
| Parties | `/api/enterprise/{organizationId}/business-parties` | `CRM_CUSTOMERS` |
| Catalog | `/api/enterprise/{organizationId}/catalog` | `CATALOG` |
| Sites | `/api/enterprise/{organizationId}/sites` | `SITES_WAREHOUSES` |
| Warehouses | `/api/enterprise/{organizationId}/warehouses` | `SITES_WAREHOUSES` |
| Leads | `/api/enterprise/{organizationId}/leads` | `CRM_PIPELINE` |
| Opportunities | `/api/enterprise/{organizationId}/opportunities` | `CRM_PIPELINE` |
| Quotes | `/api/enterprise/{organizationId}/quotes` | `SALES_QUOTES_ORDERS` |
| Sales orders | `/api/enterprise/{organizationId}/sales-orders` | `SALES_QUOTES_ORDERS` |
| Contracts | `/api/enterprise/{organizationId}/contracts` | `CONTRACTS` |
| Inventory | `/api/enterprise/{organizationId}/inventory` | `INVENTORY_LOGISTICS` |
| Transfers | `/api/enterprise/{organizationId}/stock-transfers` | `INVENTORY_LOGISTICS` |
| Counts | `/api/enterprise/{organizationId}/inventory-counts` | `INVENTORY_LOGISTICS` |
| Employees | `/api/enterprise/{organizationId}/employees` | `HUMAN_RESOURCES` |
| Employment contracts | `/api/enterprise/{organizationId}/employment-contracts` | `HUMAN_RESOURCES` |
| Leave | `/api/enterprise/{organizationId}/leave-requests` | `TIME_ATTENDANCE` |
| Timesheets | `/api/enterprise/{organizationId}/timesheets` | `TIME_ATTENDANCE` |
| Payroll periods | `/api/enterprise/{organizationId}/payroll-periods` | `PAYROLL_OPERATIONS` |
| Payroll runs | `/api/enterprise/{organizationId}/payroll-runs` | `PAYROLL_OPERATIONS` |
| Projects | `/api/enterprise/{organizationId}/projects` | `PROJECTS_SERVICES` |
| Assets | `/api/enterprise/{organizationId}/assets` | `ASSETS_MAINTENANCE` |

List routes use `page`, `pageSize`, and domain-specific filters. Responses return `items`, `pagination`, real `metrics`, and `canManage` when applicable.

## Business transitions

Transitions use explicit action routes instead of generic CRUD:

- lead status and conversion;
- quote status and conversion to sales order;
- partial fulfillment of sales orders;
- stock transfer and inventory-count decisions;
- employment-contract decisions;
- leave and timesheet decisions;
- payroll submission, decision, and cancellation;
- deliverable submission and review;
- asset return, maintenance transition, and incident resolution.

Every transition validates the current status and `revision`. A stale revision returns a conflict instead of overwriting concurrent work.

## Idempotency

Idempotency keys are required for stock movements, fulfillments, purchase-receipt posting, and other operations that can be retried after a network interruption. Existing successful results are returned without duplicating side effects.

## Boundary with Finance

Iteration 2 does not expose accounting, payment, bank, ledger, or invoice-posting APIs. Approved payroll produces operational payslips only. Sales orders and purchase receipts remain operational sources for a future Finance iteration.
