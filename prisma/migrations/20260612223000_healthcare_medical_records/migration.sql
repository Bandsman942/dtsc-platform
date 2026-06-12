-- Dossiers médicaux dédiés : migration additive et non destructive.
CREATE TABLE "HealthMedicalRecord" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "legacyRecordId" TEXT, "patientId" TEXT NOT NULL,
  "recordNumber" TEXT NOT NULL, "summary" TEXT, "activeProblems" TEXT, "riskFactors" TEXT,
  "importantHistorySummary" TEXT, "mainAllergiesSummary" TEXT, "chronicTreatmentsSummary" TEXT,
  "generalRecommendations" TEXT, "followUpNotes" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'MEDICAL_STANDARD', "createdById" TEXT NOT NULL,
  "updatedById" TEXT, "archivedById" TEXT, "archivedAt" TIMESTAMP(3), "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthMedicalRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthMedicalHistoryItem" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "medicalRecordId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "category" TEXT NOT NULL, "label" TEXT NOT NULL, "description" TEXT, "occurredAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthMedicalHistoryItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthAllergy" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "medicalRecordId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "allergen" TEXT NOT NULL, "allergyType" TEXT NOT NULL, "reaction" TEXT, "severity" TEXT NOT NULL DEFAULT 'MODERATE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthAllergy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthCurrentTreatment" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "medicalRecordId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "medicationName" TEXT NOT NULL, "dosage" TEXT, "frequency" TEXT, "route" TEXT, "indication" TEXT,
  "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthCurrentTreatment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthMedicalAlert" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "medicalRecordId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "alertType" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "severity" TEXT NOT NULL DEFAULT 'HIGH',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL, "resolvedById" TEXT, "resolvedAt" TIMESTAMP(3),
  "resolutionNotes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthMedicalAlert_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthConfidentialNote" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "medicalRecordId" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "content" TEXT NOT NULL, "visibility" TEXT NOT NULL DEFAULT 'MEDICAL_TEAM', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthConfidentialNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthMedicalRecordEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "medicalRecordId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "metadataJson" JSONB, "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HealthMedicalRecordEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthMedicalRecord_patientId_key" ON "HealthMedicalRecord"("patientId");
CREATE UNIQUE INDEX "HealthMedicalRecord_organizationId_recordNumber_key" ON "HealthMedicalRecord"("organizationId","recordNumber");
CREATE UNIQUE INDEX "HealthMedicalRecord_organizationId_legacyRecordId_key" ON "HealthMedicalRecord"("organizationId","legacyRecordId");
CREATE UNIQUE INDEX "HealthMedicalRecord_organizationId_patientId_key" ON "HealthMedicalRecord"("organizationId","patientId");
CREATE UNIQUE INDEX "HealthMedicalRecord_organizationId_id_key" ON "HealthMedicalRecord"("organizationId","id");
CREATE INDEX "HealthMedicalRecord_organizationId_status_updatedAt_idx" ON "HealthMedicalRecord"("organizationId","status","updatedAt");
CREATE INDEX "HealthMedicalHistoryItem_organizationId_patientId_createdAt_idx" ON "HealthMedicalHistoryItem"("organizationId","patientId","createdAt");
CREATE INDEX "HealthMedicalHistoryItem_organizationId_medicalRecordId_status_idx" ON "HealthMedicalHistoryItem"("organizationId","medicalRecordId","status");
CREATE INDEX "HealthAllergy_organizationId_patientId_severity_idx" ON "HealthAllergy"("organizationId","patientId","severity");
CREATE INDEX "HealthAllergy_organizationId_medicalRecordId_status_idx" ON "HealthAllergy"("organizationId","medicalRecordId","status");
CREATE INDEX "HealthCurrentTreatment_organizationId_patientId_status_idx" ON "HealthCurrentTreatment"("organizationId","patientId","status");
CREATE INDEX "HealthCurrentTreatment_organizationId_medicalRecordId_createdAt_idx" ON "HealthCurrentTreatment"("organizationId","medicalRecordId","createdAt");
CREATE INDEX "HealthMedicalAlert_organizationId_patientId_status_severity_idx" ON "HealthMedicalAlert"("organizationId","patientId","status","severity");
CREATE INDEX "HealthMedicalAlert_organizationId_medicalRecordId_createdAt_idx" ON "HealthMedicalAlert"("organizationId","medicalRecordId","createdAt");
CREATE INDEX "HealthConfidentialNote_organizationId_patientId_createdAt_idx" ON "HealthConfidentialNote"("organizationId","patientId","createdAt");
CREATE INDEX "HealthConfidentialNote_organizationId_medicalRecordId_visibility_idx" ON "HealthConfidentialNote"("organizationId","medicalRecordId","visibility");
CREATE INDEX "HealthMedicalRecordEvent_organizationId_medicalRecordId_createdAt_idx" ON "HealthMedicalRecordEvent"("organizationId","medicalRecordId","createdAt");
CREATE INDEX "HealthMedicalRecordEvent_actorUserId_createdAt_idx" ON "HealthMedicalRecordEvent"("actorUserId","createdAt");

