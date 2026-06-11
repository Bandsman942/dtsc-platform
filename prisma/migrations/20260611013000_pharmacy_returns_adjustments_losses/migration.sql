CREATE TABLE "PharmacyReturnLossEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "eventNumber" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "saleId" TEXT, "saleLineId" TEXT, "refundId" TEXT, "supplierId" TEXT, "purchaseOrderId" TEXT, "receiptId" TEXT,
  "inventorySessionId" TEXT, "inventoryLineId" TEXT, "productId" TEXT NOT NULL, "batchId" TEXT, "targetLocationId" TEXT,
  "quantity" DECIMAL(14,3) NOT NULL, "unit" TEXT NOT NULL, "direction" TEXT NOT NULL, "itemCondition" TEXT, "stockDecision" TEXT,
  "reason" TEXT NOT NULL, "estimatedValue" DECIMAL(14,2), "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
  "refundRequested" BOOLEAN NOT NULL DEFAULT false, "responsibleUserId" TEXT, "witnessUserId" TEXT, "destructionMethod" TEXT,
  "destructionDate" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'DRAFT', "stockImpactApplied" BOOLEAN NOT NULL DEFAULT false,
  "submittedById" TEXT, "submittedAt" TIMESTAMP(3), "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "rejectedById" TEXT,
  "rejectedAt" TIMESTAMP(3), "rejectionReason" TEXT, "cancellationReason" TEXT, "cancelledById" TEXT, "cancelledAt" TIMESTAMP(3),
  "notes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyReturnLossEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyReturnLossDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "eventId" TEXT NOT NULL, "productId" TEXT, "batchId" TEXT, "supplierId" TEXT,
  "documentType" TEXT NOT NULL, "title" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "reference" TEXT, "documentDate" TIMESTAMP(3),
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL', "notes" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReturnLossDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyReturnLossAlert" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "eventId" TEXT, "productId" TEXT, "batchId" TEXT, "alertType" TEXT NOT NULL,
  "criticality" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN', "message" TEXT NOT NULL,
  "recommendedAction" TEXT, "assignedToId" TEXT, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyReturnLossAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyReturnLossEvent_organizationId_eventNumber_key" ON "PharmacyReturnLossEvent"("organizationId","eventNumber");
CREATE INDEX "PharmacyReturnLossEvent_organizationId_eventType_status_idx" ON "PharmacyReturnLossEvent"("organizationId","eventType","status");
CREATE INDEX "PharmacyReturnLossEvent_organizationId_productId_batchId_idx" ON "PharmacyReturnLossEvent"("organizationId","productId","batchId");
CREATE INDEX "PharmacyReturnLossEvent_organizationId_saleId_idx" ON "PharmacyReturnLossEvent"("organizationId","saleId");
CREATE INDEX "PharmacyReturnLossEvent_organizationId_supplierId_idx" ON "PharmacyReturnLossEvent"("organizationId","supplierId");
CREATE INDEX "PharmacyReturnLossEvent_organizationId_createdAt_idx" ON "PharmacyReturnLossEvent"("organizationId","createdAt");
CREATE INDEX "PharmacyReturnLossDocument_organizationId_eventId_idx" ON "PharmacyReturnLossDocument"("organizationId","eventId");
CREATE INDEX "PharmacyReturnLossDocument_organizationId_productId_batchId_idx" ON "PharmacyReturnLossDocument"("organizationId","productId","batchId");
CREATE INDEX "PharmacyReturnLossAlert_organizationId_status_criticality_idx" ON "PharmacyReturnLossAlert"("organizationId","status","criticality");
CREATE INDEX "PharmacyReturnLossAlert_organizationId_eventId_idx" ON "PharmacyReturnLossAlert"("organizationId","eventId");
ALTER TABLE "PharmacyReturnLossDocument" ADD CONSTRAINT "PharmacyReturnLossDocument_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PharmacyReturnLossEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReturnLossAlert" ADD CONSTRAINT "PharmacyReturnLossAlert_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PharmacyReturnLossEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
