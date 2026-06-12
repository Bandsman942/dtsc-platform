CREATE TABLE "HealthPatient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legacyRecordId" TEXT,
    "patientNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "phonePrimary" TEXT NOT NULL,
    "phoneSecondary" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "emergencyContactName" TEXT NOT NULL,
    "emergencyContactRelationship" TEXT,
    "emergencyContactPhone" TEXT NOT NULL,
    "emergencyContactAddress" TEXT,
    "profession" TEXT,
    "maritalStatus" TEXT,
    "bloodGroup" TEXT,
    "knownAllergies" TEXT,
    "importantHistory" TEXT,
    "chronicTreatments" TEXT,
    "medicalNotes" TEXT,
    "administrativeNotes" TEXT,
    "insuranceKnown" BOOLEAN NOT NULL DEFAULT false,
    "insuranceReference" TEXT,
    "registrationSource" TEXT NOT NULL DEFAULT 'RECEPTION',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "deceasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthPatient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthPatientEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadataJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthPatientEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthPatient_organizationId_patientNumber_key" ON "HealthPatient"("organizationId", "patientNumber");
CREATE UNIQUE INDEX "HealthPatient_organizationId_legacyRecordId_key" ON "HealthPatient"("organizationId", "legacyRecordId");
CREATE INDEX "HealthPatient_organizationId_fullName_idx" ON "HealthPatient"("organizationId", "fullName");
CREATE INDEX "HealthPatient_organizationId_phonePrimary_idx" ON "HealthPatient"("organizationId", "phonePrimary");
CREATE INDEX "HealthPatient_organizationId_status_createdAt_idx" ON "HealthPatient"("organizationId", "status", "createdAt");
CREATE INDEX "HealthPatient_createdById_createdAt_idx" ON "HealthPatient"("createdById", "createdAt");
CREATE INDEX "HealthPatientEvent_organizationId_patientId_createdAt_idx" ON "HealthPatientEvent"("organizationId", "patientId", "createdAt");
CREATE INDEX "HealthPatientEvent_actorUserId_createdAt_idx" ON "HealthPatientEvent"("actorUserId", "createdAt");

ALTER TABLE "HealthPatient" ADD CONSTRAINT "HealthPatient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPatient" ADD CONSTRAINT "HealthPatient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPatient" ADD CONSTRAINT "HealthPatient_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthPatientEvent" ADD CONSTRAINT "HealthPatientEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPatientEvent" ADD CONSTRAINT "HealthPatientEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPatientEvent" ADD CONSTRAINT "HealthPatientEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing generic patients and keep their legacy identifiers for current linked modules.
INSERT INTO "HealthPatient" (
  "id", "organizationId", "legacyRecordId", "patientNumber", "fullName", "sex", "birthDate",
  "phonePrimary", "email", "address", "emergencyContactName", "emergencyContactPhone",
  "profession", "maritalStatus", "bloodGroup", "knownAllergies", "importantHistory",
  "administrativeNotes", "registrationSource", "status", "createdById", "updatedById",
  "archivedAt", "deceasedAt", "createdAt", "updatedAt"
)
SELECT
  CONCAT('hp-', r."id"), r."organizationId", r."id",
  CASE
    WHEN NULLIF(r."payloadJson"->>'patientCode', '') IS NOT NULL
      AND COUNT(*) OVER (PARTITION BY r."organizationId", r."payloadJson"->>'patientCode') = 1
      THEN r."payloadJson"->>'patientCode'
    ELSE CONCAT('PAT-MIG-', r."id")
  END,
  COALESCE(NULLIF(r."payloadJson"->>'patientName', ''), r."title"),
  COALESCE(NULLIF(r."payloadJson"->>'sex', ''), 'NOT_SPECIFIED'),
  CASE WHEN COALESCE(r."payloadJson"->>'birthDateOrAge', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (r."payloadJson"->>'birthDateOrAge')::timestamp ELSE NULL END,
  COALESCE(NULLIF(r."payloadJson"->>'contactPhone', ''), 'Non renseigné'),
  NULLIF(r."payloadJson"->>'email', ''),
  COALESCE(NULLIF(r."payloadJson"->>'address', ''), 'Non renseignée'),
  COALESCE(NULLIF(r."payloadJson"->>'emergencyContact', ''), 'Non renseigné'),
  COALESCE(NULLIF(r."payloadJson"->>'emergencyPhone', ''), 'Non renseigné'),
  NULLIF(r."payloadJson"->>'profession', ''),
  NULLIF(r."payloadJson"->>'maritalStatus', ''),
  NULLIF(r."payloadJson"->>'bloodGroup', ''),
  NULLIF(r."payloadJson"->>'allergies', ''),
  NULLIF(r."payloadJson"->>'medicalHistory', ''),
  COALESCE(NULLIF(r."payloadJson"->>'notes', ''), r."summary"),
  'OTHER',
  CASE WHEN r."status" IN ('ACTIVE','INACTIVE','ARCHIVED','DECEASED') THEN r."status" ELSE 'ACTIVE' END,
  r."createdById", r."updatedById", r."deletedAt",
  CASE WHEN r."status" = 'DECEASED' THEN r."updatedAt" ELSE NULL END,
  r."createdAt", r."updatedAt"
FROM "EnterpriseSectorRecord" r
WHERE r."sectorCode" = 'HEALTH_CARE' AND r."moduleCode" = 'PATIENTS'
ON CONFLICT ("organizationId", "legacyRecordId") DO NOTHING;

-- Sensitive values are preserved in HealthPatient above, then removed from the compatibility mirror.
UPDATE "EnterpriseSectorRecord"
SET
  "summary" = NULL,
  "payloadJson" = COALESCE("payloadJson", '{}'::jsonb) - 'bloodGroup' - 'allergies' - 'medicalHistory' - 'notes',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "sectorCode" = 'HEALTH_CARE' AND "moduleCode" = 'PATIENTS';

-- Recommended permissions by official healthcare position.
UPDATE "EnterprisePosition"
SET "permissionsJson" = (
  SELECT jsonb_agg(DISTINCT permission)
  FROM jsonb_array_elements(
    COALESCE("permissionsJson", '[]'::jsonb) ||
    CASE "positionCode"
      WHEN 'MEDICAL_DIRECTOR' THEN '["health.patients.view","health.patients.create","health.patients.update","health.patients.archive","health.patients.view_sensitive"]'::jsonb
      WHEN 'DOCTOR' THEN '["health.patients.view","health.patients.update","health.patients.view_sensitive"]'::jsonb
      WHEN 'NURSE' THEN '["health.patients.view","health.patients.view_sensitive"]'::jsonb
      WHEN 'RECEPTIONIST' THEN '["health.patients.view","health.patients.create","health.patients.update"]'::jsonb
      WHEN 'MEDICAL_CASHIER' THEN '["health.patients.view"]'::jsonb
      WHEN 'LAB_TECHNICIAN' THEN '["health.patients.view"]'::jsonb
      ELSE '[]'::jsonb
    END
  ) AS permission
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IN (SELECT "id" FROM "Organization" WHERE "sectorCode" = 'HEALTH_CARE')
  AND "positionCode" IN ('MEDICAL_DIRECTOR','DOCTOR','NURSE','RECEPTIONIST','MEDICAL_CASHIER','LAB_TECHNICIAN');
