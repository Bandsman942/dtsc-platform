CREATE TABLE "PharmacyDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentNumber" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "documentType" TEXT NOT NULL, "category" TEXT NOT NULL, "subcategory" TEXT, "moduleSource" TEXT, "sourceEntityType" TEXT, "sourceEntityId" TEXT,
  "reference" TEXT, "documentDate" TIMESTAMP(3), "issuer" TEXT, "fileUrl" TEXT, "storageKey" TEXT, "filename" TEXT, "mimeType" TEXT,
  "fileSize" INTEGER, "checksum" TEXT, "versionNumber" INTEGER NOT NULL DEFAULT 1, "replacedByDocumentId" TEXT, "renewedByDocumentId" TEXT,
  "language" TEXT, "tagsJson" JSONB, "importance" TEXT NOT NULL DEFAULT 'NORMAL', "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL',
  "restrictedRolesJson" JSONB, "restrictedUsersJson" JSONB, "restrictedDepartmentsJson" JSONB, "downloadRequiresPermission" BOOLEAN NOT NULL DEFAULT true,
  "sensitiveDownloadAudit" BOOLEAN NOT NULL DEFAULT false, "visibleInActivities" BOOLEAN NOT NULL DEFAULT false, "complianceRequired" BOOLEAN NOT NULL DEFAULT false,
  "complianceStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED', "expiryDate" TIMESTAMP(3), "renewalRequired" BOOLEAN NOT NULL DEFAULT false,
  "renewalDueDate" TIMESTAMP(3), "verificationRequired" BOOLEAN NOT NULL DEFAULT false, "verifiedById" TEXT, "verifiedAt" TIMESTAMP(3),
  "validationComment" TEXT, "rejectionReason" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "notes" TEXT, "createdById" TEXT NOT NULL,
  "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyDocumentLink" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "linkRole" TEXT NOT NULL DEFAULT 'PRIMARY', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyDocumentLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyDocumentVersion" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "versionNumber" INTEGER NOT NULL, "fileUrl" TEXT,
  "storageKey" TEXT, "filename" TEXT, "mimeType" TEXT, "fileSize" INTEGER, "checksum" TEXT, "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "changeReason" TEXT, "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PharmacyDocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyDocumentAccessLog" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "ip" TEXT, "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyDocumentAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyDocumentComplianceRule" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "ruleCode" TEXT NOT NULL, "label" TEXT NOT NULL, "description" TEXT,
  "entityType" TEXT NOT NULL, "documentType" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true, "expiryRequired" BOOLEAN NOT NULL DEFAULT false,
  "verificationRequired" BOOLEAN NOT NULL DEFAULT false, "defaultConfidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL',
  "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyDocumentComplianceRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyMissingDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "ruleId" TEXT, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "expectedDocumentType" TEXT NOT NULL, "criticality" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT, "resolvedByDocumentId" TEXT, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyMissingDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacyDocument_organizationId_documentNumber_key" ON "PharmacyDocument"("organizationId","documentNumber");
CREATE INDEX "PharmacyDocument_organizationId_documentType_category_idx" ON "PharmacyDocument"("organizationId","documentType","category");
CREATE INDEX "PharmacyDocument_organizationId_moduleSource_sourceEntityType_sourceEntityId_idx" ON "PharmacyDocument"("organizationId","moduleSource","sourceEntityType","sourceEntityId");
CREATE INDEX "PharmacyDocument_organizationId_confidentialityLevel_status_idx" ON "PharmacyDocument"("organizationId","confidentialityLevel","status");
CREATE INDEX "PharmacyDocument_organizationId_complianceStatus_expiryDate_idx" ON "PharmacyDocument"("organizationId","complianceStatus","expiryDate");
CREATE INDEX "PharmacyDocument_organizationId_createdById_createdAt_idx" ON "PharmacyDocument"("organizationId","createdById","createdAt");
CREATE UNIQUE INDEX "PharmacyDocumentLink_organizationId_documentId_entityType_entityId_linkRole_key" ON "PharmacyDocumentLink"("organizationId","documentId","entityType","entityId","linkRole");
CREATE INDEX "PharmacyDocumentLink_organizationId_entityType_entityId_idx" ON "PharmacyDocumentLink"("organizationId","entityType","entityId");
CREATE UNIQUE INDEX "PharmacyDocumentVersion_organizationId_documentId_versionNumber_key" ON "PharmacyDocumentVersion"("organizationId","documentId","versionNumber");
CREATE INDEX "PharmacyDocumentVersion_organizationId_documentId_isCurrent_idx" ON "PharmacyDocumentVersion"("organizationId","documentId","isCurrent");
CREATE INDEX "PharmacyDocumentAccessLog_organizationId_documentId_createdAt_idx" ON "PharmacyDocumentAccessLog"("organizationId","documentId","createdAt");
CREATE INDEX "PharmacyDocumentAccessLog_organizationId_actorId_action_idx" ON "PharmacyDocumentAccessLog"("organizationId","actorId","action");
CREATE UNIQUE INDEX "PharmacyDocumentComplianceRule_organizationId_ruleCode_key" ON "PharmacyDocumentComplianceRule"("organizationId","ruleCode");
CREATE INDEX "PharmacyDocumentComplianceRule_organizationId_entityType_enabled_idx" ON "PharmacyDocumentComplianceRule"("organizationId","entityType","enabled");
CREATE UNIQUE INDEX "PharmacyMissingDocument_organizationId_entityType_entityId_expectedDocumentType_key" ON "PharmacyMissingDocument"("organizationId","entityType","entityId","expectedDocumentType");
CREATE INDEX "PharmacyMissingDocument_organizationId_status_criticality_idx" ON "PharmacyMissingDocument"("organizationId","status","criticality");
CREATE INDEX "PharmacyMissingDocument_organizationId_entityType_entityId_idx" ON "PharmacyMissingDocument"("organizationId","entityType","entityId");
ALTER TABLE "PharmacyDocumentLink" ADD CONSTRAINT "PharmacyDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PharmacyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyDocumentVersion" ADD CONSTRAINT "PharmacyDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PharmacyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyDocumentAccessLog" ADD CONSTRAINT "PharmacyDocumentAccessLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PharmacyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyMissingDocument" ADD CONSTRAINT "PharmacyMissingDocument_resolvedByDocumentId_fkey" FOREIGN KEY ("resolvedByDocumentId") REFERENCES "PharmacyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
