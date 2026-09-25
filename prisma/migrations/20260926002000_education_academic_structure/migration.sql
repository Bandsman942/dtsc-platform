-- EDU-1: canonical academic structure, multi-campus foundation and Education template v2.
-- Additive only: legacy Education records remain untouched.

CREATE TABLE "EnterpriseEducationInstitutionSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "institutionType" TEXT NOT NULL DEFAULT 'SCHOOL',
  "legalName" TEXT,
  "registrationCode" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Kinshasa',
  "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
  "defaultCampusId" TEXT,
  "settingsJson" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseEducationInstitutionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationCampus" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "address" TEXT,
  "city" TEXT,
  "countryCode" TEXT,
  "timezone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationCampus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationAcademicYear" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "closedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationAcademicYear_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationAcademicPeriod" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "periodType" TEXT NOT NULL DEFAULT 'TERM',
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "closedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationAcademicPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationAcademicLevel" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "levelType" TEXT NOT NULL DEFAULT 'GRADE',
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationAcademicLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationDepartment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campusId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationProgram" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "awardName" TEXT,
  "durationPeriods" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationClassGroup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "programId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationClassGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationSubject" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "creditHours" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationCourseOffering" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "periodId" TEXT,
  "campusId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "classGroupId" TEXT,
  "programId" TEXT,
  "levelId" TEXT,
  "code" TEXT NOT NULL,
  "displayName" TEXT,
  "deliveryMode" TEXT NOT NULL DEFAULT 'IN_PERSON',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationCourseOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationCalendarEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "periodId" TEXT,
  "campusId" TEXT,
  "eventType" TEXT NOT NULL DEFAULT 'ACADEMIC',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseEducationInstitutionSettings_organizationId_key" ON "EnterpriseEducationInstitutionSettings"("organizationId");
CREATE INDEX "EnterpriseEducationInstitutionSettings_organizationId_idx" ON "EnterpriseEducationInstitutionSettings"("organizationId");

