-- Équipe médicale dédiée : migration additive et non destructive.
CREATE UNIQUE INDEX "EnterprisePosition_organizationId_id_key" ON "EnterprisePosition"("organizationId","id");
CREATE UNIQUE INDEX "EnterpriseDepartment_organizationId_id_key" ON "EnterpriseDepartment"("organizationId","id");

CREATE TABLE "HealthSpecialty" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "labelFr" TEXT NOT NULL,
  "labelEn" TEXT, "description" TEXT, "isGlobal" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthSpecialty_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthStaffAssignment" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "organizationMemberId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "enterprisePositionId" TEXT NOT NULL, "enterpriseDepartmentId" TEXT NOT NULL, "healthSpecialtyId" TEXT, "supervisorStaffId" TEXT,
  "professionalNumber" TEXT, "professionalOrder" TEXT, "experienceLevel" TEXT, "competenceArea" TEXT,
  "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE', "usualWorkDays" JSONB, "usualStartTime" TEXT, "usualEndTime" TEXT,
  "dailyCapacity" INTEGER, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "permissionsJson" JSONB, "notes" TEXT,
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "suspendedById" TEXT, "suspendedAt" TIMESTAMP(3), "suspensionReason" TEXT,
  "archivedById" TEXT, "archivedAt" TIMESTAMP(3), "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthStaffAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HealthStaffEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "staffAssignmentId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "metadataJson" JSONB, "actorUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthStaffEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HealthSpecialty_organizationId_code_key" ON "HealthSpecialty"("organizationId","code");
CREATE UNIQUE INDEX "HealthSpecialty_organizationId_id_key" ON "HealthSpecialty"("organizationId","id");
CREATE INDEX "HealthSpecialty_organizationId_isActive_sortOrder_idx" ON "HealthSpecialty"("organizationId","isActive","sortOrder");
CREATE UNIQUE INDEX "HealthStaffAssignment_organizationMemberId_key" ON "HealthStaffAssignment"("organizationMemberId");
CREATE UNIQUE INDEX "HealthStaffAssignment_organizationId_organizationMemberId_key" ON "HealthStaffAssignment"("organizationId","organizationMemberId");
CREATE UNIQUE INDEX "HealthStaffAssignment_organizationId_userId_key" ON "HealthStaffAssignment"("organizationId","userId");
CREATE UNIQUE INDEX "HealthStaffAssignment_organizationId_id_key" ON "HealthStaffAssignment"("organizationId","id");
CREATE INDEX "HealthStaffAssignment_organizationId_enterprisePositionId_status_idx" ON "HealthStaffAssignment"("organizationId","enterprisePositionId","status");
CREATE INDEX "HealthStaffAssignment_organizationId_enterpriseDepartmentId_status_idx" ON "HealthStaffAssignment"("organizationId","enterpriseDepartmentId","status");
CREATE INDEX "HealthStaffAssignment_organizationId_healthSpecialtyId_status_idx" ON "HealthStaffAssignment"("organizationId","healthSpecialtyId","status");
CREATE INDEX "HealthStaffAssignment_organizationId_availabilityStatus_status_idx" ON "HealthStaffAssignment"("organizationId","availabilityStatus","status");
CREATE INDEX "HealthStaffEvent_organizationId_staffAssignmentId_createdAt_idx" ON "HealthStaffEvent"("organizationId","staffAssignmentId","createdAt");
CREATE INDEX "HealthStaffEvent_actorUserId_createdAt_idx" ON "HealthStaffEvent"("actorUserId","createdAt");

