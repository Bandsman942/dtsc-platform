-- Align the two PostgreSQL-truncated foreign-key names with Prisma's
-- canonical names. This migration changes metadata only; no rows or
-- referential rules are modified.

ALTER TABLE "EnterpriseOpeningBalanceImport"
RENAME CONSTRAINT "EnterpriseOpeningBalanceImport_organizationId_fiscalPeriodId_fk"
TO "EnterpriseOpeningBalanceImport_organizationId_fiscalPeriod_fkey";

ALTER TABLE "EnterpriseOpeningBalanceLine"
RENAME CONSTRAINT "EnterpriseOpeningBalanceLine_organizationId_ledgerAccountId_fke"
TO "EnterpriseOpeningBalanceLine_organizationId_ledgerAccountI_fkey";