CREATE UNIQUE INDEX "EnterpriseEducationCampus_organizationId_id_key" ON "EnterpriseEducationCampus"("organizationId", "id");
CREATE UNIQUE INDEX "EducationCampus_org_code_key" ON "EnterpriseEducationCampus"("organizationId", "code");
CREATE INDEX "EnterpriseEducationCampus_organizationId_status_sortOrder_idx" ON "EnterpriseEducationCampus"("organizationId", "status", "sortOrder");
CREATE INDEX "EnterpriseEducationCampus_archivedAt_idx" ON "EnterpriseEducationCampus"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationAcademicYear_organizationId_id_key" ON "EnterpriseEducationAcademicYear"("organizationId", "id");
CREATE UNIQUE INDEX "EducationAcademicYear_org_code_key" ON "EnterpriseEducationAcademicYear"("organizationId", "code");
CREATE INDEX "EnterpriseEducationAcademicYear_organizationId_status_startDate_idx" ON "EnterpriseEducationAcademicYear"("organizationId", "status", "startDate");
CREATE INDEX "EnterpriseEducationAcademicYear_organizationId_startDate_endDate_idx" ON "EnterpriseEducationAcademicYear"("organizationId", "startDate", "endDate");
CREATE INDEX "EnterpriseEducationAcademicYear_archivedAt_idx" ON "EnterpriseEducationAcademicYear"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationAcademicPeriod_organizationId_id_key" ON "EnterpriseEducationAcademicPeriod"("organizationId", "id");
CREATE UNIQUE INDEX "EducationAcademicPeriod_year_code_key" ON "EnterpriseEducationAcademicPeriod"("organizationId", "academicYearId", "code");
CREATE INDEX "EnterpriseEducationAcademicPeriod_organizationId_academicYearId_status_sequence_idx" ON "EnterpriseEducationAcademicPeriod"("organizationId", "academicYearId", "status", "sequence");
CREATE INDEX "EnterpriseEducationAcademicPeriod_organizationId_startDate_endDate_idx" ON "EnterpriseEducationAcademicPeriod"("organizationId", "startDate", "endDate");
CREATE INDEX "EnterpriseEducationAcademicPeriod_archivedAt_idx" ON "EnterpriseEducationAcademicPeriod"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationAcademicLevel_organizationId_id_key" ON "EnterpriseEducationAcademicLevel"("organizationId", "id");
CREATE UNIQUE INDEX "EducationAcademicLevel_org_code_key" ON "EnterpriseEducationAcademicLevel"("organizationId", "code");
CREATE INDEX "EnterpriseEducationAcademicLevel_organizationId_status_sequence_idx" ON "EnterpriseEducationAcademicLevel"("organizationId", "status", "sequence");
CREATE INDEX "EnterpriseEducationAcademicLevel_archivedAt_idx" ON "EnterpriseEducationAcademicLevel"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationDepartment_organizationId_id_key" ON "EnterpriseEducationDepartment"("organizationId", "id");
CREATE UNIQUE INDEX "EducationDepartment_org_code_key" ON "EnterpriseEducationDepartment"("organizationId", "code");
CREATE INDEX "EnterpriseEducationDepartment_organizationId_campusId_status_sortOrder_idx" ON "EnterpriseEducationDepartment"("organizationId", "campusId", "status", "sortOrder");
CREATE INDEX "EnterpriseEducationDepartment_archivedAt_idx" ON "EnterpriseEducationDepartment"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationProgram_organizationId_id_key" ON "EnterpriseEducationProgram"("organizationId", "id");
CREATE UNIQUE INDEX "EducationProgram_org_code_key" ON "EnterpriseEducationProgram"("organizationId", "code");
CREATE INDEX "EnterpriseEducationProgram_organizationId_departmentId_status_sortOrder_idx" ON "EnterpriseEducationProgram"("organizationId", "departmentId", "status", "sortOrder");
CREATE INDEX "EnterpriseEducationProgram_archivedAt_idx" ON "EnterpriseEducationProgram"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationClassGroup_organizationId_id_key" ON "EnterpriseEducationClassGroup"("organizationId", "id");
CREATE UNIQUE INDEX "EducationClassGroup_year_code_key" ON "EnterpriseEducationClassGroup"("organizationId", "academicYearId", "code");
CREATE INDEX "EnterpriseEducationClassGroup_organizationId_campusId_academicYearId_status_idx" ON "EnterpriseEducationClassGroup"("organizationId", "campusId", "academicYearId", "status");
CREATE INDEX "EnterpriseEducationClassGroup_organizationId_levelId_programId_status_idx" ON "EnterpriseEducationClassGroup"("organizationId", "levelId", "programId", "status");
CREATE INDEX "EnterpriseEducationClassGroup_archivedAt_idx" ON "EnterpriseEducationClassGroup"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationSubject_organizationId_id_key" ON "EnterpriseEducationSubject"("organizationId", "id");
CREATE UNIQUE INDEX "EducationSubject_org_code_key" ON "EnterpriseEducationSubject"("organizationId", "code");
CREATE INDEX "EnterpriseEducationSubject_organizationId_departmentId_status_sortOrder_idx" ON "EnterpriseEducationSubject"("organizationId", "departmentId", "status", "sortOrder");
CREATE INDEX "EnterpriseEducationSubject_archivedAt_idx" ON "EnterpriseEducationSubject"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationCourseOffering_organizationId_id_key" ON "EnterpriseEducationCourseOffering"("organizationId", "id");
CREATE UNIQUE INDEX "EducationCourseOffering_year_code_key" ON "EnterpriseEducationCourseOffering"("organizationId", "academicYearId", "code");
CREATE INDEX "EnterpriseEducationCourseOffering_organizationId_campusId_academicYearId_status_idx" ON "EnterpriseEducationCourseOffering"("organizationId", "campusId", "academicYearId", "status");
CREATE INDEX "EnterpriseEducationCourseOffering_organizationId_periodId_subjectId_status_idx" ON "EnterpriseEducationCourseOffering"("organizationId", "periodId", "subjectId", "status");
CREATE INDEX "EnterpriseEducationCourseOffering_organizationId_classGroupId_status_idx" ON "EnterpriseEducationCourseOffering"("organizationId", "classGroupId", "status");
CREATE INDEX "EnterpriseEducationCourseOffering_archivedAt_idx" ON "EnterpriseEducationCourseOffering"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationCalendarEvent_organizationId_id_key" ON "EnterpriseEducationCalendarEvent"("organizationId", "id");
CREATE INDEX "EnterpriseEducationCalendarEvent_organizationId_academicYearId_startsAt_status_idx" ON "EnterpriseEducationCalendarEvent"("organizationId", "academicYearId", "startsAt", "status");
CREATE INDEX "EnterpriseEducationCalendarEvent_organizationId_campusId_startsAt_status_idx" ON "EnterpriseEducationCalendarEvent"("organizationId", "campusId", "startsAt", "status");
CREATE INDEX "EnterpriseEducationCalendarEvent_organizationId_periodId_startsAt_idx" ON "EnterpriseEducationCalendarEvent"("organizationId", "periodId", "startsAt");
CREATE INDEX "EnterpriseEducationCalendarEvent_archivedAt_idx" ON "EnterpriseEducationCalendarEvent"("archivedAt");

