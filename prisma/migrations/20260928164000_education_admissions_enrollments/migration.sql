-- EDU-2: admissions, student registry, guardians and enrollment history.
-- Additive only. User, OrganizationMember, BusinessParty and EnterpriseDocument remain common authorities.

CREATE TABLE "EnterpriseEducationCandidate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "candidateNumber" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "middleName" TEXT,
  "preferredName" TEXT,
  "birthDate" TIMESTAMP(3),
  "sex" TEXT,
  "nationalityCode" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "addressJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationAdmissionApplication" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "applicationNumber" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "programId" TEXT,
  "levelId" TEXT,
  "classGroupId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "reviewStartedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "applicantNotes" TEXT,
  "internalNotes" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationAdmissionApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationAdmissionDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "decidedByUserId" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseEducationAdmissionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationStudent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "sourceCandidateId" TEXT,
  "userId" TEXT,
  "businessPartyId" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "middleName" TEXT,
  "preferredName" TEXT,
  "birthDate" TIMESTAMP(3),
  "sex" TEXT,
  "nationalityCode" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationStudent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationGuardian" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "guardianNumber" TEXT NOT NULL,
  "businessPartyId" TEXT,
  "userId" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "preferredLanguage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationGuardian_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationStudentGuardian" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "guardianId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isLegalGuardian" BOOLEAN NOT NULL DEFAULT false,
  "isBillingContact" BOOLEAN NOT NULL DEFAULT false,
  "isNotificationContact" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveUntil" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationStudentGuardian_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationEnrollment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enrollmentNumber" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "admissionApplicationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "enrolledAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseEducationEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationEnrollmentPlacement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "programId" TEXT,
  "levelId" TEXT NOT NULL,
  "classGroupId" TEXT,
  "placementReason" TEXT NOT NULL DEFAULT 'INITIAL',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseEducationEnrollmentPlacement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEducationEnrollmentHistory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "fromPlacementId" TEXT,
  "toPlacementId" TEXT,
  "reason" TEXT,
  "actorUserId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" JSONB,
  CONSTRAINT "EnterpriseEducationEnrollmentHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseEducationCandidate_organizationId_id_key" ON "EnterpriseEducationCandidate"("organizationId", "id");
CREATE UNIQUE INDEX "EducationCandidate_org_number_key" ON "EnterpriseEducationCandidate"("organizationId", "candidateNumber");
CREATE INDEX "EnterpriseEducationCandidate_organizationId_status_lastName_firstName_idx" ON "EnterpriseEducationCandidate"("organizationId", "status", "lastName", "firstName");
CREATE INDEX "EnterpriseEducationCandidate_organizationId_email_idx" ON "EnterpriseEducationCandidate"("organizationId", "email");
CREATE INDEX "EnterpriseEducationCandidate_organizationId_phone_idx" ON "EnterpriseEducationCandidate"("organizationId", "phone");
CREATE INDEX "EnterpriseEducationCandidate_archivedAt_idx" ON "EnterpriseEducationCandidate"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationAdmissionApplication_organizationId_id_key" ON "EnterpriseEducationAdmissionApplication"("organizationId", "id");
CREATE UNIQUE INDEX "EducationAdmissionApplication_org_number_key" ON "EnterpriseEducationAdmissionApplication"("organizationId", "applicationNumber");
CREATE INDEX "EnterpriseEducationAdmissionApplication_organizationId_status_submittedAt_idx" ON "EnterpriseEducationAdmissionApplication"("organizationId", "status", "submittedAt");
CREATE INDEX "EnterpriseEducationAdmissionApplication_organizationId_academicYearId_campusId_status_idx" ON "EnterpriseEducationAdmissionApplication"("organizationId", "academicYearId", "campusId", "status");
CREATE INDEX "EnterpriseEducationAdmissionApplication_organizationId_candidateId_createdAt_idx" ON "EnterpriseEducationAdmissionApplication"("organizationId", "candidateId", "createdAt");
CREATE INDEX "EnterpriseEducationAdmissionApplication_archivedAt_idx" ON "EnterpriseEducationAdmissionApplication"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationAdmissionDecision_organizationId_id_key" ON "EnterpriseEducationAdmissionDecision"("organizationId", "id");
CREATE INDEX "EnterpriseEducationAdmissionDecision_organizationId_applicationId_decidedAt_idx" ON "EnterpriseEducationAdmissionDecision"("organizationId", "applicationId", "decidedAt");
CREATE INDEX "EnterpriseEducationAdmissionDecision_organizationId_decision_decidedAt_idx" ON "EnterpriseEducationAdmissionDecision"("organizationId", "decision", "decidedAt");

