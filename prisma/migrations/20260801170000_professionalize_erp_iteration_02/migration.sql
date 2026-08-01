-- Iteration 2/6: additive professional ERP master data, CRM and identity targets.
ALTER TABLE "EnterpriseStorageLocation"
  ADD COLUMN IF NOT EXISTS "barcode" TEXT,
  ADD COLUMN IF NOT EXISTS "capacityValue" DECIMAL(18,3),
  ADD COLUMN IF NOT EXISTS "capacityUnit" TEXT;

ALTER TABLE "EnterpriseLead"
  ADD COLUMN IF NOT EXISTS "nextAction" TEXT,
  ADD COLUMN IF NOT EXISTS "nextActionAt" TIMESTAMP(3);

ALTER TABLE "EnterpriseOpportunity"
  ADD COLUMN IF NOT EXISTS "nextAction" TEXT,
  ADD COLUMN IF NOT EXISTS "nextActionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "wonAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lostAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lostReason" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

ALTER TABLE "EnterprisePersonBusinessReference"
  ADD COLUMN IF NOT EXISTS "supplierId" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierContactId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "EnterprisePersonBusinessReference_org_supplier_relation_key"
  ON "EnterprisePersonBusinessReference"("organizationId", "supplierId", "relationType");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterprisePersonBusinessReference_org_supplier_contact_relation_key"
  ON "EnterprisePersonBusinessReference"("organizationId", "supplierContactId", "relationType");
CREATE INDEX IF NOT EXISTS "EnterprisePersonBusinessReference_org_supplier_idx"
  ON "EnterprisePersonBusinessReference"("organizationId", "supplierId");
CREATE INDEX IF NOT EXISTS "EnterprisePersonBusinessReference_org_supplier_contact_idx"
  ON "EnterprisePersonBusinessReference"("organizationId", "supplierContactId");

CREATE TABLE IF NOT EXISTS "EnterpriseCatalogPrice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "priceType" TEXT NOT NULL DEFAULT 'SALE',
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "taxRate" DECIMAL(8,4),
  "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseCatalogPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseCatalogPrice_catalogItem_fkey"
    FOREIGN KEY ("organizationId", "catalogItemId")
    REFERENCES "EnterpriseCatalogItem"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseCatalogPrice_organizationId_id_key"
  ON "EnterpriseCatalogPrice"("organizationId", "id");
CREATE INDEX IF NOT EXISTS "EnterpriseCatalogPrice_organizationId_catalogItemId_priceType_status_idx"
  ON "EnterpriseCatalogPrice"("organizationId", "catalogItemId", "priceType", "status");
CREATE INDEX IF NOT EXISTS "EnterpriseCatalogPrice_organizationId_effectiveFrom_effectiveUntil_idx"
  ON "EnterpriseCatalogPrice"("organizationId", "effectiveFrom", "effectiveUntil");
CREATE INDEX IF NOT EXISTS "EnterpriseCatalogPrice_archivedAt_idx"
  ON "EnterpriseCatalogPrice"("archivedAt");

ALTER TABLE "EnterpriseLead" ADD COLUMN IF NOT EXISTS "businessPartyId" TEXT;
CREATE INDEX IF NOT EXISTS "EnterpriseLead_organizationId_businessPartyId_status_idx" ON "EnterpriseLead"("organizationId", "businessPartyId", "status");
ALTER TABLE "EnterpriseLead" ADD CONSTRAINT "EnterpriseLead_organizationId_businessPartyId_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