ALTER TABLE "EnterpriseEducationAcademicPeriod"
  ADD CONSTRAINT "EducationAcademicPeriod_year_fkey"
  FOREIGN KEY ("organizationId", "academicYearId")
  REFERENCES "EnterpriseEducationAcademicYear"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationDepartment"
  ADD CONSTRAINT "EducationDepartment_campus_fkey"
  FOREIGN KEY ("organizationId", "campusId")
  REFERENCES "EnterpriseEducationCampus"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationProgram"
  ADD CONSTRAINT "EducationProgram_department_fkey"
  FOREIGN KEY ("organizationId", "departmentId")
  REFERENCES "EnterpriseEducationDepartment"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationClassGroup"
  ADD CONSTRAINT "EducationClassGroup_year_fkey"
  FOREIGN KEY ("organizationId", "academicYearId")
  REFERENCES "EnterpriseEducationAcademicYear"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationClassGroup"
  ADD CONSTRAINT "EducationClassGroup_campus_fkey"
  FOREIGN KEY ("organizationId", "campusId")
  REFERENCES "EnterpriseEducationCampus"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationClassGroup"
  ADD CONSTRAINT "EducationClassGroup_level_fkey"
  FOREIGN KEY ("organizationId", "levelId")
  REFERENCES "EnterpriseEducationAcademicLevel"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationClassGroup"
  ADD CONSTRAINT "EducationClassGroup_program_fkey"
  FOREIGN KEY ("organizationId", "programId")
  REFERENCES "EnterpriseEducationProgram"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationSubject"
  ADD CONSTRAINT "EducationSubject_department_fkey"
  FOREIGN KEY ("organizationId", "departmentId")
  REFERENCES "EnterpriseEducationDepartment"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_year_fkey"
  FOREIGN KEY ("organizationId", "academicYearId")
  REFERENCES "EnterpriseEducationAcademicYear"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_period_fkey"
  FOREIGN KEY ("organizationId", "periodId")
  REFERENCES "EnterpriseEducationAcademicPeriod"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_campus_fkey"
  FOREIGN KEY ("organizationId", "campusId")
  REFERENCES "EnterpriseEducationCampus"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_subject_fkey"
  FOREIGN KEY ("organizationId", "subjectId")
  REFERENCES "EnterpriseEducationSubject"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_class_group_fkey"
  FOREIGN KEY ("organizationId", "classGroupId")
  REFERENCES "EnterpriseEducationClassGroup"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_program_fkey"
  FOREIGN KEY ("organizationId", "programId")
  REFERENCES "EnterpriseEducationProgram"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCourseOffering"
  ADD CONSTRAINT "EducationCourseOffering_level_fkey"
  FOREIGN KEY ("organizationId", "levelId")
  REFERENCES "EnterpriseEducationAcademicLevel"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationCalendarEvent"
  ADD CONSTRAINT "EducationCalendarEvent_year_fkey"
  FOREIGN KEY ("organizationId", "academicYearId")
  REFERENCES "EnterpriseEducationAcademicYear"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCalendarEvent"
  ADD CONSTRAINT "EducationCalendarEvent_period_fkey"
  FOREIGN KEY ("organizationId", "periodId")
  REFERENCES "EnterpriseEducationAcademicPeriod"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationCalendarEvent"
  ADD CONSTRAINT "EducationCalendarEvent_campus_fkey"
  FOREIGN KEY ("organizationId", "campusId")
  REFERENCES "EnterpriseEducationCampus"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Education template v2 becomes the latest active template without changing v1.