CREATE UNIQUE INDEX "EnterpriseEducationStudent_organizationId_id_key" ON "EnterpriseEducationStudent"("organizationId", "id");
CREATE UNIQUE INDEX "EducationStudent_org_number_key" ON "EnterpriseEducationStudent"("organizationId", "studentNumber");
CREATE UNIQUE INDEX "EducationStudent_org_candidate_key" ON "EnterpriseEducationStudent"("organizationId", "sourceCandidateId");
CREATE INDEX "EnterpriseEducationStudent_organizationId_status_lastName_firstName_idx" ON "EnterpriseEducationStudent"("organizationId", "status", "lastName", "firstName");
CREATE INDEX "EnterpriseEducationStudent_organizationId_userId_idx" ON "EnterpriseEducationStudent"("organizationId", "userId");
CREATE INDEX "EnterpriseEducationStudent_organizationId_businessPartyId_idx" ON "EnterpriseEducationStudent"("organizationId", "businessPartyId");
CREATE INDEX "EnterpriseEducationStudent_archivedAt_idx" ON "EnterpriseEducationStudent"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationGuardian_organizationId_id_key" ON "EnterpriseEducationGuardian"("organizationId", "id");
CREATE UNIQUE INDEX "EducationGuardian_org_number_key" ON "EnterpriseEducationGuardian"("organizationId", "guardianNumber");
CREATE INDEX "EnterpriseEducationGuardian_organizationId_status_lastName_firstName_idx" ON "EnterpriseEducationGuardian"("organizationId", "status", "lastName", "firstName");
CREATE INDEX "EnterpriseEducationGuardian_organizationId_businessPartyId_idx" ON "EnterpriseEducationGuardian"("organizationId", "businessPartyId");
CREATE INDEX "EnterpriseEducationGuardian_organizationId_userId_idx" ON "EnterpriseEducationGuardian"("organizationId", "userId");
CREATE INDEX "EnterpriseEducationGuardian_archivedAt_idx" ON "EnterpriseEducationGuardian"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationStudentGuardian_organizationId_id_key" ON "EnterpriseEducationStudentGuardian"("organizationId", "id");
CREATE UNIQUE INDEX "EducationStudentGuardian_org_pair_key" ON "EnterpriseEducationStudentGuardian"("organizationId", "studentId", "guardianId");
CREATE INDEX "EnterpriseEducationStudentGuardian_organizationId_studentId_isPrimary_archivedAt_idx" ON "EnterpriseEducationStudentGuardian"("organizationId", "studentId", "isPrimary", "archivedAt");
CREATE INDEX "EnterpriseEducationStudentGuardian_organizationId_guardianId_archivedAt_idx" ON "EnterpriseEducationStudentGuardian"("organizationId", "guardianId", "archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationEnrollment_organizationId_id_key" ON "EnterpriseEducationEnrollment"("organizationId", "id");
CREATE UNIQUE INDEX "EducationEnrollment_org_number_key" ON "EnterpriseEducationEnrollment"("organizationId", "enrollmentNumber");
CREATE UNIQUE INDEX "EducationEnrollment_org_application_key" ON "EnterpriseEducationEnrollment"("organizationId", "admissionApplicationId");
CREATE INDEX "EnterpriseEducationEnrollment_organizationId_studentId_academicYearId_status_idx" ON "EnterpriseEducationEnrollment"("organizationId", "studentId", "academicYearId", "status");
CREATE INDEX "EnterpriseEducationEnrollment_organizationId_academicYearId_status_createdAt_idx" ON "EnterpriseEducationEnrollment"("organizationId", "academicYearId", "status", "createdAt");
CREATE INDEX "EnterpriseEducationEnrollment_archivedAt_idx" ON "EnterpriseEducationEnrollment"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseEducationEnrollmentPlacement_organizationId_id_key" ON "EnterpriseEducationEnrollmentPlacement"("organizationId", "id");
CREATE INDEX "EnterpriseEducationEnrollmentPlacement_organizationId_enrollmentId_effectiveUntil_idx" ON "EnterpriseEducationEnrollmentPlacement"("organizationId", "enrollmentId", "effectiveUntil");
CREATE INDEX "EnterpriseEducationEnrollmentPlacement_organizationId_campusId_levelId_classGroupId_idx" ON "EnterpriseEducationEnrollmentPlacement"("organizationId", "campusId", "levelId", "classGroupId");
CREATE INDEX "EnterpriseEducationEnrollmentPlacement_organizationId_programId_effectiveUntil_idx" ON "EnterpriseEducationEnrollmentPlacement"("organizationId", "programId", "effectiveUntil");

CREATE UNIQUE INDEX "EnterpriseEducationEnrollmentHistory_organizationId_id_key" ON "EnterpriseEducationEnrollmentHistory"("organizationId", "id");
CREATE INDEX "EnterpriseEducationEnrollmentHistory_organizationId_enrollmentId_occurredAt_idx" ON "EnterpriseEducationEnrollmentHistory"("organizationId", "enrollmentId", "occurredAt");
CREATE INDEX "EnterpriseEducationEnrollmentHistory_organizationId_eventType_occurredAt_idx" ON "EnterpriseEducationEnrollmentHistory"("organizationId", "eventType", "occurredAt");

ALTER TABLE "EnterpriseEducationAdmissionApplication"
  ADD CONSTRAINT "EducationAdmissionApplication_candidate_fkey"
  FOREIGN KEY ("organizationId", "candidateId")
  REFERENCES "EnterpriseEducationCandidate"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationAdmissionApplication"
  ADD CONSTRAINT "EducationAdmissionApplication_year_fkey"
  FOREIGN KEY ("organizationId", "academicYearId")
  REFERENCES "EnterpriseEducationAcademicYear"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationAdmissionApplication"
  ADD CONSTRAINT "EducationAdmissionApplication_campus_fkey"
  FOREIGN KEY ("organizationId", "campusId")
  REFERENCES "EnterpriseEducationCampus"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationAdmissionApplication"
  ADD CONSTRAINT "EducationAdmissionApplication_program_fkey"
  FOREIGN KEY ("organizationId", "programId")
  REFERENCES "EnterpriseEducationProgram"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationAdmissionApplication"
  ADD CONSTRAINT "EducationAdmissionApplication_level_fkey"
  FOREIGN KEY ("organizationId", "levelId")
  REFERENCES "EnterpriseEducationAcademicLevel"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationAdmissionApplication"
  ADD CONSTRAINT "EducationAdmissionApplication_class_fkey"
  FOREIGN KEY ("organizationId", "classGroupId")
  REFERENCES "EnterpriseEducationClassGroup"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationAdmissionDecision"
  ADD CONSTRAINT "EducationAdmissionDecision_application_fkey"
  FOREIGN KEY ("organizationId", "applicationId")
  REFERENCES "EnterpriseEducationAdmissionApplication"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationStudent"
  ADD CONSTRAINT "EducationStudent_candidate_fkey"
  FOREIGN KEY ("organizationId", "sourceCandidateId")
  REFERENCES "EnterpriseEducationCandidate"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationStudentGuardian"
  ADD CONSTRAINT "EducationStudentGuardian_student_fkey"
  FOREIGN KEY ("organizationId", "studentId")
  REFERENCES "EnterpriseEducationStudent"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationStudentGuardian"
  ADD CONSTRAINT "EducationStudentGuardian_guardian_fkey"
  FOREIGN KEY ("organizationId", "guardianId")
  REFERENCES "EnterpriseEducationGuardian"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationEnrollment"
  ADD CONSTRAINT "EducationEnrollment_student_fkey"
  FOREIGN KEY ("organizationId", "studentId")
  REFERENCES "EnterpriseEducationStudent"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationEnrollment"
  ADD CONSTRAINT "EducationEnrollment_year_fkey"
  FOREIGN KEY ("organizationId", "academicYearId")
  REFERENCES "EnterpriseEducationAcademicYear"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationEnrollment"
  ADD CONSTRAINT "EducationEnrollment_application_fkey"
  FOREIGN KEY ("organizationId", "admissionApplicationId")
  REFERENCES "EnterpriseEducationAdmissionApplication"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationEnrollmentPlacement"
  ADD CONSTRAINT "EducationEnrollmentPlacement_enrollment_fkey"
  FOREIGN KEY ("organizationId", "enrollmentId")
  REFERENCES "EnterpriseEducationEnrollment"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationEnrollmentPlacement"
  ADD CONSTRAINT "EducationEnrollmentPlacement_campus_fkey"
  FOREIGN KEY ("organizationId", "campusId")
  REFERENCES "EnterpriseEducationCampus"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationEnrollmentPlacement"
  ADD CONSTRAINT "EducationEnrollmentPlacement_program_fkey"
  FOREIGN KEY ("organizationId", "programId")
  REFERENCES "EnterpriseEducationProgram"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationEnrollmentPlacement"
  ADD CONSTRAINT "EducationEnrollmentPlacement_level_fkey"
  FOREIGN KEY ("organizationId", "levelId")
  REFERENCES "EnterpriseEducationAcademicLevel"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseEducationEnrollmentPlacement"
  ADD CONSTRAINT "EducationEnrollmentPlacement_class_fkey"
  FOREIGN KEY ("organizationId", "classGroupId")
  REFERENCES "EnterpriseEducationClassGroup"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseEducationEnrollmentHistory"
  ADD CONSTRAINT "EducationEnrollmentHistory_enrollment_fkey"
  FOREIGN KEY ("organizationId", "enrollmentId")
  REFERENCES "EnterpriseEducationEnrollment"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;


-- EDU-2 extends Education template v2 with admissions, students and guardians.
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
    ('education-v2-module-admissions', 'ADMISSIONS', 'Admissions', 'Admissions', 'Candidats, dossiers, décisions et conversion vers l’inscription.', 'Candidates, applications, decisions and conversion into enrollment.', 'clipboard-check', 240),
    ('education-v2-module-students', 'STUDENTS', 'Étudiants', 'Students', 'Registre étudiant, inscriptions, affectations et historique.', 'Student registry, enrollments, placements and history.', 'users', 250),
    ('education-v2-module-guardians', 'GUARDIANS', 'Parents & tuteurs', 'Parents & guardians', 'Tuteurs, relations étudiant et préférences de contact.', 'Guardians, student relationships and contact preferences.', 'user-round-check', 260)
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

UPDATE "SectorTemplatePosition"
SET "defaultPermissionsJson" = COALESCE("defaultPermissionsJson", '[]'::jsonb)
  || '["enterprise.education.admissions.view","enterprise.education.admissions.create","enterprise.education.admissions.update","enterprise.education.admissions.approve","enterprise.education.admissions.manage","enterprise.education.students.view","enterprise.education.students.update","enterprise.education.students.manage","enterprise.education.guardians.view","enterprise.education.guardians.create","enterprise.education.guardians.update","enterprise.education.guardians.manage"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "templateId" = (SELECT t."id" FROM "SectorTemplate" t JOIN "BusinessSector" s ON s."id" = t."sectorId" WHERE s."code" = 'EDUCATION' AND t."version" = 2)
  AND "positionCode" = 'EDUCATION_ADMIN';

UPDATE "SectorTemplatePosition"
SET "defaultPermissionsJson" = COALESCE("defaultPermissionsJson", '[]'::jsonb)
  || '["enterprise.education.admissions.view","enterprise.education.admissions.create","enterprise.education.admissions.update","enterprise.education.admissions.approve","enterprise.education.students.view","enterprise.education.students.update","enterprise.education.guardians.view","enterprise.education.guardians.create","enterprise.education.guardians.update"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "templateId" = (SELECT t."id" FROM "SectorTemplate" t JOIN "BusinessSector" s ON s."id" = t."sectorId" WHERE s."code" = 'EDUCATION' AND t."version" = 2)
  AND "positionCode" = 'ACADEMIC_MANAGER';

UPDATE "SectorTemplatePosition"
SET "defaultPermissionsJson" = COALESCE("defaultPermissionsJson", '[]'::jsonb)
  || '["enterprise.education.admissions.view","enterprise.education.admissions.create","enterprise.education.admissions.update","enterprise.education.students.view","enterprise.education.students.update","enterprise.education.guardians.view","enterprise.education.guardians.create","enterprise.education.guardians.update"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "templateId" = (SELECT t."id" FROM "SectorTemplate" t JOIN "BusinessSector" s ON s."id" = t."sectorId" WHERE s."code" = 'EDUCATION' AND t."version" = 2)
  AND "positionCode" = 'REGISTRAR';

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
    ('education-v2-block-admissions', 'MANAGE_ADMISSIONS', 'Gérer les admissions', 'Manage admissions', 'Étudier les candidatures et prendre les décisions d’admission.', 'Review applications and make admission decisions.', 'clipboard-check', 230, 'ADMISSIONS'),
    ('education-v2-block-students', 'MANAGE_STUDENTS', 'Gérer les étudiants', 'Manage students', 'Suivre les inscriptions, affectations, transferts et retraits.', 'Track enrollments, placements, transfers and withdrawals.', 'users', 240, 'STUDENTS')
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

WITH education_modules AS (
  SELECT stm.*
  FROM "SectorTemplateModule" stm
  JOIN "SectorTemplate" t ON t."id" = stm."templateId"
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'EDUCATION' AND t."version" = 2
    AND stm."moduleCode" IN ('ADMISSIONS', 'STUDENTS', 'GUARDIANS')
)
INSERT INTO "EnterpriseModule"
  ("id", "organizationId", "sectorId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "isEnabled", "isCore", "sourceTemplateId", "requiresPlanLevel", "sortOrder", "createdAt", "updatedAt")
SELECT
  'edu2-pop-' || md5(o."id" || ':' || em."moduleCode"),
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
    AND stm."moduleCode" IN ('ADMISSIONS', 'STUDENTS', 'GUARDIANS')
)
INSERT INTO "EnterpriseAdminSection"
  ("id", "organizationId", "moduleId", "sectionCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "isEnabled", "requiredPermission", "sortOrder", "sourceTemplateId", "createdAt", "updatedAt")
SELECT
  'edu2-pop-admin-' || md5(o."id" || ':' || em."moduleCode"),
  o."id",
  m."id",
  em."moduleCode",
  em."labelFr",
  em."labelEn",
  em."descriptionFr",
  em."descriptionEn",
  em."icon",
  true,
  CASE em."moduleCode"
    WHEN 'ADMISSIONS' THEN 'enterprise.education.admissions.view'
    WHEN 'STUDENTS' THEN 'enterprise.education.students.view'
    ELSE 'enterprise.education.guardians.view'
  END,
  em."sortOrder",
  em."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN education_modules em
JOIN "EnterpriseModule" m ON m."organizationId" = o."id" AND m."moduleCode" = em."moduleCode"
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
