-- #1228: append-only product-specific unit conversion history; no backfill.
BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE TABLE "EnterpriseCatalogUnitConversion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "sourceUnitId" TEXT NOT NULL,
  "targetUnitId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "factor" DECIMAL(30,12) NOT NULL,
  "sourceScale" INTEGER NOT NULL,
  "targetScale" INTEGER NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "targetCode" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_conversion_factor_ck" CHECK ("factor" > 0 AND "factor" <> 'NaN'::numeric),
  CONSTRAINT "catalog_conversion_version_ck" CHECK ("version" > 0),
  CONSTRAINT "catalog_conversion_units_ck" CHECK ("sourceUnitId" <> "targetUnitId" AND "sourceScale" BETWEEN 0 AND 6 AND "targetScale" BETWEEN 0 AND 6),
  CONSTRAINT "catalog_conversion_item_fk" FOREIGN KEY ("organizationId","catalogItemId") REFERENCES "EnterpriseCatalogItem"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_conversion_source_fk" FOREIGN KEY ("organizationId","sourceUnitId") REFERENCES "EnterpriseUnitOfMeasure"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_conversion_target_fk" FOREIGN KEY ("organizationId","targetUnitId") REFERENCES "EnterpriseUnitOfMeasure"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_conversion_tenant_id_uq" ON "EnterpriseCatalogUnitConversion"("organizationId","id");
CREATE UNIQUE INDEX "catalog_conversion_version_uq" ON "EnterpriseCatalogUnitConversion"("organizationId","catalogItemId","sourceUnitId","version");
CREATE INDEX "catalog_conversion_history_idx" ON "EnterpriseCatalogUnitConversion"("organizationId","catalogItemId","createdAt");
CREATE INDEX "catalog_conversion_source_idx" ON "EnterpriseCatalogUnitConversion"("organizationId","sourceUnitId");
CREATE INDEX "catalog_conversion_target_idx" ON "EnterpriseCatalogUnitConversion"("organizationId","targetUnitId");
COMMIT;
