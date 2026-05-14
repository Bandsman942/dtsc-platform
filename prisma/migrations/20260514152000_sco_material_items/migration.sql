CREATE TABLE IF NOT EXISTS "MaterialItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "category" TEXT NOT NULL,
  "itemType" TEXT NOT NULL DEFAULT 'EQUIPMENT',
  "unit" TEXT NOT NULL DEFAULT 'unité',
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MaterialItem_sku_key" ON "MaterialItem"("sku");

ALTER TABLE "ScoInventoryItem" ADD COLUMN IF NOT EXISTS "materialItemId" TEXT;
ALTER TABLE "ScoAsset" ADD COLUMN IF NOT EXISTS "materialItemId" TEXT;

INSERT INTO "MaterialItem" ("id", "name", "sku", "category", "itemType", "unit", "description", "status", "createdById", "createdAt", "updatedAt")
SELECT
  'mat-inv-' || "id",
  "name",
  NULLIF("sku", ''),
  "category",
  'STOCK',
  "unit",
  "notes",
  CASE WHEN "status" = 'ARCHIVED' THEN 'ARCHIVED' ELSE 'ACTIVE' END,
  "createdById",
  "createdAt",
  "updatedAt"
FROM "ScoInventoryItem"
WHERE "materialItemId" IS NULL
ON CONFLICT ("sku") DO NOTHING;

UPDATE "ScoInventoryItem"
SET "materialItemId" = "MaterialItem"."id"
FROM "MaterialItem"
WHERE "ScoInventoryItem"."materialItemId" IS NULL
  AND (
    ("ScoInventoryItem"."sku" IS NOT NULL AND "ScoInventoryItem"."sku" = "MaterialItem"."sku")
    OR ("ScoInventoryItem"."sku" IS NULL AND "MaterialItem"."id" = 'mat-inv-' || "ScoInventoryItem"."id")
  );

INSERT INTO "MaterialItem" ("id", "name", "sku", "category", "itemType", "unit", "description", "status", "createdById", "createdAt", "updatedAt")
SELECT
  'mat-asset-' || "id",
  "name",
  NULLIF("tag", ''),
  "category",
  'ASSET',
  'unité',
  "notes",
  CASE WHEN "status" = 'RETIRED' THEN 'ARCHIVED' ELSE 'ACTIVE' END,
  "createdById",
  "createdAt",
  "updatedAt"
FROM "ScoAsset"
WHERE "materialItemId" IS NULL
ON CONFLICT ("sku") DO NOTHING;

UPDATE "ScoAsset"
SET "materialItemId" = "MaterialItem"."id"
FROM "MaterialItem"
WHERE "ScoAsset"."materialItemId" IS NULL
  AND (
    ("ScoAsset"."tag" IS NOT NULL AND "ScoAsset"."tag" = "MaterialItem"."sku")
    OR ("MaterialItem"."id" = 'mat-asset-' || "ScoAsset"."id")
  );

CREATE INDEX IF NOT EXISTS "MaterialItem_status_category_idx" ON "MaterialItem"("status", "category");
CREATE INDEX IF NOT EXISTS "MaterialItem_itemType_status_idx" ON "MaterialItem"("itemType", "status");
CREATE INDEX IF NOT EXISTS "ScoInventoryItem_materialItemId_idx" ON "ScoInventoryItem"("materialItemId");
CREATE INDEX IF NOT EXISTS "ScoAsset_materialItemId_idx" ON "ScoAsset"("materialItemId");

ALTER TABLE "ScoInventoryItem" ADD CONSTRAINT "ScoInventoryItem_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "MaterialItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoAsset" ADD CONSTRAINT "ScoAsset_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "MaterialItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
