CREATE TABLE "HealthDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentNumber" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "documentType" TEXT NOT NULL, "sourceModule" TEXT NOT NULL, "confidentialityLevel" TEXT NOT NULL DEFAULT 'MEDICAL_STANDARD', "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "patientId" TEXT, "consultationId" TEXT, "medicalRecordId" TEXT, "labRequestId" TEXT, "invoiceId" TEXT, "coverageRequestId" TEXT, "qualityIncidentId" TEXT,
  "pharmacyDispensationId" TEXT, "staffAssignmentId" TEXT, "departmentId" TEXT, "documentDate" TIMESTAMP(3), "expiresAt" TIMESTAMP(3),
  "storageKey" TEXT, "originalFilename" TEXT, "mimeType" TEXT, "fileSize" INTEGER, "checksum" TEXT, "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
  "validationRequired" BOOLEAN NOT NULL DEFAULT false, "validatorUserId" TEXT, "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "validationComment" TEXT,
  "rejectedById" TEXT, "rejectedAt" TIMESTAMP(3), "rejectionReason" TEXT, "restrictedAccess" BOOLEAN NOT NULL DEFAULT false, "restrictedAccessReason" TEXT,
  "containsSensitiveMedicalData" BOOLEAN NOT NULL DEFAULT false, "internalNotes" TEXT, "visibleNotes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "archivedById" TEXT, "archivedAt" TIMESTAMP(3), "archiveReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthDocumentVersion" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "versionNumber" INTEGER NOT NULL, "storageKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "checksum" TEXT NOT NULL, "changeReason" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "uploadedById" TEXT NOT NULL, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthDocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthDocumentAccessLog" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "userId" TEXT NOT NULL, "action" TEXT NOT NULL, "accessResult" TEXT NOT NULL DEFAULT 'ALLOWED',
  "reason" TEXT, "ipAddress" TEXT, "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HealthDocumentAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HealthDocument_organizationId_documentNumber_key" ON "HealthDocument"("organizationId","documentNumber");
CREATE UNIQUE INDEX "HealthDocument_organizationId_id_key" ON "HealthDocument"("organizationId","id");
CREATE INDEX "HealthDocument_organizationId_patientId_createdAt_idx" ON "HealthDocument"("organizationId","patientId","createdAt");
CREATE INDEX "HealthDocument_organizationId_consultationId_idx" ON "HealthDocument"("organizationId","consultationId");
CREATE INDEX "HealthDocument_organizationId_medicalRecordId_idx" ON "HealthDocument"("organizationId","medicalRecordId");
CREATE INDEX "HealthDocument_organizationId_labRequestId_idx" ON "HealthDocument"("organizationId","labRequestId");
CREATE INDEX "HealthDocument_organizationId_invoiceId_idx" ON "HealthDocument"("organizationId","invoiceId");
CREATE INDEX "HealthDocument_organizationId_coverageRequestId_idx" ON "HealthDocument"("organizationId","coverageRequestId");
CREATE INDEX "HealthDocument_organizationId_qualityIncidentId_idx" ON "HealthDocument"("organizationId","qualityIncidentId");
CREATE INDEX "HealthDocument_organizationId_documentType_status_idx" ON "HealthDocument"("organizationId","documentType","status");
CREATE INDEX "HealthDocument_organizationId_sourceModule_confidentialityLevel_idx" ON "HealthDocument"("organizationId","sourceModule","confidentialityLevel");
CREATE INDEX "HealthDocument_organizationId_expiresAt_idx" ON "HealthDocument"("organizationId","expiresAt");
CREATE INDEX "HealthDocument_organizationId_createdById_createdAt_idx" ON "HealthDocument"("organizationId","createdById","createdAt");
CREATE UNIQUE INDEX "HealthDocumentVersion_organizationId_documentId_versionNumber_key" ON "HealthDocumentVersion"("organizationId","documentId","versionNumber");
CREATE UNIQUE INDEX "HealthDocumentVersion_organizationId_id_key" ON "HealthDocumentVersion"("organizationId","id");
CREATE INDEX "HealthDocumentVersion_organizationId_documentId_uploadedAt_idx" ON "HealthDocumentVersion"("organizationId","documentId","uploadedAt");
CREATE INDEX "HealthDocumentAccessLog_organizationId_documentId_createdAt_idx" ON "HealthDocumentAccessLog"("organizationId","documentId","createdAt");
CREATE INDEX "HealthDocumentAccessLog_organizationId_userId_createdAt_idx" ON "HealthDocumentAccessLog"("organizationId","userId","createdAt");
ALTER TABLE "HealthDocumentVersion" ADD CONSTRAINT "HealthDocumentVersion_organizationId_documentId_fkey" FOREIGN KEY ("organizationId","documentId") REFERENCES "HealthDocument"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthDocumentAccessLog" ADD CONSTRAINT "HealthDocumentAccessLog_organizationId_documentId_fkey" FOREIGN KEY ("organizationId","documentId") REFERENCES "HealthDocument"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.documents.view","health.documents.view_sensitive","health.documents.view_restricted","health.documents.create","health.documents.update_metadata","health.documents.upload_file","health.documents.download","health.documents.validate","health.documents.reject","health.documents.archive","health.documents.restore","health.documents.manage_versions","health.documents.view_access_logs"]'::jsonb
WHERE "positionCode"='MEDICAL_DIRECTOR' AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.documents.view","health.documents.view_sensitive","health.documents.create","health.documents.upload_file","health.documents.download","health.documents.validate"]'::jsonb
WHERE "positionCode"='DOCTOR' AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.documents.view","health.documents.create","health.documents.upload_file","health.documents.download"]'::jsonb
WHERE "positionCode" IN ('NURSE','LAB_TECHNICIAN','PHARMACIST','RECEPTIONIST','MEDICAL_CASHIER','INSURANCE_AGENT','QUALITY_MANAGER') AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
