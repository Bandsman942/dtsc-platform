-- Ajoute la section LA — Legal Advisor sans modifier les données existantes.
-- Les pièces jointes restent des URLs privées générées par l'upload serveur.

INSERT INTO "DtscPosition" ("id", "title", "code", "description", "hierarchyLevel", "status", "permissions", "updatedAt")
VALUES ('pos-la', 'Legal Advisor', 'LA', 'Conseil juridique, contrats, conformité, litiges, archivage et confidentialité.', 3, 'ACTIVE', 'LA_LEGAL', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "hierarchyLevel" = EXCLUDED."hierarchyLevel",
  "permissions" = EXCLUDED."permissions",
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "LegalCase" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "caseType" TEXT NOT NULL DEFAULT 'OTHER',
  "requesterDepartmentId" TEXT,
  "requesterDepartmentName" TEXT,
  "requesterEmployeeId" TEXT,
  "requesterName" TEXT,
  "responsibleLegalId" TEXT,
  "responsibleLegalName" TEXT,
  "subject" TEXT,
  "description" TEXT,
  "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "dueDate" TIMESTAMP(3),
  "linkedEntityType" TEXT,
  "linkedEntityId" TEXT,
  "attachmentUrl" TEXT,
  "legalDecision" TEXT,
  "ceoValidationRequired" BOOLEAN NOT NULL DEFAULT false,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalContract" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contractType" TEXT NOT NULL DEFAULT 'SERVICE_CONTRACT',
  "counterparty" TEXT,
  "requesterDepartmentId" TEXT,
  "requesterDepartmentName" TEXT,
  "internalResponsibleId" TEXT,
  "internalResponsibleName" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "duration" TEXT,
  "amount" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" TEXT,
  "documentUrl" TEXT,
  "legalCaseId" TEXT,
  "legalValidation" TEXT,
  "ceoValidationRequired" BOOLEAN NOT NULL DEFAULT false,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "templateType" TEXT NOT NULL DEFAULT 'SERVICE_CONTRACT_TEMPLATE',
  "description" TEXT,
  "content" TEXT,
  "version" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "authorId" TEXT,
  "authorName" TEXT,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalRisk" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "linkedEntityType" TEXT,
  "linkedEntityId" TEXT,
  "description" TEXT,
  "potentialImpact" TEXT,
  "probability" TEXT NOT NULL DEFAULT 'MEDIUM',
  "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "correctiveMeasure" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dueDate" TIMESTAMP(3),
  "ceoEscalation" BOOLEAN NOT NULL DEFAULT false,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalRisk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalDocument" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'ADMINISTRATIVE_DOCUMENT',
  "reference" TEXT,
  "documentDate" TIMESTAMP(3),
  "expirationDate" TIMESTAMP(3),
  "requesterDepartmentId" TEXT,
  "requesterDepartmentName" TEXT,
  "legalCaseId" TEXT,
  "fileUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL_PUBLIC',
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalDispute" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "counterparty" TEXT,
  "disputeType" TEXT NOT NULL DEFAULT 'OTHER',
  "departmentId" TEXT,
  "departmentName" TEXT,
  "description" TEXT,
  "potentialAmount" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "followUpResponsibleId" TEXT,
  "followUpResponsibleName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "nextAction" TEXT,
  "dueDate" TIMESTAMP(3),
  "documentUrl" TEXT,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalDispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalRequest" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "requesterDepartmentId" TEXT,
  "requesterDepartmentName" TEXT,
  "requesterEmployeeId" TEXT,
  "requesterName" TEXT,
  "requestType" TEXT NOT NULL DEFAULT 'OTHER',
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "desiredDueDate" TIMESTAMP(3),
  "documentUrl" TEXT,
  "linkedEntityType" TEXT,
  "linkedEntityId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "legalResponse" TEXT,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegalReport" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reportType" TEXT NOT NULL DEFAULT 'WEEKLY_LA',
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleLegalId" TEXT,
  "responsibleLegalName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "content" TEXT,
  "recommendations" TEXT,
  "attachmentUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalCase_caseType_status_idx" ON "LegalCase"("caseType", "status");
CREATE INDEX "LegalCase_requesterDepartmentId_idx" ON "LegalCase"("requesterDepartmentId");
CREATE INDEX "LegalCase_requesterEmployeeId_idx" ON "LegalCase"("requesterEmployeeId");
CREATE INDEX "LegalCase_responsibleLegalId_idx" ON "LegalCase"("responsibleLegalId");
CREATE INDEX "LegalCase_riskLevel_priority_idx" ON "LegalCase"("riskLevel", "priority");
CREATE INDEX "LegalCase_dueDate_idx" ON "LegalCase"("dueDate");

CREATE INDEX "LegalContract_contractType_status_idx" ON "LegalContract"("contractType", "status");
CREATE INDEX "LegalContract_requesterDepartmentId_idx" ON "LegalContract"("requesterDepartmentId");
CREATE INDEX "LegalContract_internalResponsibleId_idx" ON "LegalContract"("internalResponsibleId");
CREATE INDEX "LegalContract_legalCaseId_idx" ON "LegalContract"("legalCaseId");
CREATE INDEX "LegalContract_endDate_idx" ON "LegalContract"("endDate");

CREATE INDEX "LegalTemplate_templateType_status_idx" ON "LegalTemplate"("templateType", "status");
CREATE INDEX "LegalTemplate_authorId_idx" ON "LegalTemplate"("authorId");

CREATE INDEX "LegalRisk_status_riskLevel_idx" ON "LegalRisk"("status", "riskLevel");
CREATE INDEX "LegalRisk_departmentId_idx" ON "LegalRisk"("departmentId");
CREATE INDEX "LegalRisk_responsibleEmployeeId_idx" ON "LegalRisk"("responsibleEmployeeId");
CREATE INDEX "LegalRisk_dueDate_idx" ON "LegalRisk"("dueDate");

CREATE INDEX "LegalDocument_documentType_status_idx" ON "LegalDocument"("documentType", "status");
CREATE INDEX "LegalDocument_requesterDepartmentId_idx" ON "LegalDocument"("requesterDepartmentId");
CREATE INDEX "LegalDocument_legalCaseId_idx" ON "LegalDocument"("legalCaseId");
CREATE INDEX "LegalDocument_confidentialityLevel_idx" ON "LegalDocument"("confidentialityLevel");
CREATE INDEX "LegalDocument_expirationDate_idx" ON "LegalDocument"("expirationDate");

CREATE INDEX "LegalDispute_disputeType_status_idx" ON "LegalDispute"("disputeType", "status");
CREATE INDEX "LegalDispute_departmentId_idx" ON "LegalDispute"("departmentId");
CREATE INDEX "LegalDispute_followUpResponsibleId_idx" ON "LegalDispute"("followUpResponsibleId");
CREATE INDEX "LegalDispute_riskLevel_idx" ON "LegalDispute"("riskLevel");
CREATE INDEX "LegalDispute_dueDate_idx" ON "LegalDispute"("dueDate");

CREATE INDEX "LegalRequest_requestType_status_idx" ON "LegalRequest"("requestType", "status");
CREATE INDEX "LegalRequest_requesterDepartmentId_idx" ON "LegalRequest"("requesterDepartmentId");
CREATE INDEX "LegalRequest_requesterEmployeeId_idx" ON "LegalRequest"("requesterEmployeeId");
CREATE INDEX "LegalRequest_priority_idx" ON "LegalRequest"("priority");
CREATE INDEX "LegalRequest_desiredDueDate_idx" ON "LegalRequest"("desiredDueDate");

CREATE INDEX "LegalReport_reportType_status_idx" ON "LegalReport"("reportType", "status");
CREATE INDEX "LegalReport_departmentId_idx" ON "LegalReport"("departmentId");
CREATE INDEX "LegalReport_responsibleLegalId_idx" ON "LegalReport"("responsibleLegalId");
CREATE INDEX "LegalReport_periodEnd_idx" ON "LegalReport"("periodEnd");
