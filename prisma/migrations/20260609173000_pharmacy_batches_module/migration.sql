CREATE TABLE "PharmacyBatch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "supplierId" TEXT,
  "purchaseOrderId" TEXT,
  "receiptId" TEXT,
  "batchNumber" TEXT NOT NULL,
  "serialNumber" TEXT,
  "barcode" TEXT,
  "internalReference" TEXT,
  "manufacturerReference" TEXT,
  "manufacturingDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "stockEntryDate" TIMESTAMP(3),
  "receivedById" TEXT,
  "receivedQuantity" DECIMAL(14,3) NOT NULL,
  "availableQuantity" DECIMAL(14,3) NOT NULL,
  "reservedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "damagedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "minQuantityAlert" DECIMAL(14,3),
  "expiryAlertDays" INTEGER,
  "location" TEXT,
  "shelf" TEXT,
  "zone" TEXT,
  "storageConditions" TEXT,
  "tempMin" DECIMAL(8,2),
  "tempMax" DECIMAL(8,2),
  "storageNotes" TEXT,
  "purchasePrice" DECIMAL(14,2),
  "salePrice" DECIMAL(14,2),
  "totalCost" DECIMAL(14,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "quarantine" BOOLEAN NOT NULL DEFAULT false,
  "recall" BOOLEAN NOT NULL DEFAULT false,
  "quarantineReason" TEXT,
  "recallReason" TEXT,
  "recallDate" TIMESTAMP(3),
  "statusReason" TEXT,
  "decisionResponsibleId" TEXT,
  "supplierInvoiceRef" TEXT,
  "deliveryNoteRef" TEXT,
  "qualityDocumentUrl" TEXT,
  "supplierInvoiceUrl" TEXT,
  "deliveryNoteUrl" TEXT,
  "certificateUrl" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyStockMovement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "batchId" TEXT,
  "movementType" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "quantityBefore" DECIMAL(14,3),
  "quantityAfter" DECIMAL(14,3),
  "reason" TEXT NOT NULL,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyBatch_organizationId_productId_batchNumber_key" ON "PharmacyBatch"("organizationId", "productId", "batchNumber");
CREATE UNIQUE INDEX "PharmacyBatch_organizationId_barcode_key" ON "PharmacyBatch"("organizationId", "barcode");
CREATE INDEX "PharmacyBatch_organizationId_idx" ON "PharmacyBatch"("organizationId");
CREATE INDEX "PharmacyBatch_organizationId_productId_idx" ON "PharmacyBatch"("organizationId", "productId");
CREATE INDEX "PharmacyBatch_organizationId_supplierId_idx" ON "PharmacyBatch"("organizationId", "supplierId");
CREATE INDEX "PharmacyBatch_organizationId_expiryDate_idx" ON "PharmacyBatch"("organizationId", "expiryDate");
CREATE INDEX "PharmacyBatch_organizationId_status_idx" ON "PharmacyBatch"("organizationId", "status");
CREATE INDEX "PharmacyBatch_organizationId_createdAt_idx" ON "PharmacyBatch"("organizationId", "createdAt");
CREATE INDEX "PharmacyStockMovement_organizationId_productId_createdAt_idx" ON "PharmacyStockMovement"("organizationId", "productId", "createdAt");
CREATE INDEX "PharmacyStockMovement_organizationId_batchId_createdAt_idx" ON "PharmacyStockMovement"("organizationId", "batchId", "createdAt");
CREATE INDEX "PharmacyStockMovement_organizationId_movementType_createdAt_idx" ON "PharmacyStockMovement"("organizationId", "movementType", "createdAt");

ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_decisionResponsibleId_fkey" FOREIGN KEY ("decisionResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PharmacyBatch" (
  "id","organizationId","productId","batchNumber","expiryDate","receivedQuantity","availableQuantity","unit","location","status",
  "notes","createdById","updatedById","createdAt","updatedAt"
)
SELECT
  CONCAT('pb-', r."id"), r."organizationId", r."payloadJson"->>'productId', r."payloadJson"->>'batchNumber',
  (r."payloadJson"->>'expiryDate')::TIMESTAMP, GREATEST(COALESCE(NULLIF(r."payloadJson"->>'quantity','')::DECIMAL, NULLIF(r."payloadJson"->>'availableQuantity','')::DECIMAL, 0), 0),
  GREATEST(COALESCE(NULLIF(r."payloadJson"->>'availableQuantity','')::DECIMAL, 0), 0), COALESCE(NULLIF(r."payloadJson"->>'unit',''),'UNIT'),
  NULLIF(r."payloadJson"->>'location',''), CASE WHEN r."status" IN ('ACTIVE','DEPLETED','NEAR_EXPIRY','EXPIRED','QUARANTINED','RECALLED','BLOCKED','CANCELLED') THEN r."status" ELSE 'ACTIVE' END,
  NULLIF(r."payloadJson"->>'notes',''), r."createdById", r."updatedById", r."createdAt", r."updatedAt"
FROM "EnterpriseSectorRecord" r
JOIN "PharmacyProduct" p ON p."id" = r."payloadJson"->>'productId' AND p."organizationId" = r."organizationId"
WHERE r."sectorCode"='PHARMACY' AND r."moduleCode"='BATCH_EXPIRY' AND r."deletedAt" IS NULL
  AND NULLIF(r."payloadJson"->>'batchNumber','') IS NOT NULL AND NULLIF(r."payloadJson"->>'expiryDate','') IS NOT NULL
ON CONFLICT ("organizationId","productId","batchNumber") DO NOTHING;

INSERT INTO "PharmacyStockMovement" ("id","organizationId","productId","batchId","movementType","quantity","quantityBefore","quantityAfter","reason","createdById","createdAt")
SELECT CONCAT('psm-', b."id"), b."organizationId", b."productId", b."id", 'INITIAL_BATCH_CREATION', b."receivedQuantity", 0, b."availableQuantity", 'Migration du lot existant', b."createdById", b."createdAt"
FROM "PharmacyBatch" b
ON CONFLICT DO NOTHING;
