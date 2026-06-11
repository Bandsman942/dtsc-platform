CREATE TABLE "PharmacyQualityIncident" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentNumber" TEXT NOT NULL, "title" TEXT NOT NULL,
  "incidentType" TEXT NOT NULL, "category" TEXT NOT NULL, "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL', "status" TEXT NOT NULL DEFAULT 'DRAFT', "incidentDate" TIMESTAMP(3) NOT NULL,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reportedById" TEXT NOT NULL, "reportingSource" TEXT NOT NULL,
  "departmentId" TEXT, "locationId" TEXT, "sourceModule" TEXT, "sourceEntityType" TEXT, "sourceEntityId" TEXT,
  "productId" TEXT, "batchId" TEXT, "saleId" TEXT, "saleLineId" TEXT, "prescriptionId" TEXT, "receiptId" TEXT,
  "returnEntityId" TEXT, "supplierId" TEXT, "alertId" TEXT, "customerPatientName" TEXT, "customerPatientContact" TEXT,
  "quantityAffected" DECIMAL(14,3), "unit" TEXT, "productCondition" TEXT, "productStillAvailable" BOOLEAN NOT NULL DEFAULT false,
  "recallRequired" BOOLEAN NOT NULL DEFAULT false, "description" TEXT NOT NULL, "patientImpact" TEXT,
  "immediateActionRequired" BOOLEAN NOT NULL DEFAULT false, "immediateActionTaken" BOOLEAN NOT NULL DEFAULT false,
  "immediateAction" TEXT, "immediateActionAt" TIMESTAMP(3), "immediateActionById" TEXT,
  "investigationRequired" BOOLEAN NOT NULL DEFAULT false, "assignedToId" TEXT, "dueAt" TIMESTAMP(3),
  "resolutionSummary" TEXT, "rejectionReason" TEXT, "cancellationReason" TEXT, "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT, "closedAt" TIMESTAMP(3), "closedById" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyQualityIncident_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyQualityInvestigation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "leadUserId" TEXT, "method" TEXT, "rootCause" TEXT, "findings" TEXT,
  "conclusion" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyQualityInvestigation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyQualityCapaAction" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "actionType" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "required" BOOLEAN NOT NULL DEFAULT true,
  "responsibleId" TEXT, "dueAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "effectiveness" TEXT, "validationNotes" TEXT,
  "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "rejectedReason" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyQualityCapaAction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyAdverseReactionReport" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "seriousness" TEXT NOT NULL,
  "reactionDescription" TEXT NOT NULL, "onsetAt" TIMESTAMP(3), "outcome" TEXT, "actionTaken" TEXT, "reporterType" TEXT,
  "authorityReference" TEXT, "reportedExternallyAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyAdverseReactionReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyCustomerComplaint" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "complaintNumber" TEXT NOT NULL,
  "channel" TEXT NOT NULL, "customerName" TEXT, "customerContact" TEXT, "description" TEXT NOT NULL,
  "requestedOutcome" TEXT, "response" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "assignedToId" TEXT,
  "resolvedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyCustomerComplaint_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyQualityDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "documentType" TEXT NOT NULL,
  "title" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "reference" TEXT, "confidentialityLevel" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyQualityDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyQualityEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "incidentId" TEXT NOT NULL, "actorId" TEXT, "eventType" TEXT NOT NULL,
  "oldStatus" TEXT, "newStatus" TEXT, "comment" TEXT, "metadataJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyQualityEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyQualityIncident_organizationId_incidentNumber_key" ON "PharmacyQualityIncident"("organizationId","incidentNumber");
CREATE INDEX "PharmacyQualityIncident_organizationId_status_criticality_idx" ON "PharmacyQualityIncident"("organizationId","status","criticality");
CREATE INDEX "PharmacyQualityIncident_organizationId_incidentType_category_idx" ON "PharmacyQualityIncident"("organizationId","incidentType","category");
CREATE INDEX "PharmacyQualityIncident_organizationId_productId_batchId_idx" ON "PharmacyQualityIncident"("organizationId","productId","batchId");
CREATE INDEX "PharmacyQualityIncident_organizationId_assignedToId_dueAt_idx" ON "PharmacyQualityIncident"("organizationId","assignedToId","dueAt");
CREATE INDEX "PharmacyQualityIncident_organizationId_reportedAt_idx" ON "PharmacyQualityIncident"("organizationId","reportedAt");
CREATE INDEX "PharmacyQualityInvestigation_organizationId_incidentId_status_idx" ON "PharmacyQualityInvestigation"("organizationId","incidentId","status");
CREATE INDEX "PharmacyQualityInvestigation_organizationId_leadUserId_dueAt_idx" ON "PharmacyQualityInvestigation"("organizationId","leadUserId","dueAt");
CREATE INDEX "PharmacyQualityCapaAction_organizationId_incidentId_status_idx" ON "PharmacyQualityCapaAction"("organizationId","incidentId","status");
CREATE INDEX "PharmacyQualityCapaAction_organizationId_responsibleId_dueAt_idx" ON "PharmacyQualityCapaAction"("organizationId","responsibleId","dueAt");
CREATE INDEX "PharmacyAdverseReactionReport_organizationId_incidentId_idx" ON "PharmacyAdverseReactionReport"("organizationId","incidentId");
CREATE INDEX "PharmacyAdverseReactionReport_organizationId_seriousness_createdAt_idx" ON "PharmacyAdverseReactionReport"("organizationId","seriousness","createdAt");
CREATE UNIQUE INDEX "PharmacyCustomerComplaint_organizationId_complaintNumber_key" ON "PharmacyCustomerComplaint"("organizationId","complaintNumber");
CREATE INDEX "PharmacyCustomerComplaint_organizationId_incidentId_status_idx" ON "PharmacyCustomerComplaint"("organizationId","incidentId","status");
CREATE INDEX "PharmacyQualityDocument_organizationId_incidentId_idx" ON "PharmacyQualityDocument"("organizationId","incidentId");
CREATE INDEX "PharmacyQualityDocument_organizationId_documentType_idx" ON "PharmacyQualityDocument"("organizationId","documentType");
CREATE INDEX "PharmacyQualityEvent_organizationId_incidentId_createdAt_idx" ON "PharmacyQualityEvent"("organizationId","incidentId","createdAt");
CREATE INDEX "PharmacyQualityEvent_organizationId_eventType_idx" ON "PharmacyQualityEvent"("organizationId","eventType");
ALTER TABLE "PharmacyQualityInvestigation" ADD CONSTRAINT "PharmacyQualityInvestigation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PharmacyQualityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyQualityCapaAction" ADD CONSTRAINT "PharmacyQualityCapaAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PharmacyQualityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyAdverseReactionReport" ADD CONSTRAINT "PharmacyAdverseReactionReport_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PharmacyQualityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyCustomerComplaint" ADD CONSTRAINT "PharmacyCustomerComplaint_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PharmacyQualityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyQualityDocument" ADD CONSTRAINT "PharmacyQualityDocument_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PharmacyQualityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyQualityEvent" ADD CONSTRAINT "PharmacyQualityEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PharmacyQualityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
