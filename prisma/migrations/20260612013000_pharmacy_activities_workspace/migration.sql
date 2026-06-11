CREATE TABLE "PharmacyActivityItem" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "activityNumber" TEXT NOT NULL, "activityType" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "sourceModule" TEXT, "sourceEntityType" TEXT, "sourceEntityId" TEXT,
  "requestedById" TEXT NOT NULL, "assignedToId" TEXT, "departmentId" TEXT, "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "criticality" TEXT, "status" TEXT NOT NULL DEFAULT 'SUBMITTED', "dueAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "rejectionReason" TEXT, "resultEntityType" TEXT, "resultEntityId" TEXT,
  "metadataJson" JSONB, "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyActivityItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyActivityComment" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "activityId" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "comment" TEXT NOT NULL, "visibility" TEXT NOT NULL DEFAULT 'PARTICIPANTS', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyActivityComment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyActivityDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "activityId" TEXT NOT NULL, "documentId" TEXT, "fileUrl" TEXT,
  "documentType" TEXT NOT NULL, "title" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyActivityDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyActivityEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "activityId" TEXT NOT NULL, "actorId" TEXT, "eventType" TEXT NOT NULL,
  "oldStatus" TEXT, "newStatus" TEXT, "comment" TEXT, "metadataJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyActivityEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPharmacistAdviceRequest" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "requestNumber" TEXT NOT NULL, "subject" TEXT NOT NULL, "requestType" TEXT NOT NULL,
  "saleId" TEXT, "prescriptionId" TEXT, "productId" TEXT, "batchId" TEXT, "requestedById" TEXT NOT NULL, "pharmacistId" TEXT,
  "urgency" TEXT NOT NULL DEFAULT 'NORMAL', "description" TEXT NOT NULL, "response" TEXT, "respondedById" TEXT, "respondedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPharmacistAdviceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyActivityItem_organizationId_activityNumber_key" ON "PharmacyActivityItem"("organizationId","activityNumber");
CREATE INDEX "PharmacyActivityItem_organizationId_activityType_status_idx" ON "PharmacyActivityItem"("organizationId","activityType","status");
CREATE INDEX "PharmacyActivityItem_organizationId_requestedById_createdAt_idx" ON "PharmacyActivityItem"("organizationId","requestedById","createdAt");
CREATE INDEX "PharmacyActivityItem_organizationId_assignedToId_status_idx" ON "PharmacyActivityItem"("organizationId","assignedToId","status");
CREATE INDEX "PharmacyActivityItem_organizationId_sourceModule_sourceEntityType_sourceEntityId_idx" ON "PharmacyActivityItem"("organizationId","sourceModule","sourceEntityType","sourceEntityId");
CREATE INDEX "PharmacyActivityItem_organizationId_priority_criticality_dueAt_idx" ON "PharmacyActivityItem"("organizationId","priority","criticality","dueAt");
CREATE INDEX "PharmacyActivityComment_organizationId_activityId_createdAt_idx" ON "PharmacyActivityComment"("organizationId","activityId","createdAt");
CREATE INDEX "PharmacyActivityComment_organizationId_authorId_createdAt_idx" ON "PharmacyActivityComment"("organizationId","authorId","createdAt");
CREATE INDEX "PharmacyActivityDocument_organizationId_activityId_createdAt_idx" ON "PharmacyActivityDocument"("organizationId","activityId","createdAt");
CREATE INDEX "PharmacyActivityDocument_organizationId_documentId_idx" ON "PharmacyActivityDocument"("organizationId","documentId");
CREATE INDEX "PharmacyActivityEvent_organizationId_activityId_createdAt_idx" ON "PharmacyActivityEvent"("organizationId","activityId","createdAt");
CREATE INDEX "PharmacyActivityEvent_organizationId_actorId_createdAt_idx" ON "PharmacyActivityEvent"("organizationId","actorId","createdAt");
CREATE UNIQUE INDEX "PharmacyPharmacistAdviceRequest_organizationId_requestNumber_key" ON "PharmacyPharmacistAdviceRequest"("organizationId","requestNumber");
CREATE INDEX "PharmacyPharmacistAdviceRequest_organizationId_requestedById_status_idx" ON "PharmacyPharmacistAdviceRequest"("organizationId","requestedById","status");
CREATE INDEX "PharmacyPharmacistAdviceRequest_organizationId_pharmacistId_status_idx" ON "PharmacyPharmacistAdviceRequest"("organizationId","pharmacistId","status");
CREATE INDEX "PharmacyPharmacistAdviceRequest_organizationId_saleId_prescriptionId_idx" ON "PharmacyPharmacistAdviceRequest"("organizationId","saleId","prescriptionId");
