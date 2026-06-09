CREATE TABLE "PharmacyProduct" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "genericName" TEXT,
  "internalCode" TEXT NOT NULL,
  "barcode" TEXT,
  "manufacturer" TEXT,
  "brand" TEXT,
  "shortDescription" TEXT,
  "category" TEXT NOT NULL,
  "subcategory" TEXT,
  "pharmaceuticalForm" TEXT NOT NULL,
  "dosage" TEXT,
  "saleUnit" TEXT NOT NULL,
  "stockUnit" TEXT NOT NULL,
  "packaging" TEXT,
  "administrationRoute" TEXT,
  "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
  "pharmacistValidationRequired" BOOLEAN NOT NULL DEFAULT false,
  "controlledProduct" BOOLEAN NOT NULL DEFAULT false,
  "otcAllowed" BOOLEAN NOT NULL DEFAULT true,
  "maxQuantityPerSale" INTEGER,
  "genericSubstitutionAllowed" BOOLEAN NOT NULL DEFAULT false,
  "saleWarningMessage" TEXT,
  "stockTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "minStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "maxStock" DECIMAL(14,3),
  "safetyStock" DECIMAL(14,3),
  "defaultLocation" TEXT,
  "shelf" TEXT,
  "unitsPerPackage" DECIMAL(14,3),
  "storageType" TEXT,
  "tempMin" DECIMAL(8,2),
  "tempMax" DECIMAL(8,2),
  "lightSensitive" BOOLEAN NOT NULL DEFAULT false,
  "humiditySensitive" BOOLEAN NOT NULL DEFAULT false,
  "refrigerated" BOOLEAN NOT NULL DEFAULT false,
  "storageNotes" TEXT,
  "referencePurchasePrice" DECIMAL(14,2),
  "referenceSalePrice" DECIMAL(14,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "targetMargin" DECIMAL(8,2),
  "taxRate" DECIMAL(8,2),
  "priceEditableAtSale" BOOLEAN NOT NULL DEFAULT false,
  "discountAllowed" BOOLEAN NOT NULL DEFAULT true,
  "maxDiscountRate" DECIMAL(8,2),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "deactivationReason" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyProduct_organizationId_internalCode_key" ON "PharmacyProduct"("organizationId", "internalCode");
CREATE UNIQUE INDEX "PharmacyProduct_organizationId_barcode_key" ON "PharmacyProduct"("organizationId", "barcode");
CREATE INDEX "PharmacyProduct_organizationId_category_status_idx" ON "PharmacyProduct"("organizationId", "category", "status");
CREATE INDEX "PharmacyProduct_organizationId_pharmaceuticalForm_idx" ON "PharmacyProduct"("organizationId", "pharmaceuticalForm");
CREATE INDEX "PharmacyProduct_organizationId_createdAt_idx" ON "PharmacyProduct"("organizationId", "createdAt");

ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PharmacyProduct" (
  "id","organizationId","name","genericName","internalCode","barcode","category","pharmaceuticalForm","dosage","saleUnit","stockUnit",
  "prescriptionRequired","pharmacistValidationRequired","controlledProduct","stockTrackingEnabled","minStock","maxStock",
  "defaultLocation","referenceSalePrice","currency","status","notes","createdById","updatedById","createdAt","updatedAt"
)
SELECT
  CONCAT('pp-', r."id"), r."organizationId", r."title", NULLIF(r."payloadJson"->>'genericName',''), r."payloadJson"->>'internalCode',
  NULLIF(r."payloadJson"->>'barcode',''), COALESCE(NULLIF(r."payloadJson"->>'category',''),'OTHER'),
  COALESCE(NULLIF(r."payloadJson"->>'pharmaceuticalForm',''),'OTHER'), NULLIF(r."payloadJson"->>'dosage',''),
  'UNIT', 'UNIT',
  CASE WHEN r."payloadJson"->>'prescriptionRequired' IN ('true','false') THEN (r."payloadJson"->>'prescriptionRequired')::BOOLEAN ELSE false END,
  CASE WHEN r."payloadJson"->>'pharmacistValidationRequired' IN ('true','false') THEN (r."payloadJson"->>'pharmacistValidationRequired')::BOOLEAN ELSE false END,
  CASE WHEN r."payloadJson"->>'controlledProduct' IN ('true','false') THEN (r."payloadJson"->>'controlledProduct')::BOOLEAN ELSE false END, true,
  COALESCE(NULLIF(r."payloadJson"->>'minStock','')::DECIMAL,0), NULLIF(r."payloadJson"->>'maxStock','')::DECIMAL,
  NULLIF(r."payloadJson"->>'location',''), NULLIF(r."payloadJson"->>'unitPrice','')::DECIMAL, COALESCE(NULLIF(r."payloadJson"->>'currency',''),'USD'),
  CASE WHEN r."status" IN ('ACTIVE','INACTIVE','SUSPENDED','ARCHIVED') THEN r."status" ELSE 'ACTIVE' END,
  NULLIF(r."payloadJson"->>'notes',''), r."createdById", r."updatedById", r."createdAt", r."updatedAt"
FROM "EnterpriseSectorRecord" r
WHERE r."sectorCode"='PHARMACY' AND r."moduleCode"='MEDICINES_PRODUCTS' AND r."deletedAt" IS NULL
  AND NULLIF(r."payloadJson"->>'internalCode','') IS NOT NULL
ON CONFLICT ("organizationId","internalCode") DO NOTHING;