ALTER TABLE "HealthMedicalRecord" ADD CONSTRAINT "HealthMedicalRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecord" ADD CONSTRAINT "HealthMedicalRecord_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecord" ADD CONSTRAINT "HealthMedicalRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecord" ADD CONSTRAINT "HealthMedicalRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecord" ADD CONSTRAINT "HealthMedicalRecord_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalHistoryItem" ADD CONSTRAINT "HealthMedicalHistoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalHistoryItem" ADD CONSTRAINT "HealthMedicalHistoryItem_organizationId_medicalRecordId_fkey" FOREIGN KEY ("organizationId","medicalRecordId") REFERENCES "HealthMedicalRecord"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalHistoryItem" ADD CONSTRAINT "HealthMedicalHistoryItem_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalHistoryItem" ADD CONSTRAINT "HealthMedicalHistoryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthAllergy" ADD CONSTRAINT "HealthAllergy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAllergy" ADD CONSTRAINT "HealthAllergy_organizationId_medicalRecordId_fkey" FOREIGN KEY ("organizationId","medicalRecordId") REFERENCES "HealthMedicalRecord"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAllergy" ADD CONSTRAINT "HealthAllergy_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthAllergy" ADD CONSTRAINT "HealthAllergy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthCurrentTreatment" ADD CONSTRAINT "HealthCurrentTreatment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCurrentTreatment" ADD CONSTRAINT "HealthCurrentTreatment_organizationId_medicalRecordId_fkey" FOREIGN KEY ("organizationId","medicalRecordId") REFERENCES "HealthMedicalRecord"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCurrentTreatment" ADD CONSTRAINT "HealthCurrentTreatment_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthCurrentTreatment" ADD CONSTRAINT "HealthCurrentTreatment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalAlert" ADD CONSTRAINT "HealthMedicalAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalAlert" ADD CONSTRAINT "HealthMedicalAlert_organizationId_medicalRecordId_fkey" FOREIGN KEY ("organizationId","medicalRecordId") REFERENCES "HealthMedicalRecord"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalAlert" ADD CONSTRAINT "HealthMedicalAlert_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalAlert" ADD CONSTRAINT "HealthMedicalAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalAlert" ADD CONSTRAINT "HealthMedicalAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthConfidentialNote" ADD CONSTRAINT "HealthConfidentialNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthConfidentialNote" ADD CONSTRAINT "HealthConfidentialNote_organizationId_medicalRecordId_fkey" FOREIGN KEY ("organizationId","medicalRecordId") REFERENCES "HealthMedicalRecord"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthConfidentialNote" ADD CONSTRAINT "HealthConfidentialNote_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthConfidentialNote" ADD CONSTRAINT "HealthConfidentialNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecordEvent" ADD CONSTRAINT "HealthMedicalRecordEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecordEvent" ADD CONSTRAINT "HealthMedicalRecordEvent_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "HealthMedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthMedicalRecordEvent" ADD CONSTRAINT "HealthMedicalRecordEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise du premier dossier générique valide de chaque patient, sans supprimer les anciennes données.
INSERT INTO "HealthMedicalRecord" ("id","organizationId","legacyRecordId","patientId","recordNumber","summary","importantHistorySummary","mainAllergiesSummary","chronicTreatmentsSummary","confidentialityLevel","status","createdById","updatedById","createdAt","updatedAt")
SELECT CONCAT('hmr-',r."id"),r."organizationId",r."id",p."id",CONCAT('DM-MIG-',r."id"),r."summary",
  NULLIF(r."payloadJson"->>'medicalHistory',''),NULLIF(r."payloadJson"->>'allergies',''),NULLIF(r."payloadJson"->>'treatmentPlan',''),
  COALESCE(NULLIF(r."payloadJson"->>'confidentialityLevel',''),'MEDICAL_STANDARD'),
  CASE WHEN r."status"='ARCHIVED' THEN 'ARCHIVED' ELSE 'ACTIVE' END,r."createdById",r."updatedById",r."createdAt",r."updatedAt"
FROM "EnterpriseSectorRecord" r
JOIN "HealthPatient" p ON p."organizationId"=r."organizationId" AND p."legacyRecordId"=r."payloadJson"->>'patientRecordId'
WHERE r."sectorCode"='HEALTH_CARE' AND r."moduleCode"='MEDICAL_RECORDS'
  AND r."id"=(SELECT first_record."id" FROM "EnterpriseSectorRecord" first_record WHERE first_record."organizationId"=r."organizationId" AND first_record."moduleCode"='MEDICAL_RECORDS' AND first_record."payloadJson"->>'patientRecordId'=r."payloadJson"->>'patientRecordId' ORDER BY first_record."createdAt",first_record."id" LIMIT 1)
ON CONFLICT ("organizationId","patientId") DO NOTHING;

UPDATE "EnterprisePosition" SET "permissionsJson"=(SELECT jsonb_agg(DISTINCT permission) FROM jsonb_array_elements(COALESCE("permissionsJson",'[]'::jsonb)||CASE "positionCode"
  WHEN 'MEDICAL_DIRECTOR' THEN '["health.medical_records.view","health.medical_records.view_sensitive","health.medical_records.create","health.medical_records.update","health.medical_records.archive","health.medical_records.confidential_notes"]'::jsonb
  WHEN 'DOCTOR' THEN '["health.medical_records.view","health.medical_records.view_sensitive","health.medical_records.create","health.medical_records.update","health.medical_records.confidential_notes"]'::jsonb
  WHEN 'NURSE' THEN '["health.medical_records.view","health.medical_records.view_sensitive","health.medical_records.update"]'::jsonb
  ELSE '["health.medical_records.view"]'::jsonb END) AS permission),"updatedAt"=CURRENT_TIMESTAMP
WHERE "organizationId" IN (SELECT "id" FROM "Organization" WHERE "sectorCode"='HEALTH_CARE') AND "positionCode" IN ('MEDICAL_DIRECTOR','DOCTOR','NURSE','RECEPTIONIST','MEDICAL_CASHIER','LAB_TECHNICIAN');
