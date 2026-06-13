CREATE TABLE "HealthPharmacyProduct" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "legacyRecordId" TEXT, "productCode" TEXT NOT NULL, "name" TEXT NOT NULL, "genericName" TEXT,
  "category" TEXT NOT NULL, "pharmaceuticalForm" TEXT, "strength" TEXT, "unit" TEXT NOT NULL, "description" TEXT,
  "currentStock" DECIMAL(14,3) NOT NULL DEFAULT 0, "minimumStock" DECIMAL(14,3) NOT NULL DEFAULT 0, "criticalStock" DECIMAL(14,3), "maximumStock" DECIMAL(14,3),
  "trackBatches" BOOLEAN NOT NULL DEFAULT true, "trackExpiry" BOOLEAN NOT NULL DEFAULT true, "storageLocation" TEXT, "purchasePrice" DECIMAL(14,2), "sellingPrice" DECIMAL(14,2),
  "billable" BOOLEAN NOT NULL DEFAULT false, "billingCode" TEXT, "supplierReference" TEXT, "isSensitive" BOOLEAN NOT NULL DEFAULT false, "controlLevel" TEXT NOT NULL DEFAULT 'STANDARD',
  "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false, "specialAuthorizationRequired" BOOLEAN NOT NULL DEFAULT false, "safetyNotes" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "archivedById" TEXT, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthPharmacyProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthPharmacyBatch" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchNumber" TEXT NOT NULL, "initialQuantity" DECIMAL(14,3) NOT NULL, "availableQuantity" DECIMAL(14,3) NOT NULL,
  "manufacturingDate" TIMESTAMP(3), "expiryDate" TIMESTAMP(3), "supplierReference" TEXT, "purchasePrice" DECIMAL(14,2), "status" TEXT NOT NULL DEFAULT 'AVAILABLE', "notes" TEXT,
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "HealthPharmacyBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthPharmacyStockMovement" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchId" TEXT, "movementType" TEXT NOT NULL, "quantity" DECIMAL(14,3) NOT NULL,
  "stockBefore" DECIMAL(14,3) NOT NULL, "stockAfter" DECIMAL(14,3) NOT NULL, "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "source" TEXT, "destination" TEXT,
  "patientId" TEXT, "consultationId" TEXT, "departmentId" TEXT, "reason" TEXT NOT NULL, "comment" TEXT, "referenceDocument" TEXT, "isSensitive" BOOLEAN NOT NULL DEFAULT false,
  "requiresAuthorization" BOOLEAN NOT NULL DEFAULT false, "authorizedById" TEXT, "authorizedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthPharmacyStockMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthPharmacyDispensation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "movementId" TEXT NOT NULL, "patientId" TEXT NOT NULL, "consultationId" TEXT, "productId" TEXT NOT NULL, "batchId" TEXT,
  "quantity" DECIMAL(14,3) NOT NULL, "dispensedById" TEXT NOT NULL, "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "prescriberId" TEXT, "billable" BOOLEAN NOT NULL DEFAULT false,
  "billingStatus" TEXT NOT NULL DEFAULT 'NOT_BILLABLE', "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthPharmacyDispensation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HealthPharmacyProduct_organizationId_productCode_key" ON "HealthPharmacyProduct"("organizationId","productCode");
