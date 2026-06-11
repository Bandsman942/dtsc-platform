CREATE TABLE "PharmacyAlert" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "alertNumber" TEXT NOT NULL, "deduplicationKey" TEXT NOT NULL,
  "alertType" TEXT NOT NULL, "category" TEXT NOT NULL, "title" TEXT NOT NULL, "message" TEXT NOT NULL,
  "criticality" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN', "sourceModule" TEXT,
  "sourceEntityType" TEXT, "sourceEntityId" TEXT, "productId" TEXT, "batchId" TEXT, "supplierId" TEXT,
  "purchaseOrderId" TEXT, "receiptId" TEXT, "saleId" TEXT, "inventorySessionId" TEXT, "adjustmentId" TEXT,
  "cashSessionId" TEXT, "returnEntityType" TEXT, "returnEntityId" TEXT, "recommendedAction" TEXT,
  "assignedToId" TEXT, "assignedById" TEXT, "assignedAt" TIMESTAMP(3), "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "detectedCount" INTEGER NOT NULL DEFAULT 1,
  "dueAt" TIMESTAMP(3), "seenAt" TIMESTAMP(3), "takenAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3), "resolvedById" TEXT,
  "resolutionComment" TEXT, "ignoredAt" TIMESTAMP(3), "ignoredById" TEXT, "ignoredReason" TEXT, "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT, "cancellationReason" TEXT, "relatedTaskId" TEXT, "relatedInternalRequestId" TEXT,
  "relatedReplenishmentRequestId" TEXT, "metadataJson" JSONB, "createdById" TEXT, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyAlert_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyAlertEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "alertId" TEXT NOT NULL, "actorId" TEXT, "eventType" TEXT NOT NULL,
  "oldStatus" TEXT, "newStatus" TEXT, "comment" TEXT, "metadataJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyAlertEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyAlertRule" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "ruleCode" TEXT NOT NULL, "category" TEXT NOT NULL, "alertType" TEXT NOT NULL,
  "label" TEXT NOT NULL, "description" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT true, "defaultCriticality" TEXT NOT NULL DEFAULT 'MEDIUM',
  "thresholdJson" JSONB, "defaultAssigneeRole" TEXT, "defaultAssigneeUserId" TEXT, "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyAlertRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyAlertSetting" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "nearExpiryThresholdDays" INTEGER NOT NULL DEFAULT 90,
  "criticalCashVarianceThreshold" DECIMAL(14,2) NOT NULL DEFAULT 100, "criticalLossValueThreshold" DECIMAL(14,2) NOT NULL DEFAULT 500,
  "maxCashSessionHours" INTEGER NOT NULL DEFAULT 16, "maxPharmacistValidationHours" INTEGER NOT NULL DEFAULT 24,
  "maxReceiptValidationHours" INTEGER NOT NULL DEFAULT 48, "autoResolveAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "criticalAlertNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true, "alertSettingsJson" JSONB, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyAlertSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyAlert_organizationId_alertNumber_key" ON "PharmacyAlert"("organizationId","alertNumber");
CREATE UNIQUE INDEX "PharmacyAlert_organizationId_deduplicationKey_key" ON "PharmacyAlert"("organizationId","deduplicationKey");
CREATE INDEX "PharmacyAlert_organizationId_status_criticality_idx" ON "PharmacyAlert"("organizationId","status","criticality");
CREATE INDEX "PharmacyAlert_organizationId_category_alertType_idx" ON "PharmacyAlert"("organizationId","category","alertType");
CREATE INDEX "PharmacyAlert_organizationId_assignedToId_status_idx" ON "PharmacyAlert"("organizationId","assignedToId","status");
CREATE INDEX "PharmacyAlert_organizationId_productId_batchId_idx" ON "PharmacyAlert"("organizationId","productId","batchId");
CREATE INDEX "PharmacyAlert_organizationId_sourceModule_sourceEntityType_sourceEntityId_idx" ON "PharmacyAlert"("organizationId","sourceModule","sourceEntityType","sourceEntityId");
CREATE INDEX "PharmacyAlert_organizationId_firstDetectedAt_lastDetectedAt_idx" ON "PharmacyAlert"("organizationId","firstDetectedAt","lastDetectedAt");
CREATE INDEX "PharmacyAlert_organizationId_dueAt_idx" ON "PharmacyAlert"("organizationId","dueAt");
CREATE INDEX "PharmacyAlertEvent_organizationId_alertId_createdAt_idx" ON "PharmacyAlertEvent"("organizationId","alertId","createdAt");
CREATE INDEX "PharmacyAlertEvent_organizationId_eventType_idx" ON "PharmacyAlertEvent"("organizationId","eventType");
CREATE UNIQUE INDEX "PharmacyAlertRule_organizationId_ruleCode_key" ON "PharmacyAlertRule"("organizationId","ruleCode");
CREATE INDEX "PharmacyAlertRule_organizationId_category_enabled_idx" ON "PharmacyAlertRule"("organizationId","category","enabled");
CREATE UNIQUE INDEX "PharmacyAlertSetting_organizationId_key" ON "PharmacyAlertSetting"("organizationId");
ALTER TABLE "PharmacyAlertEvent" ADD CONSTRAINT "PharmacyAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "PharmacyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