ALTER TABLE "HealthSpecialty" ADD CONSTRAINT "HealthSpecialty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_organizationMemberId_fkey" FOREIGN KEY ("organizationMemberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_organizationId_enterprisePositionId_fkey" FOREIGN KEY ("organizationId","enterprisePositionId") REFERENCES "EnterprisePosition"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_organizationId_enterpriseDepartmentId_fkey" FOREIGN KEY ("organizationId","enterpriseDepartmentId") REFERENCES "EnterpriseDepartment"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_organizationId_healthSpecialtyId_fkey" FOREIGN KEY ("organizationId","healthSpecialtyId") REFERENCES "HealthSpecialty"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_supervisorStaffId_fkey" FOREIGN KEY ("supervisorStaffId") REFERENCES "HealthStaffAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthStaffAssignment" ADD CONSTRAINT "HealthStaffAssignment_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthStaffEvent" ADD CONSTRAINT "HealthStaffEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthStaffEvent" ADD CONSTRAINT "HealthStaffEvent_staffAssignmentId_fkey" FOREIGN KEY ("staffAssignmentId") REFERENCES "HealthStaffAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthStaffEvent" ADD CONSTRAINT "HealthStaffEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Référentiels Santé recommandés pour les organisations existantes.
INSERT INTO "EnterpriseDepartment" ("id","organizationId","departmentCode","labelFr","labelEn","isActive","sortOrder","createdAt","updatedAt")
SELECT CONCAT('health-dept-',o."id",'-',d.code),o."id",d.code,d.fr,d.en,true,d.ord,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "Organization" o CROSS JOIN (VALUES
('MEDICAL_DIRECTION','Direction médicale','Medical direction',10),('MEDICAL_RECEPTION','Accueil / Réception','Reception',20),
('GENERAL_CONSULTATION','Consultation générale','General consultation',30),('SPECIALIZED_CONSULTATION','Consultation spécialisée','Specialized consultation',40),
('EMERGENCY','Urgences','Emergency',50),('NURSING_CARE','Soins infirmiers','Nursing care',60),('LABORATORY','Laboratoire','Laboratory',70),
('INTERNAL_PHARMACY','Pharmacie interne','Internal pharmacy',80),('MEDICAL_BILLING','Facturation médicale','Medical billing',90),
('INSURANCE_COVERAGE','Assurance / Prise en charge','Insurance coverage',100),('CARE_QUALITY','Qualité & sécurité des soins','Care quality and safety',110),
('MEDICAL_ARCHIVES','Archives médicales','Medical archives',120),('HEALTH_ADMINISTRATION','Administration santé','Health administration',130)
) AS d(code,fr,en,ord) WHERE o."sectorCode"='HEALTH_CARE'
ON CONFLICT ("organizationId","departmentCode") DO NOTHING;

INSERT INTO "HealthSpecialty" ("id","organizationId","code","labelFr","labelEn","isGlobal","isActive","sortOrder","createdAt","updatedAt")
SELECT CONCAT('health-specialty-',o."id",'-',s.code),o."id",s.code,s.fr,s.en,true,true,s.ord,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "Organization" o CROSS JOIN (VALUES
('GENERAL_MEDICINE','Médecine générale','General medicine',10),('PEDIATRICS','Pédiatrie','Pediatrics',20),('GYNECOLOGY_OBSTETRICS','Gynécologie-obstétrique','Gynecology and obstetrics',30),
('INTERNAL_MEDICINE','Médecine interne','Internal medicine',40),('SURGERY','Chirurgie','Surgery',50),('CARDIOLOGY','Cardiologie','Cardiology',60),
('DERMATOLOGY','Dermatologie','Dermatology',70),('ENT','ORL','ENT',80),('OPHTHALMOLOGY','Ophtalmologie','Ophthalmology',90),('NEUROLOGY','Neurologie','Neurology',100),
('PSYCHIATRY','Psychiatrie','Psychiatry',110),('LABORATORY','Laboratoire','Laboratory',120),('PHARMACY','Pharmacie','Pharmacy',130),
('NURSING','Soins infirmiers','Nursing',140),('EMERGENCY','Urgences','Emergency',150),('PUBLIC_HEALTH','Santé publique','Public health',160),('OTHER','Autre','Other',170)
) AS s(code,fr,en,ord) WHERE o."sectorCode"='HEALTH_CARE'
ON CONFLICT ("organizationId","code") DO NOTHING;

INSERT INTO "EnterprisePosition" ("id","organizationId","sectorId","positionCode","labelFr","labelEn","departmentId","hierarchyLevel","permissionsJson","isActive","isKeyPosition","createdAt","updatedAt")
SELECT CONCAT('health-position-',o."id",'-',p.code),o."id",o."sectorId",p.code,p.fr,p.en,d."id",p.level,p.permissions::jsonb,true,p.is_key,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
('SPECIALIST_DOCTOR','Médecin spécialiste','Specialist doctor','SPECIALIZED_CONSULTATION',30,true,'["health.staff.view","health.appointments.view","health.consultations.view","health.consultations.view_sensitive","health.medical_records.view","health.medical_records.view_sensitive"]'),
('HEAD_NURSE','Infirmier chef','Head nurse','NURSING_CARE',35,true,'["health.staff.view","health.staff.manage_availability","health.appointments.view","health.consultations.view","health.medical_records.view"]'),
('LAB_MANAGER','Responsable laboratoire','Laboratory manager','LABORATORY',30,true,'["health.staff.view","health.laboratory.view"]'),
('ASSISTANT_PHARMACIST','Assistant pharmacien','Assistant pharmacist','INTERNAL_PHARMACY',50,false,'["health.staff.view","health.internal_pharmacy.view"]'),
('MEDICAL_ARCHIVIST','Archiviste médical','Medical archivist','MEDICAL_ARCHIVES',55,false,'["health.staff.view","health.medical_records.view"]'),
('BIOMEDICAL_TECHNICIAN','Technicien biomédical','Biomedical technician','HEALTH_ADMINISTRATION',55,false,'["health.staff.view"]'),
('OTHER_HEALTH_PROFESSIONAL','Autre professionnel santé','Other health professional','HEALTH_ADMINISTRATION',60,false,'["health.staff.view"]')
) AS p(code,fr,en,dept,level,is_key,permissions)
LEFT JOIN "EnterpriseDepartment" d ON d."organizationId"=o."id" AND d."departmentCode"=p.dept
WHERE o."sectorCode"='HEALTH_CARE'
ON CONFLICT ("organizationId","positionCode") DO NOTHING;

-- Permissions Équipe médicale sur les postes Santé existants.
UPDATE "EnterprisePosition" SET "permissionsJson"=(SELECT jsonb_agg(DISTINCT permission) FROM jsonb_array_elements(COALESCE("permissionsJson",'[]'::jsonb)||CASE "positionCode"
 WHEN 'MEDICAL_DIRECTOR' THEN '["health.staff.view","health.staff.create","health.staff.update","health.staff.suspend","health.staff.archive","health.staff.manage_availability","health.staff.manage_permissions","health.staff.view_permissions","health.staff.view_activity","health.staff.manage_specialties","health.medical_records.view_sensitive","health.medical_records.confidential_notes"]'::jsonb
 WHEN 'ADMIN_MANAGER' THEN '["health.staff.view","health.staff.create","health.staff.update","health.staff.manage_availability","health.staff.view_permissions"]'::jsonb
 WHEN 'DOCTOR' THEN '["health.staff.view","health.staff.view_activity","health.medical_records.view_sensitive","health.medical_records.confidential_notes"]'::jsonb
 WHEN 'NURSE' THEN '["health.staff.view","health.medical_records.view_sensitive"]'::jsonb
 ELSE '["health.staff.view"]'::jsonb END) permission),"updatedAt"=CURRENT_TIMESTAMP
WHERE "organizationId" IN (SELECT "id" FROM "Organization" WHERE "sectorCode"='HEALTH_CARE');
