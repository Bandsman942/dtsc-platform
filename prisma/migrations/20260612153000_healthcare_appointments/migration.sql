CREATE TABLE "HealthAppointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legacyRecordId" TEXT,
    "patientId" TEXT NOT NULL,
    "appointmentNumber" TEXT NOT NULL,
    "professionalId" TEXT,
    "departmentId" TEXT,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "estimatedDurationMinutes" INTEGER,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "appointmentType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "administrativeNotes" TEXT,
    "internalNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "markedAbsentAt" TIMESTAMP(3),
    "convertedConsultationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthAppointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthAppointmentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadataJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthAppointmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthAppointment_convertedConsultationId_key" ON "HealthAppointment"("convertedConsultationId");
CREATE UNIQUE INDEX "HealthAppointment_organizationId_appointmentNumber_key" ON "HealthAppointment"("organizationId", "appointmentNumber");
CREATE UNIQUE INDEX "HealthAppointment_organizationId_legacyRecordId_key" ON "HealthAppointment"("organizationId", "legacyRecordId");
CREATE UNIQUE INDEX "HealthPatient_organizationId_id_key" ON "HealthPatient"("organizationId", "id");
CREATE INDEX "HealthAppointment_organizationId_patientId_appointmentDate_idx" ON "HealthAppointment"("organizationId", "patientId", "appointmentDate");
CREATE INDEX "HealthAppointment_organizationId_professionalId_appointmentDate_idx" ON "HealthAppointment"("organizationId", "professionalId", "appointmentDate");
CREATE INDEX "HealthAppointment_organizationId_departmentId_appointmentDate_idx" ON "HealthAppointment"("organizationId", "departmentId", "appointmentDate");
CREATE INDEX "HealthAppointment_organizationId_status_priority_appointmentDate_idx" ON "HealthAppointment"("organizationId", "status", "priority", "appointmentDate");
CREATE INDEX "HealthAppointment_createdById_createdAt_idx" ON "HealthAppointment"("createdById", "createdAt");
CREATE INDEX "HealthAppointmentEvent_organizationId_appointmentId_createdAt_idx" ON "HealthAppointmentEvent"("organizationId", "appointmentId", "createdAt");
CREATE INDEX "HealthAppointmentEvent_actorUserId_createdAt_idx" ON "HealthAppointmentEvent"("actorUserId", "createdAt");

ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_organizationId_patientId_fkey" FOREIGN KEY ("organizationId", "patientId") REFERENCES "HealthPatient"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "EnterpriseDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthAppointment" ADD CONSTRAINT "HealthAppointment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthAppointmentEvent" ADD CONSTRAINT "HealthAppointmentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAppointmentEvent" ADD CONSTRAINT "HealthAppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "HealthAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAppointmentEvent" ADD CONSTRAINT "HealthAppointmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise non destructive des rendez-vous génériques qui référencent un patient dédié valide.
INSERT INTO "HealthAppointment" (
  "id", "organizationId", "legacyRecordId", "patientId", "appointmentNumber", "professionalId",
  "departmentId", "appointmentDate", "estimatedDurationMinutes", "reason", "description",
  "appointmentType", "priority", "status", "administrativeNotes", "internalNotes",
  "createdById", "updatedById", "confirmedAt", "cancelledAt", "cancelledById",
  "markedAbsentAt", "createdAt", "updatedAt"
)
SELECT
  CONCAT('ha-', r."id"), r."organizationId", r."id", p."id", CONCAT('RDV-MIG-', r."id"),
  r."assignedToUserId",
  CASE WHEN d."id" IS NOT NULL THEN d."id" ELSE NULL END,
  CASE
    WHEN COALESCE(r."payloadJson"->>'appointmentDate', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
      THEN (r."payloadJson"->>'appointmentDate')::timestamp
    ELSE r."createdAt"
  END,
  30,
  COALESCE(NULLIF(r."payloadJson"->>'service', ''), r."title"),
  r."summary",
  COALESCE(NULLIF(r."payloadJson"->>'appointmentType', ''), 'OTHER'),
  CASE WHEN r."priority" IN ('LOW','NORMAL','HIGH','URGENT') THEN r."priority" ELSE 'NORMAL' END,
  CASE WHEN r."status" IN ('SCHEDULED','CONFIRMED','WAITING','IN_PROGRESS','DONE','CANCELLED','NO_SHOW','CONVERTED') THEN r."status" ELSE 'SCHEDULED' END,
  r."summary", NULL, r."createdById", r."updatedById",
  CASE WHEN r."status" = 'CONFIRMED' THEN r."updatedAt" ELSE NULL END,
  CASE WHEN r."status" = 'CANCELLED' THEN r."updatedAt" ELSE NULL END,
  CASE WHEN r."status" = 'CANCELLED' THEN r."updatedById" ELSE NULL END,
  CASE WHEN r."status" = 'NO_SHOW' THEN r."updatedAt" ELSE NULL END,
  r."createdAt", r."updatedAt"
FROM "EnterpriseSectorRecord" r
JOIN "HealthPatient" p ON p."organizationId" = r."organizationId" AND p."legacyRecordId" = r."payloadJson"->>'patientRecordId'
LEFT JOIN "EnterpriseDepartment" d ON d."organizationId" = r."organizationId" AND d."id" = r."payloadJson"->>'departmentId'
WHERE r."sectorCode" = 'HEALTH_CARE' AND r."moduleCode" = 'APPOINTMENTS'
ON CONFLICT ("organizationId", "legacyRecordId") DO NOTHING;

-- Preserve existing conversions and prevent a historical appointment from creating another consultation.
UPDATE "HealthAppointment" a
SET "convertedConsultationId" = (
  SELECT c."id"
  FROM "EnterpriseSectorRecord" c
  WHERE c."organizationId" = a."organizationId"
    AND c."sectorCode" = 'HEALTH_CARE'
    AND c."moduleCode" = 'CONSULTATIONS'
    AND c."payloadJson"->>'appointmentRecordId' = a."legacyRecordId"
  ORDER BY c."createdAt" ASC
  LIMIT 1
)
WHERE a."status" = 'CONVERTED' AND a."convertedConsultationId" IS NULL;

UPDATE "EnterprisePosition"
SET "permissionsJson" = (
  SELECT jsonb_agg(DISTINCT permission)
  FROM jsonb_array_elements(
    COALESCE("permissionsJson", '[]'::jsonb) ||
    CASE "positionCode"
      WHEN 'MEDICAL_DIRECTOR' THEN '["health.appointments.view","health.appointments.create","health.appointments.update","health.appointments.confirm","health.appointments.cancel","health.appointments.mark_absent","health.appointments.mark_in_progress","health.appointments.complete","health.appointments.convert_to_consultation","health.appointments.view_sensitive"]'::jsonb
      WHEN 'DOCTOR' THEN '["health.appointments.view","health.appointments.update","health.appointments.mark_in_progress","health.appointments.complete","health.appointments.convert_to_consultation","health.appointments.view_sensitive"]'::jsonb
      WHEN 'NURSE' THEN '["health.appointments.view","health.appointments.mark_in_progress","health.appointments.view_sensitive"]'::jsonb
      WHEN 'RECEPTIONIST' THEN '["health.appointments.view","health.appointments.create","health.appointments.update","health.appointments.confirm","health.appointments.cancel","health.appointments.mark_absent"]'::jsonb
      ELSE '["health.appointments.view"]'::jsonb
    END
  ) AS permission
),
"updatedAt" = CURRENT_TIMESTAMP
WHERE "organizationId" IN (SELECT "id" FROM "Organization" WHERE "sectorCode" = 'HEALTH_CARE')
  AND "positionCode" IN ('MEDICAL_DIRECTOR','DOCTOR','NURSE','RECEPTIONIST','MEDICAL_CASHIER','LAB_TECHNICIAN');
