-- #576 Finance payables: restore the physical constraints already declared by Prisma
-- for EnterpriseSupplierPartyLink. The historical table-creation migration omitted them.
--
-- Do not silently deduplicate historical tenant data. If a database already contains
-- conflicting links, stop the migration with a precise error so the tenant can be
-- reconciled deliberately before retrying the additive migration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "EnterpriseSupplierPartyLink"
    GROUP BY "organizationId", "supplierId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterpriseSupplierPartyLink contains duplicate (organizationId, supplierId) rows; reconcile them before applying #576';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EnterpriseSupplierPartyLink"
    GROUP BY "organizationId", "businessPartyId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterpriseSupplierPartyLink contains duplicate (organizationId, businessPartyId) rows; reconcile them before applying #576';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EnterpriseSupplierPartyLink"
    WHERE "migrationKey" IS NOT NULL
    GROUP BY "organizationId", "migrationKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'EnterpriseSupplierPartyLink contains duplicate non-null (organizationId, migrationKey) rows; reconcile them before applying #576';
  END IF;
END $$;

CREATE UNIQUE INDEX "EnterpriseSupplierPartyLink_organizationId_id_key"
  ON "EnterpriseSupplierPartyLink"("organizationId", "id");

CREATE UNIQUE INDEX "EnterpriseSupplierPartyLink_organizationId_supplierId_key"
  ON "EnterpriseSupplierPartyLink"("organizationId", "supplierId");

CREATE UNIQUE INDEX "EnterpriseSupplierPartyLink_organizationId_businessPartyId_key"
  ON "EnterpriseSupplierPartyLink"("organizationId", "businessPartyId");

CREATE UNIQUE INDEX "EnterpriseSupplierPartyLink_organizationId_migrationKey_key"
  ON "EnterpriseSupplierPartyLink"("organizationId", "migrationKey");

CREATE INDEX "EnterpriseSupplierPartyLink_organizationId_complianceStatus_idx"
  ON "EnterpriseSupplierPartyLink"("organizationId", "complianceStatus");

CREATE INDEX "EnterpriseSupplierPartyLink_archivedAt_idx"
  ON "EnterpriseSupplierPartyLink"("archivedAt");
