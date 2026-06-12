CREATE UNIQUE INDEX "HealthAppointment_organizationId_id_key" ON "HealthAppointment"("organizationId", "id");

CREATE TABLE "HealthConsultation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legacyRecordId" TEXT,
    "consultationNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "professionalId" TEXT NOT NULL,
    "departmentId" TEXT,
    "consultationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consultationType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "chiefComplaint" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "historyOfPresentIllness" TEXT,
    "symptoms" TEXT,
    "symptomDuration" TEXT,
    "aggravatingFactors" TEXT,
    "relievingFactors" TEXT,
    "relevantHistory" TEXT,
    "temperature" DOUBLE PRECISION,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "capillaryGlucose" DOUBLE PRECISION,
    "painScore" INTEGER,
    "vitalsNotes" TEXT,
    "generalCondition" TEXT,
    "cardiovascularExam" TEXT,
    "respiratoryExam" TEXT,
    "abdominalExam" TEXT,
    "neurologicalExam" TEXT,
    "entExam" TEXT,
    "dermatologicalExam" TEXT,
    "musculoskeletalExam" TEXT,
    "otherExamNotes" TEXT,
    "clinicalConclusion" TEXT,
    "provisionalDiagnosis" TEXT,
    "finalDiagnosis" TEXT,
    "differentialDiagnoses" TEXT,
    "diagnosisCertainty" TEXT,
    "diagnosisCode" TEXT,
    "diagnosisNotes" TEXT,
    "managementPlan" TEXT,
    "treatmentPlan" TEXT,
    "prescriptionText" TEXT,
    "requestedTests" TEXT,
    "referralNotes" TEXT,
    "hospitalizationRecommended" BOOLEAN NOT NULL DEFAULT false,
    "sickLeaveRecommended" BOOLEAN NOT NULL DEFAULT false,
    "followUpRecommended" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "patientAdvice" TEXT,
    "warningSigns" TEXT,
    "lifestyleRecommendations" TEXT,
    "returnInstructions" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthConsultation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthConsultationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadataJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthConsultationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthConsultation_appointmentId_key" ON "HealthConsultation"("appointmentId");
CREATE UNIQUE INDEX "HealthConsultation_organizationId_consultationNumber_key" ON "HealthConsultation"("organizationId", "consultationNumber");
CREATE UNIQUE INDEX "HealthConsultation_organizationId_legacyRecordId_key" ON "HealthConsultation"("organizationId", "legacyRecordId");
CREATE UNIQUE INDEX "HealthConsultation_organizationId_appointmentId_key" ON "HealthConsultation"("organizationId", "appointmentId");
CREATE INDEX "HealthConsultation_organizationId_patientId_consultationDate_idx" ON "HealthConsultation"("organizationId", "patientId", "consultationDate");
CREATE INDEX "HealthConsultation_organizationId_professionalId_consultationDate_idx" ON "HealthConsultation"("organizationId", "professionalId", "consultationDate");
CREATE INDEX "HealthConsultation_organizationId_appointmentId_idx" ON "HealthConsultation"("organizationId", "appointmentId");
CREATE INDEX "HealthConsultation_organizationId_status_priority_consultationDate_idx" ON "HealthConsultation"("organizationId", "status", "priority", "consultationDate");
CREATE INDEX "HealthConsultation_createdById_createdAt_idx" ON "HealthConsultation"("createdById", "createdAt");
CREATE INDEX "HealthConsultationEvent_organizationId_consultationId_createdAt_idx" ON "HealthConsultationEvent"("organizationId", "consultationId", "createdAt");
CREATE INDEX "HealthConsultationEvent_actorUserId_createdAt_idx" ON "HealthConsultationEvent"("actorUserId", "createdAt");

ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_organizationId_patientId_fkey" FOREIGN KEY ("organizationId", "patientId") REFERENCES "HealthPatient"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_organizationId_appointmentId_fkey" FOREIGN KEY ("organizationId", "appointmentId") REFERENCES "HealthAppointment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "EnterpriseDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthConsultation" ADD CONSTRAINT "HealthConsultation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthConsultationEvent" ADD CONSTRAINT "HealthConsultationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthConsultationEvent" ADD CONSTRAINT "HealthConsultationEvent_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "HealthConsultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthConsultationEvent" ADD CONSTRAINT "HealthConsultationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise non destructive des consultations génériques liées à un patient et à un professionnel valides.
INSERT INTO "HealthConsultation" (
  "id", "organizationId", "legacyRecordId", "consultationNumber", "patientId", "appointmentId",
  "professionalId", "departmentId", "consultationDate", "consultationType", "priority", "status",
  "chiefComplaint", "reason", "symptoms", "generalCondition", "clinicalConclusion",
  "provisionalDiagnosis", "finalDiagnosis", "treatmentPlan", "prescriptionText", "requestedTests",
  "patientAdvice", "createdById", "updatedById", "closedById", "closedAt", "createdAt", "updatedAt"
)
SELECT
  CONCAT('hc-', r."id"), r."organizationId", r."id", CONCAT('CNS-MIG-', r."id"), p."id",
  CASE
    WHEN a."id" IS NOT NULL AND r."id" = (
      SELECT first_consultation."id"
      FROM "EnterpriseSectorRecord" first_consultation
      WHERE first_consultation."organizationId" = r."organizationId"
        AND first_consultation."sectorCode" = 'HEALTH_CARE'
        AND first_consultation."moduleCode" = 'CONSULTATIONS'
        AND first_consultation."payloadJson"->>'appointmentRecordId' = r."payloadJson"->>'appointmentRecordId'
      ORDER BY first_consultation."createdAt" ASC, first_consultation."id" ASC
      LIMIT 1
    ) THEN a."id"
    ELSE NULL
  END,
  r."assignedToUserId",
  CASE WHEN d."id" IS NOT NULL THEN d."id" ELSE NULL END,
  COALESCE(a."appointmentDate", r."createdAt"),
  COALESCE(NULLIF(r."payloadJson"->>'appointmentType', ''), 'GENERAL'),
  CASE WHEN r."priority" IN ('LOW','NORMAL','HIGH','URGENT') THEN r."priority" ELSE 'NORMAL' END,
  CASE WHEN r."status" IN ('DRAFT','IN_PROGRESS','PENDING_EXAMS','REVIEW','CLOSED','CANCELLED') THEN r."status" ELSE 'DRAFT' END,
  COALESCE(NULLIF(r."summary", ''), r."title"),
  COALESCE(NULLIF(r."payloadJson"->>'service', ''), NULLIF(r."summary", ''), r."title"),
  NULLIF(r."payloadJson"->>'symptoms', ''),
  NULLIF(r."payloadJson"->>'clinicalExam', ''),
  NULLIF(r."payloadJson"->>'clinicalExam', ''),
  NULLIF(r."payloadJson"->>'provisionalDiagnosis', ''),
  NULLIF(r."payloadJson"->>'finalDiagnosis', ''),
  NULLIF(r."payloadJson"->>'treatmentPlan', ''),
  NULLIF(r."payloadJson"->>'prescription', ''),
  NULLIF(r."payloadJson"->>'requestedExams', ''),
  NULLIF(r."payloadJson"->>'recommendations', ''),
  r."createdById", r."updatedById",
  CASE WHEN r."status" = 'CLOSED' THEN COALESCE(r."updatedById", r."createdById") ELSE NULL END,
  CASE WHEN r."status" = 'CLOSED' THEN r."updatedAt" ELSE NULL END,
  r."createdAt", r."updatedAt"
