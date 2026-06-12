CREATE UNIQUE INDEX "HealthConsultation_organizationId_id_key" ON "HealthConsultation"("organizationId","id");

CREATE TABLE "HealthLabTestCatalog" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "labelFr" TEXT NOT NULL, "labelEn" TEXT,
  "category" TEXT NOT NULL, "sampleType" TEXT NOT NULL, "defaultUnit" TEXT, "referenceRange" TEXT, "description" TEXT,
  "isGlobal" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthLabTestCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthLabRequest" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "legacyRecordId" TEXT, "labRequestNumber" TEXT NOT NULL,
  "patientId" TEXT NOT NULL, "consultationId" TEXT, "medicalRecordId" TEXT, "requestedById" TEXT NOT NULL, "assignedLabStaffId" TEXT,
  "mainTestId" TEXT, "testLabel" TEXT NOT NULL, "clinicalIndication" TEXT, "medicalNotes" TEXT, "sampleType" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'ROUTINE', "status" TEXT NOT NULL DEFAULT 'REQUESTED', "confidentialityLevel" TEXT NOT NULL DEFAULT 'MEDICAL_STANDARD',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expectedSampleAt" TIMESTAMP(3), "sampledAt" TIMESTAMP(3), "sampledById" TEXT,
  "sampleQuality" TEXT, "sampleNotes" TEXT, "resultText" TEXT, "resultValuesJson" JSONB, "resultUnit" TEXT, "referenceRange" TEXT,
  "resultInterpretation" TEXT, "abnormalityLevel" TEXT, "resultFileUrl" TEXT, "resultEnteredById" TEXT, "resultEnteredAt" TIMESTAMP(3),
  "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "transmittedToDoctorAt" TIMESTAMP(3), "cancelledById" TEXT, "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT, "correctionReason" TEXT, "internalNotes" TEXT, "laboratoryNotes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthLabRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthLabRequestItem" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "labRequestId" TEXT NOT NULL, "testCatalogId" TEXT, "testLabel" TEXT NOT NULL,
  "sampleType" TEXT, "status" TEXT NOT NULL DEFAULT 'REQUESTED', "resultText" TEXT, "resultValuesJson" JSONB, "unit" TEXT,
  "referenceRange" TEXT, "interpretation" TEXT, "abnormalityLevel" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "HealthLabRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthLabEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "labRequestId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "summary" TEXT NOT NULL,
  "fromStatus" TEXT, "toStatus" TEXT, "metadataJson" JSONB, "actorUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthLabEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthLabTestCatalog_organizationId_code_key" ON "HealthLabTestCatalog"("organizationId","code");
CREATE UNIQUE INDEX "HealthLabTestCatalog_organizationId_id_key" ON "HealthLabTestCatalog"("organizationId","id");
CREATE INDEX "HealthLabTestCatalog_organizationId_isActive_category_sortOrder_idx" ON "HealthLabTestCatalog"("organizationId","isActive","category","sortOrder");
CREATE UNIQUE INDEX "HealthLabRequest_organizationId_labRequestNumber_key" ON "HealthLabRequest"("organizationId","labRequestNumber");
CREATE UNIQUE INDEX "HealthLabRequest_organizationId_legacyRecordId_key" ON "HealthLabRequest"("organizationId","legacyRecordId");
CREATE UNIQUE INDEX "HealthLabRequest_organizationId_id_key" ON "HealthLabRequest"("organizationId","id");
CREATE INDEX "HealthLabRequest_organizationId_patientId_requestedAt_idx" ON "HealthLabRequest"("organizationId","patientId","requestedAt");
CREATE INDEX "HealthLabRequest_organizationId_consultationId_idx" ON "HealthLabRequest"("organizationId","consultationId");
CREATE INDEX "HealthLabRequest_organizationId_requestedById_requestedAt_idx" ON "HealthLabRequest"("organizationId","requestedById","requestedAt");
CREATE INDEX "HealthLabRequest_organizationId_status_priority_requestedAt_idx" ON "HealthLabRequest"("organizationId","status","priority","requestedAt");
CREATE INDEX "HealthLabRequest_organizationId_validatedAt_idx" ON "HealthLabRequest"("organizationId","validatedAt");
CREATE INDEX "HealthLabRequestItem_organizationId_labRequestId_status_idx" ON "HealthLabRequestItem"("organizationId","labRequestId","status");
CREATE INDEX "HealthLabRequestItem_organizationId_testCatalogId_idx" ON "HealthLabRequestItem"("organizationId","testCatalogId");
CREATE INDEX "HealthLabEvent_organizationId_labRequestId_createdAt_idx" ON "HealthLabEvent"("organizationId","labRequestId","createdAt");
CREATE INDEX "HealthLabEvent_actorUserId_createdAt_idx" ON "HealthLabEvent"("actorUserId","createdAt");

