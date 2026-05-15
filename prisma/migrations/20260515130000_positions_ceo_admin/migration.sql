-- Centralise les postes DTSC, relie les dossiers RH aux postes officiels
-- et ajoute les registres exécutifs CEO sans migration destructive.

CREATE TABLE "DtscPosition" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "hierarchyLevel" INTEGER NOT NULL DEFAULT 50,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "permissions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DtscPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DtscPosition_code_key" ON "DtscPosition"("code");
CREATE INDEX "DtscPosition_status_code_idx" ON "DtscPosition"("status", "code");
CREATE INDEX "DtscPosition_departmentId_idx" ON "DtscPosition"("departmentId");

ALTER TABLE "DtscPosition"
  ADD CONSTRAINT "DtscPosition_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "DtscPosition" ("id", "title", "code", "description", "hierarchyLevel", "status", "permissions", "updatedAt")
VALUES
  ('pos-ceo', 'CEO', 'CEO', 'Direction générale, supervision stratégique et arbitrage exécutif.', 1, 'ACTIVE', 'CEO_SUPERVISION', CURRENT_TIMESTAMP),
  ('pos-coo', 'COO', 'COO', 'Pilotage opérationnel, coordination interne, tâches, workflows et blocages.', 2, 'ACTIVE', 'COO_OPERATIONS', CURRENT_TIMESTAMP),
  ('pos-cto', 'CTO', 'CTO', 'Direction technique, architecture, cybersécurité et delivery technologique.', 3, 'ACTIVE', 'CTO_TECH', CURRENT_TIMESTAMP),
  ('pos-sco', 'SCO', 'SCO', 'Gestion commerciale, fournisseurs, achats, stocks, actifs et logistique.', 3, 'ACTIVE', 'SCO_OPERATIONS', CURRENT_TIMESTAMP),
  ('pos-mpo', 'MPO', 'MPO', 'Marketing, production de contenus, communication et performance digitale.', 4, 'ACTIVE', 'MPO_MARKETING', CURRENT_TIMESTAMP),
  ('pos-hr-cfo', 'RH & CFO', 'HR_CFO', 'Ressources humaines, finances, budgets, transactions, paie et contrôle.', 3, 'ACTIVE', 'HR_CFO_FINANCE', CURRENT_TIMESTAMP),
  ('pos-hr-manager', 'Responsable RH', 'HR_MANAGER', 'Suivi administratif RH, conformité et dossiers collaborateurs.', 5, 'ACTIVE', 'HR_MANAGEMENT', CURRENT_TIMESTAMP),
  ('pos-finance-manager', 'Responsable Finance', 'FINANCE_MANAGER', 'Suivi financier, paiements, budgets et contrôle interne.', 5, 'ACTIVE', 'FINANCE_MANAGEMENT', CURRENT_TIMESTAMP),
  ('pos-commercial-manager', 'Responsable Commercial', 'COMMERCIAL_MANAGER', 'Prospection, relation client, offres et ventes.', 5, 'ACTIVE', 'COMMERCIAL_MANAGEMENT', CURRENT_TIMESTAMP),
  ('pos-technical-manager', 'Responsable Technique', 'TECHNICAL_MANAGER', 'Encadrement technique, qualité et livraisons numériques.', 5, 'ACTIVE', 'TECHNICAL_MANAGEMENT', CURRENT_TIMESTAMP),
  ('pos-marketing-manager', 'Responsable Marketing', 'MARKETING_MANAGER', 'Campagnes, contenus, visibilité et acquisition.', 5, 'ACTIVE', 'MARKETING_MANAGEMENT', CURRENT_TIMESTAMP),
  ('pos-support-manager', 'Responsable Support Client', 'SUPPORT_MANAGER', 'Support, tickets, satisfaction et résolution client.', 5, 'ACTIVE', 'SUPPORT_MANAGEMENT', CURRENT_TIMESTAMP),
  ('pos-collaborator', 'Collaborateur', 'COLLABORATOR', 'Collaborateur interne DTSC impliqué dans les activités assignées.', 10, 'ACTIVE', 'COLLABORATION', CURRENT_TIMESTAMP),
  ('pos-consultant', 'Consultant', 'CONSULTANT', 'Consultant DTSC pour les missions clients, data, IA et transformation.', 10, 'ACTIVE', 'CONSULTING', CURRENT_TIMESTAMP),
  ('pos-admin-assistant', 'Assistant Administratif', 'ADMIN_ASSISTANT', 'Assistance administrative, suivi documentaire et coordination.', 10, 'ACTIVE', 'ADMIN_ASSISTANCE', CURRENT_TIMESTAMP),
  ('pos-operations-agent', 'Agent Opérationnel', 'OPERATIONS_AGENT', 'Exécution opérationnelle, logistique et suivi quotidien.', 10, 'ACTIVE', 'OPERATIONS_EXECUTION', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "HrcfoEmployee"
  ADD COLUMN "positionId" TEXT,
  ADD COLUMN "positionCode" TEXT,
  ADD COLUMN "positionTitle" TEXT;

UPDATE "HrcfoEmployee" employee
SET
  "positionId" = position."id",
  "positionCode" = position."code",
  "positionTitle" = position."title"
FROM "DtscPosition" position
WHERE
  employee."positionId" IS NULL
  AND (
    LOWER(TRIM(employee."jobTitle")) = LOWER(TRIM(position."title"))
    OR LOWER(TRIM(employee."jobTitle")) = LOWER(REPLACE(position."code", '_', ' '))
    OR LOWER(REPLACE(TRIM(employee."jobTitle"), ' & ', '_')) = LOWER(position."code")
  );

UPDATE "HrcfoEmployee" employee
SET
  "positionId" = 'pos-collaborator',
  "positionCode" = 'COLLABORATOR',
  "positionTitle" = 'Collaborateur'
WHERE employee."positionId" IS NULL;

CREATE INDEX "HrcfoEmployee_positionId_idx" ON "HrcfoEmployee"("positionId");
CREATE INDEX "HrcfoEmployee_positionCode_idx" ON "HrcfoEmployee"("positionCode");

ALTER TABLE "HrcfoEmployee"
  ADD CONSTRAINT "HrcfoEmployee_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "DtscPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CeoObjective" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "objectiveType" TEXT NOT NULL DEFAULT 'STRATEGIC',
  "departmentId" TEXT,
  "departmentName" TEXT,
  "responsibleEmployeeId" TEXT,
  "responsibleName" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "targetValue" DECIMAL(12,2),
  "currentValue" DECIMAL(12,2),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CeoObjective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CeoObjective_status_priority_idx" ON "CeoObjective"("status", "priority");
CREATE INDEX "CeoObjective_objectiveType_idx" ON "CeoObjective"("objectiveType");
CREATE INDEX "CeoObjective_departmentId_idx" ON "CeoObjective"("departmentId");
CREATE INDEX "CeoObjective_responsibleEmployeeId_idx" ON "CeoObjective"("responsibleEmployeeId");
CREATE INDEX "CeoObjective_periodEnd_idx" ON "CeoObjective"("periodEnd");

ALTER TABLE "CeoObjective"
  ADD CONSTRAINT "CeoObjective_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CeoSupervisionLog" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "entryType" TEXT NOT NULL DEFAULT 'OBSERVATION',
  "description" TEXT,
  "departmentId" TEXT,
  "departmentName" TEXT,
  "employeeId" TEXT,
  "employeeName" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "logDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedAction" TEXT,
  "followUpResponsibleId" TEXT,
  "followUpResponsibleName" TEXT,
  "comments" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CeoSupervisionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CeoSupervisionLog_entryType_status_idx" ON "CeoSupervisionLog"("entryType", "status");
CREATE INDEX "CeoSupervisionLog_departmentId_idx" ON "CeoSupervisionLog"("departmentId");
CREATE INDEX "CeoSupervisionLog_employeeId_idx" ON "CeoSupervisionLog"("employeeId");
CREATE INDEX "CeoSupervisionLog_priority_idx" ON "CeoSupervisionLog"("priority");
CREATE INDEX "CeoSupervisionLog_logDate_idx" ON "CeoSupervisionLog"("logDate");

ALTER TABLE "CeoSupervisionLog"
  ADD CONSTRAINT "CeoSupervisionLog_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
