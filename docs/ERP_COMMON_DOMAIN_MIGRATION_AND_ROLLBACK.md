# ERP Common Domain Migration and Rollback

## Deployment sequence

1. Run `pnpm prisma:generate` against the multi-file Prisma schema.
2. Run all historical and new migrations with `pnpm prisma migrate deploy`.
3. Run `pnpm qa:regression`, type-check, lint, and production build.
4. Deploy the application.
5. Enable common modules only for selected client organizations and plans.
6. Execute dry-run backfills and review counts.
7. Apply backfills for approved organizations.
8. Execute authenticated smoke tests.

The new migrations are additive. They create common-domain tables and linkage tables; they do not drop or rename legacy tables and do not rewrite historical migrations.

## Supplier backfill

Dry-run is the default:

```bash
pnpm backfill:enterprise-supplier-parties
```

Restrict the dry-run:

```bash
pnpm backfill:enterprise-supplier-parties -- --organization=<organizationId>
```

Apply only after review:

```bash
pnpm backfill:enterprise-supplier-parties -- --apply --organization=<organizationId>
```

The script uses `supplier:<supplierId>` migration keys and organization-aware unique constraints. Re-running it is safe.

## Rollback strategy

Because the migrations are additive, rollback is operational rather than destructive:

1. disable the affected canonical module in `EnterpriseModule`;
2. stop calling the new write routes;
3. keep historical and new rows available for investigation;
4. revert the application commit or deploy the previous known-good SHA;
5. do not drop tables in an emergency rollback;
6. repair or replay idempotent operations after validation.

If purchase-receipt posting must be paused, disable `INVENTORY_LOGISTICS`. Existing `EnterprisePurchaseReceiptOperationalLink` and stock movements remain auditable.

If payroll must be paused, disable `PAYROLL_OPERATIONS`. Prepared, rejected, or cancelled runs remain operational records; no payment reversal is necessary because iteration 2 creates no payment.

## Data recovery

- `EnterpriseOperationalEvent` records state changes.
- `ApiLog` records request outcomes.
- `AuditLog` records sensitive actions.
- stock movements are immutable and balances can be rebuilt from movements if required;
- linkage tables identify migrated suppliers and posted receipts;
- optimistic revisions prevent silent overwrites.

## Verification checklist

- migrations apply from an empty PostgreSQL database;
- modules remain disabled when their dependencies or entitlements are missing;
- cross-tenant identifiers are rejected;
- repeated idempotency keys do not duplicate records;
- payroll approval generates payslips but no payment;
- goods receipts increase stock exactly once;
- service receipts do not change stock;
- cancelled payroll runs allow a new run for the same period;
- legacy Health, Pharmacy, Finance, and internal DTSC data remain readable.