ALTER TABLE "HealthLabTestCatalog" ADD CONSTRAINT "HealthLabTestCatalog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLabTestCatalog" ADD CONSTRAINT "HealthLabTestCatalog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabTestCatalog" ADD CONSTRAINT "HealthLabTestCatalog_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_organizationId_patientId_fkey" FOREIGN KEY ("organizationId","patientId") REFERENCES "HealthPatient"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_organizationId_consultationId_fkey" FOREIGN KEY ("organizationId","consultationId") REFERENCES "HealthConsultation"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_organizationId_medicalRecordId_fkey" FOREIGN KEY ("organizationId","medicalRecordId") REFERENCES "HealthMedicalRecord"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_assignedLabStaffId_fkey" FOREIGN KEY ("assignedLabStaffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_organizationId_mainTestId_fkey" FOREIGN KEY ("organizationId","mainTestId") REFERENCES "HealthLabTestCatalog"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_sampledById_fkey" FOREIGN KEY ("sampledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_resultEnteredById_fkey" FOREIGN KEY ("resultEnteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequest" ADD CONSTRAINT "HealthLabRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequestItem" ADD CONSTRAINT "HealthLabRequestItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequestItem" ADD CONSTRAINT "HealthLabRequestItem_organizationId_labRequestId_fkey" FOREIGN KEY ("organizationId","labRequestId") REFERENCES "HealthLabRequest"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLabRequestItem" ADD CONSTRAINT "HealthLabRequestItem_organizationId_testCatalogId_fkey" FOREIGN KEY ("organizationId","testCatalogId") REFERENCES "HealthLabTestCatalog"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthLabEvent" ADD CONSTRAINT "HealthLabEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLabEvent" ADD CONSTRAINT "HealthLabEvent_organizationId_labRequestId_fkey" FOREIGN KEY ("organizationId","labRequestId") REFERENCES "HealthLabRequest"("organizationId","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthLabEvent" ADD CONSTRAINT "HealthLabEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "HealthLabTestCatalog" ("id","organizationId","code","labelFr","labelEn","category","sampleType","defaultUnit","referenceRange","description","isGlobal","isActive","sortOrder","updatedAt")
SELECT CONCAT('health-lab-test-',o."id",'-',t.code),o."id",t.code,t.fr,t.en,t.category,t.sample,t.unit,t.reference_range,t.description,true,true,t.sort,CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
('NFS','Numération formule sanguine','Complete blood count','HEMATOLOGY','BLOOD',NULL,NULL,'Analyse des cellules sanguines.',10),
('GLUCOSE','Glycémie','Blood glucose','BIOCHEMISTRY','BLOOD','mg/dL','70-110 mg/dL','Mesure du glucose sanguin.',20),
('CREATININE','Créatinine','Creatinine','BIOCHEMISTRY','BLOOD','mg/dL',NULL,'Évaluation de la fonction rénale.',30),
('UREA','Urée','Urea','BIOCHEMISTRY','BLOOD','mg/dL',NULL,'Évaluation complémentaire de la fonction rénale.',40),
('CRP','Protéine C-réactive','C-reactive protein','BIOCHEMISTRY','BLOOD','mg/L','< 6 mg/L','Marqueur inflammatoire.',50),
('THICK_SMEAR','Goutte épaisse','Thick blood smear','PARASITOLOGY','BLOOD',NULL,NULL,'Recherche du paludisme.',60),
('MALARIA_RDT','Test rapide paludisme','Malaria rapid test','PARASITOLOGY','BLOOD',NULL,NULL,'Dépistage rapide du paludisme.',70),
('URINE_DIPSTICK','Bandelette urinaire','Urine dipstick','URINE','URINE',NULL,NULL,'Analyse rapide des urines.',80),
('URINE_CULTURE','Examen cytobactériologique des urines','Urine culture','MICROBIOLOGY','URINE',NULL,NULL,'Recherche d’infection urinaire.',90),
('STOOL_EXAM','Coprologie','Stool examination','STOOL','STOOL',NULL,NULL,'Analyse parasitologique et digestive.',100),
('HIV_RDT','Test rapide VIH','HIV rapid test','SEROLOGY','BLOOD',NULL,NULL,'Dépistage sérologique VIH.',110),
('HBSAG','Antigène HBs','HBsAg','SEROLOGY','BLOOD',NULL,NULL,'Dépistage de l’hépatite B.',120),
('BLOOD_GROUP','Groupe sanguin','Blood group','HEMATOLOGY','BLOOD',NULL,NULL,'Détermination du groupe sanguin.',130),
('OTHER','Autre examen','Other test','OTHER','OTHER',NULL,NULL,'Examen personnalisé à préciser.',999)
) AS t(code,fr,en,category,sample,unit,reference_range,description,sort)
WHERE o."sectorCode"='HEALTH_CARE'
ON CONFLICT ("organizationId","code") DO NOTHING;

UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb) || '["health.laboratory.view","health.laboratory.view_sensitive","health.laboratory.create_request","health.laboratory.collect_sample","health.laboratory.enter_result","health.laboratory.validate_result","health.laboratory.correct_validated_result","health.laboratory.transmit_result","health.laboratory.manage_catalog"]'::jsonb
WHERE "positionCode" IN ('LAB_MANAGER','MEDICAL_DIRECTOR')
  AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb) || '["health.laboratory.view","health.laboratory.view_sensitive","health.laboratory.collect_sample","health.laboratory.enter_result"]'::jsonb
WHERE "positionCode"='LAB_TECHNICIAN'
  AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb) || '["health.laboratory.view","health.laboratory.view_sensitive","health.laboratory.create_request","health.laboratory.view_result"]'::jsonb
WHERE "positionCode" IN ('DOCTOR','SPECIALIST_DOCTOR')
  AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
UPDATE "EnterprisePosition" SET "permissionsJson"=COALESCE("permissionsJson",'[]'::jsonb) || '["health.laboratory.view","health.laboratory.create_request","health.laboratory.collect_sample"]'::jsonb
WHERE "positionCode" IN ('NURSE','HEAD_NURSE')
  AND "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code"='HEALTH_CARE');
