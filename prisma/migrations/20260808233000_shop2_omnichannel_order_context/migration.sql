CREATE TABLE "EnterpriseRetailOrderOrchestration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL DEFAULT 'POS',
    "fulfillmentMode" TEXT NOT NULL,
    "sourceSiteId" TEXT NOT NULL,
    "fulfillmentWarehouseId" TEXT NOT NULL,
    "pickupSiteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseRetailOrderOrchestration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailOrderOrchestration_organizationId_id_key" ON "EnterpriseRetailOrderOrchestration"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailOrderOrchestration_organizationId_salesOrderId_key" ON "EnterpriseRetailOrderOrchestration"("organizationId", "salesOrderId");
CREATE UNIQUE INDEX "EnterpriseRetailOrderOrchestration_organizationId_idempotencyKey_key" ON "EnterpriseRetailOrderOrchestration"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailOrderOrchestration_organizationId_fulfillmentMode_status_createdAt_idx" ON "EnterpriseRetailOrderOrchestration"("organizationId", "fulfillmentMode", "status", "createdAt");
CREATE INDEX "EnterpriseRetailOrderOrchestration_organizationId_sourceSiteId_fulfillmentWarehouseId_idx" ON "EnterpriseRetailOrderOrchestration"("organizationId", "sourceSiteId", "fulfillmentWarehouseId");
CREATE INDEX "EnterpriseRetailOrderOrchestration_archivedAt_idx" ON "EnterpriseRetailOrderOrchestration"("archivedAt");