FROM "EnterpriseSectorRecord" r
JOIN "HealthPatient" p ON p."organizationId" = r."organizationId" AND p."legacyRecordId" = r."payloadJson"->>'patientRecordId'
JOIN "OrganizationMember" m ON m."organizationId" = r."organizationId" AND m."userId" = r."assignedToUserId" AND m."status" = 'ACTIVE' AND m."removedAt" IS NULL
LEFT JOIN "HealthAppointment" a ON a."organizationId" = r."organizationId" AND a."legacyRecordId" = r."payloadJson"->>'appointmentRecordId'
LEFT JOIN "EnterpriseDepartment" d ON d."organizationId" = r."organizationId" AND d."id" = r."payloadJson"->>'departmentId'
WHERE r."sectorCode" = 'HEALTH_CARE' AND r."moduleCode" = 'CONSULTATIONS'
ON CONFLICT ("organizationId", "legacyRecordId") DO NOTHING;

UPDATE "HealthAppointment" a
SET "convertedConsultationId" = c."id"
FROM "HealthConsultation" c
WHERE c."appointmentId" = a."id";

UPDATE "EnterprisePosition"
SET "permissionsJson" = (
  SELECT jsonb_agg(DISTINCT permission)
  FROM jsonb_array_elements(
    COALESCE("permissionsJson", '[]'::jsonb) ||
    CASE "positionCode"
      WHEN 'MEDICAL_DIRECTOR' THEN '["health.consultations.view","health.consultations.view_sensitive","health.consultations.create","health.consultations.update","health.consultations.close","health.consultations.reopen","health.consultations.cancel","health.consultations.create_from_appointment"]'::jsonb
      WHEN 'DOCTOR' THEN '["health.consultations.view","health.consultations.view_sensitive","health.consultations.create","health.consultations.update","health.consultations.close","health.consultations.create_from_appointment"]'::jsonb
      WHEN 'NURSE' THEN '["health.consultations.view","health.consultations.view_sensitive","health.consultations.update"]'::jsonb
      WHEN 'RECEPTIONIST' THEN '["health.consultations.view","health.consultations.create"]'::jsonb
      ELSE '["health.consultations.view"]'::jsonb
    END
  ) AS permission
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IN (SELECT "id" FROM "Organization" WHERE "sectorCode" = 'HEALTH_CARE')
  AND "positionCode" IN ('MEDICAL_DIRECTOR','DOCTOR','NURSE','RECEPTIONIST','MEDICAL_CASHIER','LAB_TECHNICIAN');
