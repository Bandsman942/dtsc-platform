-- Ajoute les sections Administration MPO et CTO avec des registres
-- structurés, reliés aux projets sans migration destructive.

CREATE TABLE "MpoProject" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "projectType" TEXT NOT NULL DEFAULT 'DIGITAL_TRANSFORMATION',
  "requester" TEXT,
  "needDescription" TEXT,
  "businessObjective" TEXT,
  "technicalObjective" TEXT,
  "responsibleMpoId" TEXT,
  "responsibleMpoName" TEXT,
  "ctoEmployeeId" TEXT,
  "ctoEmployeeName" TEXT,
  "cooEmployeeId" TEXT,
  "cooEmployeeName" TEXT,
  "hrCfoEmployeeId" TEXT,
  "hrCfoEmployeeName" TEXT,
  "scoEmployeeId" TEXT,
  "scoEmployeeName" TEXT,
  "ceoEmployeeId" TEXT,
  "ceoEmployeeName" TEXT,
  "collaborators" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "complexity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "estimatedBudget" DECIMAL(12,2),
  "status" TEXT NOT NULL DEFAULT 'SCOPING',
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "expectedDeliverables" TEXT,
  "associatedDocuments" TEXT,
  "healthDigitalCategory" TEXT,
  "healthObjective" TEXT,
  "medicalDataConcerned" TEXT,
  "medicalRisk" TEXT,
  "confidentialityConstraint" TEXT,
  "healthValidation" TEXT,
  "ethicalCompliance" TEXT,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MpoProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MpoProject_status_priority_idx" ON "MpoProject"("status", "priority");
CREATE INDEX "MpoProject_projectType_idx" ON "MpoProject"("projectType");
CREATE INDEX "MpoProject_responsibleMpoId_idx" ON "MpoProject"("responsibleMpoId");
CREATE INDEX "MpoProject_ctoEmployeeId_idx" ON "MpoProject"("ctoEmployeeId");
CREATE INDEX "MpoProject_cooEmployeeId_idx" ON "MpoProject"("cooEmployeeId");
CREATE INDEX "MpoProject_hrCfoEmployeeId_idx" ON "MpoProject"("hrCfoEmployeeId");
CREATE INDEX "MpoProject_scoEmployeeId_idx" ON "MpoProject"("scoEmployeeId");
CREATE INDEX "MpoProject_ceoEmployeeId_idx" ON "MpoProject"("ceoEmployeeId");
CREATE INDEX "MpoProject_dueDate_idx" ON "MpoProject"("dueDate");

CREATE TABLE "MpoProjectRecord" (
  "id" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "category" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "targetEmployeeId" TEXT,
  "targetEmployeeName" TEXT,
  "amount" DECIMAL(12,2),
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "content" TEXT,
  "notes" TEXT,
  "attachmentUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MpoProjectRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MpoProjectRecord_recordType_status_idx" ON "MpoProjectRecord"("recordType", "status");
CREATE INDEX "MpoProjectRecord_projectId_idx" ON "MpoProjectRecord"("projectId");
CREATE INDEX "MpoProjectRecord_responsibleEmployeeId_idx" ON "MpoProjectRecord"("responsibleEmployeeId");
CREATE INDEX "MpoProjectRecord_targetEmployeeId_idx" ON "MpoProjectRecord"("targetEmployeeId");
CREATE INDEX "MpoProjectRecord_departmentId_idx" ON "MpoProjectRecord"("departmentId");
CREATE INDEX "MpoProjectRecord_dueDate_idx" ON "MpoProjectRecord"("dueDate");

ALTER TABLE "MpoProjectRecord"
  ADD CONSTRAINT "MpoProjectRecord_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "MpoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CtoTechnicalProject" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mpoProjectId" TEXT,
  "solutionType" TEXT NOT NULL DEFAULT 'WEB_APP',
  "functionalSummary" TEXT,
  "technicalObjective" TEXT,
  "responsibleCtoId" TEXT,
  "responsibleCtoName" TEXT,
  "technicalCollaborators" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "complexity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "techStack" TEXT,
  "status" TEXT NOT NULL DEFAULT 'TECH_ANALYSIS',
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "environment" TEXT,
  "repositoryUrl" TEXT,
  "documentationUrl" TEXT,
  "expectedTechnicalDeliverables" TEXT,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CtoTechnicalProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CtoTechnicalProject_status_priority_idx" ON "CtoTechnicalProject"("status", "priority");
CREATE INDEX "CtoTechnicalProject_solutionType_idx" ON "CtoTechnicalProject"("solutionType");
CREATE INDEX "CtoTechnicalProject_mpoProjectId_idx" ON "CtoTechnicalProject"("mpoProjectId");
CREATE INDEX "CtoTechnicalProject_responsibleCtoId_idx" ON "CtoTechnicalProject"("responsibleCtoId");
CREATE INDEX "CtoTechnicalProject_dueDate_idx" ON "CtoTechnicalProject"("dueDate");

ALTER TABLE "CtoTechnicalProject"
  ADD CONSTRAINT "CtoTechnicalProject_mpoProjectId_fkey"
  FOREIGN KEY ("mpoProjectId") REFERENCES "MpoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CtoTechnicalRecord" (
  "id" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "technicalProjectId" TEXT,
  "mpoProjectId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "category" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "assigneeEmployeeId" TEXT,
  "assigneeName" TEXT,
  "provider" TEXT,
  "environment" TEXT,
  "repositoryUrl" TEXT,
  "amount" DECIMAL(12,2),
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "content" TEXT,
  "notes" TEXT,
  "attachmentUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CtoTechnicalRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CtoTechnicalRecord_recordType_status_idx" ON "CtoTechnicalRecord"("recordType", "status");
CREATE INDEX "CtoTechnicalRecord_technicalProjectId_idx" ON "CtoTechnicalRecord"("technicalProjectId");
CREATE INDEX "CtoTechnicalRecord_mpoProjectId_idx" ON "CtoTechnicalRecord"("mpoProjectId");
CREATE INDEX "CtoTechnicalRecord_responsibleEmployeeId_idx" ON "CtoTechnicalRecord"("responsibleEmployeeId");
CREATE INDEX "CtoTechnicalRecord_assigneeEmployeeId_idx" ON "CtoTechnicalRecord"("assigneeEmployeeId");
CREATE INDEX "CtoTechnicalRecord_departmentId_idx" ON "CtoTechnicalRecord"("departmentId");
CREATE INDEX "CtoTechnicalRecord_dueDate_idx" ON "CtoTechnicalRecord"("dueDate");

ALTER TABLE "CtoTechnicalRecord"
  ADD CONSTRAINT "CtoTechnicalRecord_technicalProjectId_fkey"
  FOREIGN KEY ("technicalProjectId") REFERENCES "CtoTechnicalProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CtoTechnicalRecord"
  ADD CONSTRAINT "CtoTechnicalRecord_mpoProjectId_fkey"
  FOREIGN KEY ("mpoProjectId") REFERENCES "MpoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
