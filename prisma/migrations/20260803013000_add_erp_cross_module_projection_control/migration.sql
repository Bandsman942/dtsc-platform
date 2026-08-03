CREATE TABLE "EnterpriseCrossModuleProjection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "consumerCode" TEXT NOT NULL,
    "targetModule" TEXT NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "metadataJson" JSONB,
    "retryRequestedByUserId" TEXT,
    "retryRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseCrossModuleProjection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseCrossModuleProjection_organizationId_id_key"
ON "EnterpriseCrossModuleProjection"("organizationId", "id");

CREATE UNIQUE INDEX "EnterpriseCrossModuleProjection_organizationId_domainEventId_cons_key"
ON "EnterpriseCrossModuleProjection"("organizationId", "domainEventId", "consumerCode");

CREATE INDEX "EnterpriseCrossModuleProjection_organizationId_status_availableAt_idx"
ON "EnterpriseCrossModuleProjection"("organizationId", "status", "availableAt");

CREATE INDEX "EnterpriseCrossModuleProjection_organizationId_eventType_createdAt_idx"
ON "EnterpriseCrossModuleProjection"("organizationId", "eventType", "createdAt");

CREATE INDEX "EnterpriseCrossModuleProjection_organizationId_targetModule_targetEn_idx"
ON "EnterpriseCrossModuleProjection"("organizationId", "targetModule", "targetEntityType", "targetEntityId");

CREATE INDEX "EnterpriseCrossModuleProjection_domainEventId_idx"
ON "EnterpriseCrossModuleProjection"("domainEventId");
