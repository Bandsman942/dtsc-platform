CREATE TABLE "HealthQualityIncident" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "incidentType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedById" TEXT NOT NULL,
  "anonymousReport" BOOLEAN NOT NULL DEFAULT false,
  "departmentId" TEXT,
  "patientId" TEXT,
  "appointmentId" TEXT,
  "consultationId" TEXT,
  "medicalRecordId" TEXT,
  "labRequestId" TEXT,
  "pharmacyDispensationId" TEXT,
  "pharmacyStockMovementId" TEXT,
  "invoiceId" TEXT,
  "coverageRequestId" TEXT,
  "staffAssignmentId" TEXT,
  "initialSeverity" TEXT NOT NULL,
  "confirmedSeverity" TEXT,
  "initialCriticality" TEXT NOT NULL,
  "confirmedCriticality" TEXT,
  "patientImpact" TEXT,
  "organizationalImpact" TEXT,
  "recurrenceProbability" TEXT,
  "detectability" TEXT,
  "urgency" TEXT,
  "patientInformed" BOOLEAN NOT NULL DEFAULT false,
  "immediateSupervisorInformed" BOOLEAN NOT NULL DEFAULT false,
  "observedConsequences" TEXT,
  "immediateActions" TEXT,
  "witnesses" TEXT,
  "internalNotes" TEXT,
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'QUALITY_STANDARD',
  "containsSensitiveMedicalData" BOOLEAN NOT NULL DEFAULT false,
  "confidentialityIncident" BOOLEAN NOT NULL DEFAULT false,
  "restrictedAccess" BOOLEAN NOT NULL DEFAULT false,
  "confidentialityReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REPORTED',
  "assignedToId" TEXT,
  "dueDate" TIMESTAMP(3),
  "qualifiedById" TEXT,
  "qualifiedAt" TIMESTAMP(3),
  "qualificationNotes" TEXT,
  "escalationRequired" BOOLEAN NOT NULL DEFAULT false,
  "investigationSummary" TEXT,
  "immediateCause" TEXT,
  "rootCause" TEXT,
  "contributingFactors" TEXT,
  "investigationConclusion" TEXT,
  "recommendations" TEXT,
  "investigatedById" TEXT,
  "investigatedAt" TIMESTAMP(3),
  "finalConclusion" TEXT,
  "residualRisk" TEXT,
  "lessonsLearned" TEXT,
  "procedureUpdated" BOOLEAN NOT NULL DEFAULT false,
  "closureNotes" TEXT,
  "closedById" TEXT,
  "closedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenReason" TEXT,
  "archivedById" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archiveReason" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthQualityIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthQualityCorrectiveAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "responsibleUserId" TEXT NOT NULL,
  "responsibleStaffId" TEXT,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "evidenceUrl" TEXT,
  "completionComment" TEXT,
  "validationComment" TEXT,
  "rejectionReason" TEXT,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "validatedById" TEXT,
  "validatedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthQualityCorrectiveAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthQualityIncidentEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reason" TEXT,
  "metadataJson" JSONB,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthQualityIncidentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthQualityIncident_organizationId_incidentNumber_key" ON "HealthQualityIncident"("organizationId", "incidentNumber");
CREATE UNIQUE INDEX "HealthQualityIncident_organizationId_id_key" ON "HealthQualityIncident"("organizationId", "id");
CREATE INDEX "HealthQualityIncident_organizationId_incidentType_status_idx" ON "HealthQualityIncident"("organizationId", "incidentType", "status");
CREATE INDEX "HealthQualityIncident_organizationId_initialCriticality_confirmedCriticality_idx" ON "HealthQualityIncident"("organizationId", "initialCriticality", "confirmedCriticality");
CREATE INDEX "HealthQualityIncident_organizationId_patientId_reportedAt_idx" ON "HealthQualityIncident"("organizationId", "patientId", "reportedAt");
CREATE INDEX "HealthQualityIncident_organizationId_consultationId_idx" ON "HealthQualityIncident"("organizationId", "consultationId");
CREATE INDEX "HealthQualityIncident_organizationId_departmentId_status_idx" ON "HealthQualityIncident"("organizationId", "departmentId", "status");
CREATE INDEX "HealthQualityIncident_organizationId_assignedToId_dueDate_idx" ON "HealthQualityIncident"("organizationId", "assignedToId", "dueDate");
CREATE INDEX "HealthQualityIncident_organizationId_confidentialityIncident_restrictedAccess_idx" ON "HealthQualityIncident"("organizationId", "confidentialityIncident", "restrictedAccess");
CREATE INDEX "HealthQualityIncident_organizationId_createdById_createdAt_idx" ON "HealthQualityIncident"("organizationId", "createdById", "createdAt");
CREATE UNIQUE INDEX "HealthQualityCorrectiveAction_organizationId_id_key" ON "HealthQualityCorrectiveAction"("organizationId", "id");
CREATE INDEX "HealthQualityCorrectiveAction_organizationId_incidentId_status_idx" ON "HealthQualityCorrectiveAction"("organizationId", "incidentId", "status");
CREATE INDEX "HealthQualityCorrectiveAction_organizationId_responsibleUserId_status_dueDate_idx" ON "HealthQualityCorrectiveAction"("organizationId", "responsibleUserId", "status", "dueDate");
CREATE INDEX "HealthQualityCorrectiveAction_organizationId_dueDate_status_idx" ON "HealthQualityCorrectiveAction"("organizationId", "dueDate", "status");
CREATE INDEX "HealthQualityIncidentEvent_organizationId_incidentId_createdAt_idx" ON "HealthQualityIncidentEvent"("organizationId", "incidentId", "createdAt");
CREATE INDEX "HealthQualityIncidentEvent_organizationId_actorUserId_createdAt_idx" ON "HealthQualityIncidentEvent"("organizationId", "actorUserId", "createdAt");

ALTER TABLE "HealthQualityCorrectiveAction"
  ADD CONSTRAINT "HealthQualityCorrectiveAction_organizationId_incidentId_fkey"
  FOREIGN KEY ("organizationId", "incidentId") REFERENCES "HealthQualityIncident"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HealthQualityIncidentEvent"
  ADD CONSTRAINT "HealthQualityIncidentEvent_organizationId_incidentId_fkey"
  FOREIGN KEY ("organizationId", "incidentId") REFERENCES "HealthQualityIncident"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.quality.view","health.quality.view_sensitive","health.quality.create_incident","health.quality.update_incident","health.quality.qualify_incident","health.quality.assign_incident","health.quality.investigate_incident","health.quality.close_incident","health.quality.reopen_incident","health.quality.archive_incident","health.quality.manage_corrective_actions","health.quality.validate_corrective_actions","health.quality.view_confidential_incidents","health.quality.view_reports"]'::jsonb
WHERE "positionCode"='QUALITY_MANAGER' AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');

UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.quality.view","health.quality.view_sensitive","health.quality.create_incident","health.quality.investigate_incident","health.quality.close_incident","health.quality.manage_corrective_actions","health.quality.view_reports"]'::jsonb
WHERE "positionCode"='MEDICAL_DIRECTOR' AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');

UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb)||'["health.quality.create_incident","health.quality.view","health.quality.manage_corrective_actions"]'::jsonb
WHERE "positionCode" IN ('DOCTOR','NURSE','LAB_TECHNICIAN','PHARMACIST','RECEPTIONIST','MEDICAL_CASHIER') AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