INSERT INTO "SectorTemplate" ("id", "sectorId", "version", "label", "description", "isActive", "createdAt", "updatedAt")
SELECT 'education-template-v2', s."id", 2, 'Education v2', 'Structure académique canonique EDU-1.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BusinessSector" s
WHERE s."code" = 'EDUCATION'
ON CONFLICT ("sectorId", "version") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
)
INSERT INTO "SectorTemplateModule"
  ("id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder", "defaultEnabled", "requiresPlanLevel", "createdAt", "updatedAt")
SELECT module_data."id", template."id", module_data."moduleCode", module_data."labelFr", module_data."labelEn", module_data."descriptionFr", module_data."descriptionEn", 'SECTOR', module_data."icon", module_data."sortOrder", true, 'BUSINESS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template
CROSS JOIN (
  VALUES
    ('education-v2-module-settings', 'EDUCATION_SETTINGS', 'Paramètres Education', 'Education settings', 'Configuration de l’établissement et du campus principal.', 'Institution and primary-campus configuration.', 'graduation-cap', 210),
    ('education-v2-module-structure', 'ACADEMIC_STRUCTURE', 'Structure académique', 'Academic structure', 'Campus, années, périodes, niveaux, filières, classes, matières et offres de cours.', 'Campuses, academic years, periods, levels, programs, classes, subjects and course offerings.', 'school', 220),
    ('education-v2-module-calendar', 'ACADEMIC_CALENDAR', 'Calendrier académique', 'Academic calendar', 'Calendrier académique par année, période et campus.', 'Academic calendar by year, period and campus.', 'calendar-days', 230)
) AS module_data("id", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder")
ON CONFLICT ("templateId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "moduleCategory" = EXCLUDED."moduleCategory",
  "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder",
  "defaultEnabled" = true,
  "requiresPlanLevel" = 'BUSINESS',
  "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
)
INSERT INTO "SectorTemplateDepartment"
  ("id", "templateId", "departmentCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "sortOrder", "createdAt", "updatedAt")
SELECT department_data."id", template."id", department_data."code", department_data."labelFr", department_data."labelEn", department_data."descriptionFr", department_data."descriptionEn", department_data."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template
CROSS JOIN (
  VALUES
    ('education-v2-dept-admin', 'ACADEMIC_ADMINISTRATION', 'Administration académique', 'Academic administration', 'Paramétrage et gouvernance académique.', 'Academic configuration and governance.', 210),
    ('education-v2-dept-academics', 'ACADEMIC_AFFAIRS', 'Affaires académiques', 'Academic affairs', 'Programmes, cours et calendrier académique.', 'Programs, courses and academic calendar.', 220)
) AS department_data("id", "code", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "sortOrder")
ON CONFLICT ("templateId", "departmentCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
)
INSERT INTO "SectorTemplatePosition"
  ("id", "templateId", "positionCode", "labelFr", "labelEn", "departmentCode", "hierarchyLevel", "descriptionFr", "descriptionEn", "defaultPermissionsJson", "isKeyPosition", "sortOrder", "createdAt", "updatedAt")
SELECT position_data."id", template."id", position_data."code", position_data."labelFr", position_data."labelEn", position_data."departmentCode", position_data."hierarchyLevel", position_data."descriptionFr", position_data."descriptionEn", position_data."permissions"::jsonb, position_data."isKey", position_data."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template
CROSS JOIN (
  VALUES
    ('education-v2-pos-admin', 'EDUCATION_ADMIN', 'Administrateur Education', 'Education administrator', 'ACADEMIC_ADMINISTRATION', 10, 'Paramétrage et administration académique.', 'Academic configuration and administration.', '["enterprise.education.settings.view","enterprise.education.settings.manage","enterprise.education.structure.view","enterprise.education.structure.create","enterprise.education.structure.update","enterprise.education.structure.manage","enterprise.education.calendar.view","enterprise.education.calendar.create","enterprise.education.calendar.update","enterprise.education.calendar.manage"]', true, 210),
    ('education-v2-pos-manager', 'ACADEMIC_MANAGER', 'Responsable académique', 'Academic manager', 'ACADEMIC_AFFAIRS', 20, 'Pilotage de la structure et du calendrier académiques.', 'Academic structure and calendar management.', '["enterprise.education.settings.view","enterprise.education.structure.view","enterprise.education.structure.create","enterprise.education.structure.update","enterprise.education.structure.manage","enterprise.education.calendar.view","enterprise.education.calendar.create","enterprise.education.calendar.update","enterprise.education.calendar.manage"]', true, 220),
    ('education-v2-pos-registrar', 'REGISTRAR', 'Responsable des études', 'Registrar', 'ACADEMIC_AFFAIRS', 30, 'Gestion opérationnelle du référentiel académique.', 'Operational academic-reference management.', '["enterprise.education.settings.view","enterprise.education.structure.view","enterprise.education.structure.create","enterprise.education.structure.update","enterprise.education.calendar.view","enterprise.education.calendar.create","enterprise.education.calendar.update"]', false, 230)
) AS position_data("id", "code", "labelFr", "labelEn", "departmentCode", "hierarchyLevel", "descriptionFr", "descriptionEn", "permissions", "isKey", "sortOrder")
ON CONFLICT ("templateId", "positionCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "departmentCode" = EXCLUDED."departmentCode",
  "hierarchyLevel" = EXCLUDED."hierarchyLevel",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "defaultPermissionsJson" = EXCLUDED."defaultPermissionsJson",
  "isKeyPosition" = EXCLUDED."isKeyPosition",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id"
  FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
)
INSERT INTO "SectorTemplateActivityBlock"
  ("id", "templateId", "blockCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder", "defaultEnabled", "targetModuleCode", "createdAt", "updatedAt")
SELECT block_data."id", template."id", block_data."code", block_data."labelFr", block_data."labelEn", block_data."descriptionFr", block_data."descriptionEn", block_data."icon", block_data."sortOrder", true, block_data."targetModuleCode", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template
CROSS JOIN (
  VALUES
    ('education-v2-block-structure', 'CONFIGURE_ACADEMIC_STRUCTURE', 'Configurer la structure académique', 'Configure academic structure', 'Campus, années, périodes, niveaux, filières, classes et matières.', 'Campuses, years, periods, levels, programs, classes and subjects.', 'school', 210, 'ACADEMIC_STRUCTURE'),
    ('education-v2-block-calendar', 'PLAN_ACADEMIC_CALENDAR', 'Planifier le calendrier académique', 'Plan academic calendar', 'Dates importantes par année, période et campus.', 'Important dates by academic year, period and campus.', 'calendar-days', 220, 'ACADEMIC_CALENDAR')
) AS block_data("id", "code", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder", "targetModuleCode")
ON CONFLICT ("templateId", "blockCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder",
  "defaultEnabled" = true,
  "targetModuleCode" = EXCLUDED."targetModuleCode",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Existing Education organizations receive the new canonical modules deterministically.
WITH education_modules AS (
  SELECT stm.*
  FROM "SectorTemplateModule" stm
  JOIN "SectorTemplate" t ON t."id" = stm."templateId"
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
)
INSERT INTO "EnterpriseModule"
  ("id", "organizationId", "sectorId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "isEnabled", "isCore", "sourceTemplateId", "requiresPlanLevel", "sortOrder", "createdAt", "updatedAt")
SELECT
  'edu2-' || md5(o."id" || ':' || em."moduleCode"),
  o."id",
  o."sectorId",
  em."moduleCode",
  em."labelFr",
  em."labelEn",
  em."descriptionFr",
  em."descriptionEn",
  em."moduleCategory",
  em."icon",
  true,
  false,
  em."id",
  em."requiresPlanLevel",
  em."sortOrder",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN education_modules em
WHERE o."sectorCode" = 'EDUCATION' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "moduleCategory" = EXCLUDED."moduleCategory",
  "icon" = EXCLUDED."icon",
  "isEnabled" = true,
  "isCore" = false,
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "requiresPlanLevel" = EXCLUDED."requiresPlanLevel",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH education_modules AS (
  SELECT stm.*
  FROM "SectorTemplateModule" stm
  JOIN "SectorTemplate" t ON t."id" = stm."templateId"
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
)
INSERT INTO "EnterpriseAdminSection"
  ("id", "organizationId", "moduleId", "sectionCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "isEnabled", "requiredPermission", "sortOrder", "sourceTemplateId", "createdAt", "updatedAt")
SELECT
  'edu2-admin-' || md5(o."id" || ':' || em."moduleCode"),
  o."id",
  m."id",
  em."moduleCode",
  em."labelFr",
  em."labelEn",
  em."descriptionFr",
  em."descriptionEn",
  em."icon",
  true,
  'module:' || em."moduleCode" || ':manage',
  em."sortOrder",
  em."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
JOIN "EnterpriseModule" m ON m."organizationId" = o."id"
JOIN education_modules em ON em."moduleCode" = m."moduleCode"
WHERE o."sectorCode" = 'EDUCATION' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId", "sectionCode") DO UPDATE SET
  "moduleId" = EXCLUDED."moduleId",
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "icon" = EXCLUDED."icon",
  "isEnabled" = true,
  "requiredPermission" = EXCLUDED."requiredPermission",
  "sortOrder" = EXCLUDED."sortOrder",
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "updatedAt" = CURRENT_TIMESTAMP;

-- v1 module rows become navigation-inactive only; no historical record is deleted or rewritten.
UPDATE "EnterpriseModule" m
SET "isEnabled" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "Organization" o
WHERE m."organizationId" = o."id"
  AND o."sectorCode" = 'EDUCATION'
  AND m."moduleCode" IN ('STUDENTS','TEACHERS','CLASSES','COURSES','ATTENDANCE','EXAMS_GRADES','SCHOOL_FEES','PARENTS_GUARDIANS','DISCIPLINE','ACADEMIC_REPORTS');

UPDATE "EnterpriseAdminSection" s
SET "isEnabled" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "Organization" o
WHERE s."organizationId" = o."id"
  AND o."sectorCode" = 'EDUCATION'
  AND s."sectionCode" IN ('STUDENTS','TEACHERS','CLASSES','COURSES','ATTENDANCE','EXAMS_GRADES','SCHOOL_FEES','PARENTS_GUARDIANS','DISCIPLINE','ACADEMIC_REPORTS');
