ALTER TABLE "PharmacyStockMovement" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'NEUTRAL';
ALTER TABLE "PharmacyStockMovement" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPLIED';
ALTER TABLE "PharmacyStockMovement" ADD COLUMN "comment" TEXT;

CREATE TABLE "PharmacyInventorySession" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "title" TEXT NOT NULL, "inventoryDate" TIMESTAMP(3) NOT NULL,
  "inventoryType" TEXT NOT NULL, "departmentId" TEXT, "locationId" TEXT, "responsibleUserId" TEXT NOT NULL,
  "participantsJson" JSONB, "scopeType" TEXT NOT NULL, "scopeJson" JSONB, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT, "submittedAt" TIMESTAMP(3), "validatedAt" TIMESTAMP(3), "validatedById" TEXT, "rejectionReason" TEXT,
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyInventorySession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyInventoryLine" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "inventorySessionId" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchId" TEXT,
  "locationId" TEXT, "systemQuantity" DECIMAL(14,3) NOT NULL, "countedQuantity" DECIMAL(14,3), "variance" DECIMAL(14,3),
  "varianceType" TEXT, "varianceReason" TEXT, "countedById" TEXT, "countedAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'TO_COUNT',
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyInventoryLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyStockAdjustment" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchId" TEXT, "inventorySessionId" TEXT, "inventoryLineId" TEXT,
  "adjustmentType" TEXT NOT NULL, "direction" TEXT NOT NULL, "quantity" DECIMAL(14,3) NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedById" TEXT NOT NULL, "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "rejectedReason" TEXT, "documentUrl" TEXT, "notes" TEXT, "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyStockAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyStockLocation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "locationType" TEXT NOT NULL,
  "parentLocationId" TEXT, "responsibleUserId" TEXT, "temperatureControlled" BOOLEAN NOT NULL DEFAULT false, "refrigerated" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyStockLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyInventoryLine_inventorySessionId_batchId_key" ON "PharmacyInventoryLine"("inventorySessionId","batchId");
CREATE UNIQUE INDEX "PharmacyStockLocation_organizationId_code_key" ON "PharmacyStockLocation"("organizationId","code");
CREATE INDEX "PharmacyInventorySession_organizationId_status_inventoryDate_idx" ON "PharmacyInventorySession"("organizationId","status","inventoryDate");
CREATE INDEX "PharmacyInventorySession_organizationId_responsibleUserId_idx" ON "PharmacyInventorySession"("organizationId","responsibleUserId");
CREATE INDEX "PharmacyInventorySession_organizationId_locationId_idx" ON "PharmacyInventorySession"("organizationId","locationId");
CREATE INDEX "PharmacyInventoryLine_organizationId_inventorySessionId_status_idx" ON "PharmacyInventoryLine"("organizationId","inventorySessionId","status");
CREATE INDEX "PharmacyInventoryLine_organizationId_productId_idx" ON "PharmacyInventoryLine"("organizationId","productId");
CREATE INDEX "PharmacyInventoryLine_organizationId_batchId_idx" ON "PharmacyInventoryLine"("organizationId","batchId");
CREATE INDEX "PharmacyStockAdjustment_organizationId_status_createdAt_idx" ON "PharmacyStockAdjustment"("organizationId","status","createdAt");
CREATE INDEX "PharmacyStockAdjustment_organizationId_productId_idx" ON "PharmacyStockAdjustment"("organizationId","productId");
CREATE INDEX "PharmacyStockAdjustment_organizationId_batchId_idx" ON "PharmacyStockAdjustment"("organizationId","batchId");
CREATE INDEX "PharmacyStockAdjustment_organizationId_inventorySessionId_idx" ON "PharmacyStockAdjustment"("organizationId","inventorySessionId");
CREATE INDEX "PharmacyStockLocation_organizationId_status_idx" ON "PharmacyStockLocation"("organizationId","status");
CREATE INDEX "PharmacyStockLocation_organizationId_parentLocationId_idx" ON "PharmacyStockLocation"("organizationId","parentLocationId");
ALTER TABLE "PharmacyInventorySession" ADD CONSTRAINT "PharmacyInventorySession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventorySession" ADD CONSTRAINT "PharmacyInventorySession_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventorySession" ADD CONSTRAINT "PharmacyInventorySession_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventorySession" ADD CONSTRAINT "PharmacyInventorySession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventorySession" ADD CONSTRAINT "PharmacyInventorySession_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventoryLine" ADD CONSTRAINT "PharmacyInventoryLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventoryLine" ADD CONSTRAINT "PharmacyInventoryLine_inventorySessionId_fkey" FOREIGN KEY ("inventorySessionId") REFERENCES "PharmacyInventorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventoryLine" ADD CONSTRAINT "PharmacyInventoryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventoryLine" ADD CONSTRAINT "PharmacyInventoryLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyInventoryLine" ADD CONSTRAINT "PharmacyInventoryLine_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_inventorySessionId_fkey" FOREIGN KEY ("inventorySessionId") REFERENCES "PharmacyInventorySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_inventoryLineId_fkey" FOREIGN KEY ("inventoryLineId") REFERENCES "PharmacyInventoryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockAdjustment" ADD CONSTRAINT "PharmacyStockAdjustment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockLocation" ADD CONSTRAINT "PharmacyStockLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockLocation" ADD CONSTRAINT "PharmacyStockLocation_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockLocation" ADD CONSTRAINT "PharmacyStockLocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyStockLocation" ADD CONSTRAINT "PharmacyStockLocation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
