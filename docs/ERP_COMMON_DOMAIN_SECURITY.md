# ERP Common Domain Security

## Authority chain

Access to a shared ERP domain is granted only when all checks succeed:

1. authenticated session;
2. active `OrganizationMember` for the requested `organizationId`;
3. active, non-deleted client organization;
4. known canonical module and implemented status;
5. sector compatibility;
6. enabled tenant module and enabled dependencies;
7. active plan entitlement;
8. role or position permission for the requested action.

The central resolver is `lib/enterprise/module-access.ts`. Individual routes must not reproduce a weaker access shortcut.

## Tenant isolation

All reads and writes include `organizationId`. Foreign identifiers supplied by a client are reloaded with the same `organizationId` before use. Composite organization-aware relations and indexes are used throughout the new Prisma domain files. A valid identifier from another tenant is treated as not found.

## Mutations

Mutating routes require:

- same-origin request validation;
- authenticated session;
- canonical module access;
- Zod parsing;
- abuse-sensitive rate limiting;
- transaction for multi-record operations;
- operational event;
- `ApiLog` and, for sensitive actions, `AuditLog`.

## Separation of duties

The requester cannot approve their own:

- employment contract;
- leave request;
- timesheet;
- payroll run;
- stock transfer;
- inventory count;
- submitted deliverable when the creator is the reviewer.

Approval records use the existing `EnterpriseApproval` source of truth. The canonical decision timestamp is `decidedAt`.

## Concurrency and idempotency

Mutable aggregates carry a `revision`. State transitions use `updateMany` with the expected status and revision. A lost race returns `409`.

Stock movements, purchase-receipt posting, lead/quote conversions, and fulfillments use idempotency keys or persisted conversion identifiers. Retrying a completed request does not duplicate stock, orders, links, or deliveries.

## Inventory invariants

`EnterpriseStockMovement` is immutable operational history. `EnterpriseInventoryBalance` is a transactionally maintained projection. Direct stock entry is limited; transfers and counts use dedicated approval flows. Negative stock is rejected. A transfer posts equal outbound and inbound movements in one serializable transaction.

## Sensitive boundaries

- Client HR is isolated from internal DTSC `Hrcfo*` tables.
- Health and Pharmacy tables are unchanged and remain sector-specific.
- Payroll approval never creates a payment, bank movement, ledger entry, or accounting transaction.
- Commercial fulfillment never creates an accounting invoice.
- Service receipts never create physical stock movements.
- No endpoint accepts arbitrary model names, SQL, or a generic `entityType` CRUD operation.