CREATE UNIQUE INDEX "HealthPharmacyProduct_organizationId_legacyRecordId_key" ON "HealthPharmacyProduct"("organizationId","legacyRecordId");
CREATE UNIQUE INDEX "HealthPharmacyProduct_organizationId_id_key" ON "HealthPharmacyProduct"("organizationId","id");
CREATE INDEX "HealthPharmacyProduct_organizationId_category_status_idx" ON "HealthPharmacyProduct"("organizationId","category","status");
CREATE INDEX "HealthPharmacyProduct_organizationId_isSensitive_status_idx" ON "HealthPharmacyProduct"("organizationId","isSensitive","status");
CREATE UNIQUE INDEX "HealthPharmacyBatch_organizationId_productId_batchNumber_key" ON "HealthPharmacyBatch"("organizationId","productId","batchNumber");
CREATE UNIQUE INDEX "HealthPharmacyBatch_organizationId_id_key" ON "HealthPharmacyBatch"("organizationId","id");
CREATE INDEX "HealthPharmacyBatch_organizationId_productId_status_idx" ON "HealthPharmacyBatch"("organizationId","productId","status");
CREATE INDEX "HealthPharmacyBatch_organizationId_expiryDate_idx" ON "HealthPharmacyBatch"("organizationId","expiryDate");
CREATE UNIQUE INDEX "HealthPharmacyStockMovement_organizationId_id_key" ON "HealthPharmacyStockMovement"("organizationId","id");
CREATE INDEX "HealthPharmacyStockMovement_organizationId_productId_movementDate_idx" ON "HealthPharmacyStockMovement"("organizationId","productId","movementDate");
CREATE INDEX "HealthPharmacyStockMovement_organizationId_batchId_movementDate_idx" ON "HealthPharmacyStockMovement"("organizationId","batchId","movementDate");
CREATE INDEX "HealthPharmacyStockMovement_organizationId_patientId_movementDate_idx" ON "HealthPharmacyStockMovement"("organizationId","patientId","movementDate");
CREATE INDEX "HealthPharmacyStockMovement_organizationId_consultationId_movementDate_idx" ON "HealthPharmacyStockMovement"("organizationId","consultationId","movementDate");
CREATE INDEX "HealthPharmacyStockMovement_organizationId_movementType_movementDate_idx" ON "HealthPharmacyStockMovement"("organizationId","movementType","movementDate");
CREATE UNIQUE INDEX "HealthPharmacyDispensation_movementId_key" ON "HealthPharmacyDispensation"("movementId");
CREATE UNIQUE INDEX "HealthPharmacyDispensation_organizationId_movementId_key" ON "HealthPharmacyDispensation"("organizationId","movementId");
CREATE INDEX "HealthPharmacyDispensation_organizationId_patientId_dispensedAt_idx" ON "HealthPharmacyDispensation"("organizationId","patientId","dispensedAt");
CREATE INDEX "HealthPharmacyDispensation_organizationId_consultationId_dispensedAt_idx" ON "HealthPharmacyDispensation"("organizationId","consultationId","dispensedAt");
CREATE INDEX "HealthPharmacyDispensation_organizationId_productId_dispensedAt_idx" ON "HealthPharmacyDispensation"("organizationId","productId","dispensedAt");
CREATE INDEX "HealthPharmacyDispensation_organizationId_billingStatus_idx" ON "HealthPharmacyDispensation"("organizationId","billingStatus");
ALTER TABLE "HealthPharmacyProduct" ADD CONSTRAINT "HealthPharmacyProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyProduct" ADD CONSTRAINT "HealthPharmacyProduct_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyProduct" ADD CONSTRAINT "HealthPharmacyProduct_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyProduct" ADD CONSTRAINT "HealthPharmacyProduct_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyBatch" ADD CONSTRAINT "HealthPharmacyBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyBatch" ADD CONSTRAINT "HealthPharmacyBatch_organizationId_productId_fkey" FOREIGN KEY ("organizationId","productId") REFERENCES "HealthPharmacyProduct"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyBatch" ADD CONSTRAINT "HealthPharmacyBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyBatch" ADD CONSTRAINT "HealthPharmacyBatch_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_organizationId_productId_fkey" FOREIGN KEY ("organizationId","productId") REFERENCES "HealthPharmacyProduct"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_organizationId_batchId_fkey" FOREIGN KEY ("organizationId","batchId") REFERENCES "HealthPharmacyBatch"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_organizationId_consultationId_fkey" FOREIGN KEY ("organizationId","consultationId") REFERENCES "HealthConsultation"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "EnterpriseDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyStockMovement" ADD CONSTRAINT "HealthPharmacyStockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_organizationId_movementId_fkey" FOREIGN KEY ("organizationId","movementId") REFERENCES "HealthPharmacyStockMovement"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_organizationId_consultationId_fkey" FOREIGN KEY ("organizationId","consultationId") REFERENCES "HealthConsultation"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_organizationId_productId_fkey" FOREIGN KEY ("organizationId","productId") REFERENCES "HealthPharmacyProduct"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_organizationId_batchId_fkey" FOREIGN KEY ("organizationId","batchId") REFERENCES "HealthPharmacyBatch"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPharmacyDispensation" ADD CONSTRAINT "HealthPharmacyDispensation_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.pharmacy.view","health.pharmacy.view_sensitive","health.pharmacy.create_product","health.pharmacy.update_product","health.pharmacy.archive_product","health.pharmacy.manage_batches","health.pharmacy.stock_entry","health.pharmacy.stock_exit","health.pharmacy.dispense","health.pharmacy.adjust_stock","health.pharmacy.manage_inventory","health.pharmacy.authorize_sensitive_exit","health.pharmacy.view_movements"]'::jsonb WHERE "positionCode" IN ('MEDICAL_DIRECTOR','PHARMACIST') AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.pharmacy.view","health.pharmacy.stock_entry","health.pharmacy.stock_exit","health.pharmacy.dispense","health.pharmacy.view_movements"]'::jsonb WHERE "positionCode"='ASSISTANT_PHARMACIST' AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
