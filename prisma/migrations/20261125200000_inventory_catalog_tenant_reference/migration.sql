-- #1228 PostgreSQL fixture exposed missing physical enforcement of the
-- composite relation already declared by Prisma. Never repair history here.
BEGIN;
SET LOCAL lock_timeout = '10s';

ALTER TABLE "EnterpriseInventoryItem"
  ADD CONSTRAINT "EnterpriseInventoryItem_organizationId_catalogItemId_fkey"
  FOREIGN KEY ("organizationId", "catalogItemId")
  REFERENCES "EnterpriseCatalogItem" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- Fail rather than silently modifying an orphan/cross-tenant historical row.
ALTER TABLE "EnterpriseInventoryItem"
  VALIDATE CONSTRAINT "EnterpriseInventoryItem_organizationId_catalogItemId_fkey";
COMMIT;
