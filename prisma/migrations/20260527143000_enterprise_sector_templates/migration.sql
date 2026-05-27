-- Non-destructive sector templates for isolated enterprise workspaces.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "sectorId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "sectorCode" TEXT;

CREATE TABLE IF NOT EXISTS "BusinessSector" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "isicReferenceCode" TEXT,
  "icon" TEXT,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessSector_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SectorTemplate" (
  "id" TEXT NOT NULL,
  "sectorId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SectorTemplateModule" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "moduleCategory" TEXT NOT NULL,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "requiresPlanLevel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorTemplateModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SectorTemplatePosition" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "positionCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "departmentCode" TEXT,
  "hierarchyLevel" INTEGER NOT NULL DEFAULT 50,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "defaultPermissionsJson" JSONB,
  "isKeyPosition" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorTemplatePosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SectorTemplateDepartment" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "departmentCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorTemplateDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SectorTemplateActivityBlock" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "blockCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "targetModuleCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorTemplateActivityBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SectorTemplateWorkflow" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "workflowCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "stepsJson" JSONB,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorTemplateWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseModule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sectorId" TEXT,
  "moduleCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "moduleCategory" TEXT NOT NULL,
  "icon" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isCore" BOOLEAN NOT NULL DEFAULT false,
  "sourceTemplateId" TEXT,
  "requiresPlanLevel" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseAdminSection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "sectionCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "icon" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "requiredPermission" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sourceTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseAdminSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseDepartment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sourceTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterprisePosition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sectorId" TEXT,
  "positionCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "departmentId" TEXT,
  "hierarchyLevel" INTEGER NOT NULL DEFAULT 50,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "permissionsJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isKeyPosition" BOOLEAN NOT NULL DEFAULT false,
  "sourceTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterprisePosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseActivityBlock" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sectorId" TEXT,
  "blockCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "icon" TEXT,
  "targetModuleCode" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "requiredPermission" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sourceTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseActivityBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseWorkflow" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workflowCode" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "labelEn" TEXT NOT NULL,
  "descriptionFr" TEXT,
  "descriptionEn" TEXT,
  "stepsJson" JSONB,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sourceTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnterpriseActivityRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "targetModuleCode" TEXT,
  "assignedToUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseActivityRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessSector_code_key" ON "BusinessSector"("code");
CREATE INDEX IF NOT EXISTS "BusinessSector_isActive_sortOrder_idx" ON "BusinessSector"("isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "Organization_sectorId_idx" ON "Organization"("sectorId");
CREATE INDEX IF NOT EXISTS "Organization_sectorCode_idx" ON "Organization"("sectorCode");

CREATE UNIQUE INDEX IF NOT EXISTS "SectorTemplate_sectorId_version_key" ON "SectorTemplate"("sectorId", "version");
CREATE INDEX IF NOT EXISTS "SectorTemplate_sectorId_isActive_idx" ON "SectorTemplate"("sectorId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "SectorTemplateModule_templateId_moduleCode_key" ON "SectorTemplateModule"("templateId", "moduleCode");
CREATE INDEX IF NOT EXISTS "SectorTemplateModule_moduleCode_idx" ON "SectorTemplateModule"("moduleCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SectorTemplatePosition_templateId_positionCode_key" ON "SectorTemplatePosition"("templateId", "positionCode");
CREATE INDEX IF NOT EXISTS "SectorTemplatePosition_positionCode_idx" ON "SectorTemplatePosition"("positionCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SectorTemplateDepartment_templateId_departmentCode_key" ON "SectorTemplateDepartment"("templateId", "departmentCode");
CREATE INDEX IF NOT EXISTS "SectorTemplateDepartment_departmentCode_idx" ON "SectorTemplateDepartment"("departmentCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SectorTemplateActivityBlock_templateId_blockCode_key" ON "SectorTemplateActivityBlock"("templateId", "blockCode");
CREATE INDEX IF NOT EXISTS "SectorTemplateActivityBlock_blockCode_idx" ON "SectorTemplateActivityBlock"("blockCode");
CREATE UNIQUE INDEX IF NOT EXISTS "SectorTemplateWorkflow_templateId_workflowCode_key" ON "SectorTemplateWorkflow"("templateId", "workflowCode");
CREATE INDEX IF NOT EXISTS "SectorTemplateWorkflow_workflowCode_idx" ON "SectorTemplateWorkflow"("workflowCode");

CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseModule_organizationId_moduleCode_key" ON "EnterpriseModule"("organizationId", "moduleCode");
CREATE INDEX IF NOT EXISTS "EnterpriseModule_organizationId_idx" ON "EnterpriseModule"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterpriseModule_sectorId_idx" ON "EnterpriseModule"("sectorId");
CREATE INDEX IF NOT EXISTS "EnterpriseModule_moduleCode_idx" ON "EnterpriseModule"("moduleCode");
CREATE INDEX IF NOT EXISTS "EnterpriseModule_isEnabled_idx" ON "EnterpriseModule"("isEnabled");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseAdminSection_organizationId_sectionCode_key" ON "EnterpriseAdminSection"("organizationId", "sectionCode");
CREATE INDEX IF NOT EXISTS "EnterpriseAdminSection_organizationId_idx" ON "EnterpriseAdminSection"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterpriseAdminSection_moduleId_idx" ON "EnterpriseAdminSection"("moduleId");
CREATE INDEX IF NOT EXISTS "EnterpriseAdminSection_sectionCode_idx" ON "EnterpriseAdminSection"("sectionCode");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseDepartment_organizationId_departmentCode_key" ON "EnterpriseDepartment"("organizationId", "departmentCode");
CREATE INDEX IF NOT EXISTS "EnterpriseDepartment_organizationId_idx" ON "EnterpriseDepartment"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterpriseDepartment_departmentCode_idx" ON "EnterpriseDepartment"("departmentCode");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterprisePosition_organizationId_positionCode_key" ON "EnterprisePosition"("organizationId", "positionCode");
CREATE INDEX IF NOT EXISTS "EnterprisePosition_organizationId_idx" ON "EnterprisePosition"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterprisePosition_sectorId_idx" ON "EnterprisePosition"("sectorId");
CREATE INDEX IF NOT EXISTS "EnterprisePosition_positionCode_idx" ON "EnterprisePosition"("positionCode");
CREATE INDEX IF NOT EXISTS "EnterprisePosition_departmentId_idx" ON "EnterprisePosition"("departmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseActivityBlock_organizationId_blockCode_key" ON "EnterpriseActivityBlock"("organizationId", "blockCode");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityBlock_organizationId_idx" ON "EnterpriseActivityBlock"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityBlock_sectorId_idx" ON "EnterpriseActivityBlock"("sectorId");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityBlock_blockCode_idx" ON "EnterpriseActivityBlock"("blockCode");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseWorkflow_organizationId_workflowCode_key" ON "EnterpriseWorkflow"("organizationId", "workflowCode");
CREATE INDEX IF NOT EXISTS "EnterpriseWorkflow_organizationId_idx" ON "EnterpriseWorkflow"("organizationId");
CREATE INDEX IF NOT EXISTS "EnterpriseWorkflow_workflowCode_idx" ON "EnterpriseWorkflow"("workflowCode");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityRequest_organizationId_status_createdAt_idx" ON "EnterpriseActivityRequest"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityRequest_organizationId_blockCode_idx" ON "EnterpriseActivityRequest"("organizationId", "blockCode");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityRequest_createdById_createdAt_idx" ON "EnterpriseActivityRequest"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "EnterpriseActivityRequest_assignedToUserId_status_idx" ON "EnterpriseActivityRequest"("assignedToUserId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Organization_sectorId_fkey') THEN
    ALTER TABLE "Organization" ADD CONSTRAINT "Organization_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "BusinessSector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SectorTemplate_sectorId_fkey') THEN
    ALTER TABLE "SectorTemplate" ADD CONSTRAINT "SectorTemplate_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "BusinessSector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SectorTemplateModule_templateId_fkey') THEN
    ALTER TABLE "SectorTemplateModule" ADD CONSTRAINT "SectorTemplateModule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SectorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SectorTemplatePosition_templateId_fkey') THEN
    ALTER TABLE "SectorTemplatePosition" ADD CONSTRAINT "SectorTemplatePosition_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SectorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SectorTemplateDepartment_templateId_fkey') THEN
    ALTER TABLE "SectorTemplateDepartment" ADD CONSTRAINT "SectorTemplateDepartment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SectorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SectorTemplateActivityBlock_templateId_fkey') THEN
    ALTER TABLE "SectorTemplateActivityBlock" ADD CONSTRAINT "SectorTemplateActivityBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SectorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SectorTemplateWorkflow_templateId_fkey') THEN
    ALTER TABLE "SectorTemplateWorkflow" ADD CONSTRAINT "SectorTemplateWorkflow_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SectorTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseModule_organizationId_fkey') THEN
    ALTER TABLE "EnterpriseModule" ADD CONSTRAINT "EnterpriseModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseModule_sectorId_fkey') THEN
    ALTER TABLE "EnterpriseModule" ADD CONSTRAINT "EnterpriseModule_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "BusinessSector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseModule_sourceTemplateId_fkey') THEN
    ALTER TABLE "EnterpriseModule" ADD CONSTRAINT "EnterpriseModule_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "SectorTemplateModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseAdminSection_organizationId_fkey') THEN
    ALTER TABLE "EnterpriseAdminSection" ADD CONSTRAINT "EnterpriseAdminSection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseAdminSection_moduleId_fkey') THEN
    ALTER TABLE "EnterpriseAdminSection" ADD CONSTRAINT "EnterpriseAdminSection_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "EnterpriseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseAdminSection_sourceTemplateId_fkey') THEN
    ALTER TABLE "EnterpriseAdminSection" ADD CONSTRAINT "EnterpriseAdminSection_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "SectorTemplateModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseDepartment_organizationId_fkey') THEN
    ALTER TABLE "EnterpriseDepartment" ADD CONSTRAINT "EnterpriseDepartment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseDepartment_sourceTemplateId_fkey') THEN
    ALTER TABLE "EnterpriseDepartment" ADD CONSTRAINT "EnterpriseDepartment_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "SectorTemplateDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterprisePosition_organizationId_fkey') THEN
    ALTER TABLE "EnterprisePosition" ADD CONSTRAINT "EnterprisePosition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterprisePosition_sectorId_fkey') THEN
    ALTER TABLE "EnterprisePosition" ADD CONSTRAINT "EnterprisePosition_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "BusinessSector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterprisePosition_departmentId_fkey') THEN
    ALTER TABLE "EnterprisePosition" ADD CONSTRAINT "EnterprisePosition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "EnterpriseDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterprisePosition_sourceTemplateId_fkey') THEN
    ALTER TABLE "EnterprisePosition" ADD CONSTRAINT "EnterprisePosition_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "SectorTemplatePosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseActivityBlock_organizationId_fkey') THEN
    ALTER TABLE "EnterpriseActivityBlock" ADD CONSTRAINT "EnterpriseActivityBlock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseActivityBlock_sectorId_fkey') THEN
    ALTER TABLE "EnterpriseActivityBlock" ADD CONSTRAINT "EnterpriseActivityBlock_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "BusinessSector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseActivityBlock_sourceTemplateId_fkey') THEN
    ALTER TABLE "EnterpriseActivityBlock" ADD CONSTRAINT "EnterpriseActivityBlock_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "SectorTemplateActivityBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseWorkflow_organizationId_fkey') THEN
    ALTER TABLE "EnterpriseWorkflow" ADD CONSTRAINT "EnterpriseWorkflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseWorkflow_sourceTemplateId_fkey') THEN
    ALTER TABLE "EnterpriseWorkflow" ADD CONSTRAINT "EnterpriseWorkflow_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "SectorTemplateWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseActivityRequest_organizationId_fkey') THEN
    ALTER TABLE "EnterpriseActivityRequest" ADD CONSTRAINT "EnterpriseActivityRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseActivityRequest_blockId_fkey') THEN
    ALTER TABLE "EnterpriseActivityRequest" ADD CONSTRAINT "EnterpriseActivityRequest_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "EnterpriseActivityBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseActivityRequest_createdById_fkey') THEN
    ALTER TABLE "EnterpriseActivityRequest" ADD CONSTRAINT "EnterpriseActivityRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

WITH sectors AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"HEALTH_CARE","labelFr":"Santé / clinique / hôpital / cabinet médical","labelEn":"Healthcare","descriptionFr":"Structures de santé, soins, rendez-vous, dossiers médicaux et confidentialité.","descriptionEn":"Healthcare facilities, care, appointments, medical records and confidentiality.","isic":"Q","icon":"heart-pulse","color":"#06b6d4","sortOrder":10},
    {"code":"PHARMACY","labelFr":"Pharmacie","labelEn":"Pharmacy","descriptionFr":"Officine, produits, stocks, lots, ventes et alertes de péremption.","descriptionEn":"Pharmacy, products, stock, batches, sales and expiry alerts.","isic":"G","icon":"pill","color":"#10b981","sortOrder":20},
    {"code":"INSURANCE","labelFr":"Assurance","labelEn":"Insurance","descriptionFr":"Polices, primes, sinistres, prestataires, conformité et audit.","descriptionEn":"Policies, premiums, claims, providers, compliance and audit.","isic":"K","icon":"shield-check","color":"#6366f1","sortOrder":30},
    {"code":"EDUCATION","labelFr":"Éducation / école / université / formation","labelEn":"Education","descriptionFr":"Écoles, cours, enseignants, élèves, notes et rapports académiques.","descriptionEn":"Schools, courses, teachers, students, grades and academic reporting.","isic":"P","icon":"graduation-cap","color":"#f59e0b","sortOrder":40},
    {"code":"COMMERCE_RETAIL","labelFr":"Commerce / distribution / vente","labelEn":"Commerce & Retail","descriptionFr":"Ventes, caisse, clients, produits, stocks, achats et promotions.","descriptionEn":"Sales, cashier, customers, products, stock, purchases and promotions.","isic":"G","icon":"shopping-bag","color":"#22c55e","sortOrder":50},
    {"code":"PROFESSIONAL_SERVICES","labelFr":"Services professionnels / consulting / cabinet","labelEn":"Professional Services","descriptionFr":"Missions client, contrats, temps travaillé, livrables et facturation.","descriptionEn":"Client missions, contracts, timesheets, deliverables and invoicing.","isic":"M","icon":"briefcase-business","color":"#0ea5e9","sortOrder":60},
    {"code":"NGO_ASBL","labelFr":"ONG / ASBL / projets sociaux","labelEn":"NGO / Non-profit","descriptionFr":"Programmes, bénéficiaires, indicateurs, justificatifs et rapports bailleurs.","descriptionEn":"Programs, beneficiaries, indicators, supporting documents and donor reports.","isic":"S","icon":"hand-heart","color":"#14b8a6","sortOrder":70},
    {"code":"TRANSPORT_LOGISTICS","labelFr":"Transport & logistique","labelEn":"Transport & Logistics","descriptionFr":"Flotte, chauffeurs, missions, livraisons, maintenance et carburant.","descriptionEn":"Fleet, drivers, missions, deliveries, maintenance and fuel.","isic":"H","icon":"truck","color":"#f97316","sortOrder":80},
    {"code":"CONSTRUCTION_REAL_ESTATE","labelFr":"Construction / immobilier / chantiers","labelEn":"Construction & Real Estate","descriptionFr":"Chantiers, matériaux, avancement, sécurité, documents techniques et actifs.","descriptionEn":"Sites, materials, progress, safety, technical documents and assets.","isic":"F","icon":"hard-hat","color":"#eab308","sortOrder":90},
    {"code":"TECH_DIGITAL","labelFr":"Technologie / services numériques","labelEn":"Technology & Digital Services","descriptionFr":"Projets numériques, tickets, bugs, déploiements, APIs et documentation.","descriptionEn":"Digital projects, tickets, bugs, deployments, APIs and documentation.","isic":"J","icon":"code-2","color":"#38bdf8","sortOrder":100},
    {"code":"MANUFACTURING","labelFr":"Industrie / production","labelEn":"Manufacturing","descriptionFr":"Ordres de production, matières, qualité, maintenance et traçabilité.","descriptionEn":"Production orders, materials, quality, maintenance and traceability.","isic":"C","icon":"factory","color":"#64748b","sortOrder":110},
    {"code":"AGRI_FOOD","labelFr":"Agriculture / agroalimentaire","labelEn":"Agriculture & Agri-food","descriptionFr":"Parcelles, intrants, récoltes, transformation, qualité et distribution.","descriptionEn":"Plots, inputs, harvests, processing, quality and distribution.","isic":"A","icon":"wheat","color":"#84cc16","sortOrder":120},
    {"code":"HOSPITALITY_EVENTS","labelFr":"Hôtellerie / restauration / événementiel","labelEn":"Hospitality & Events","descriptionFr":"Réservations, services, événements, caisse, stocks cuisine et incidents.","descriptionEn":"Bookings, services, events, cashier, kitchen stock and incidents.","isic":"I","icon":"concierge-bell","color":"#ec4899","sortOrder":130},
    {"code":"FINANCE_MICROFINANCE","labelFr":"Finance / microfinance","labelEn":"Finance & Microfinance","descriptionFr":"Comptes, transactions, crédits, recouvrement, risques et KYC.","descriptionEn":"Accounts, transactions, credit, collections, risk and KYC.","isic":"K","icon":"landmark","color":"#8b5cf6","sortOrder":140},
    {"code":"PUBLIC_ADMIN","labelFr":"Administration publique / institution","labelEn":"Public Administration","descriptionFr":"Services, demandes citoyennes, dossiers, courriers, décisions et archives.","descriptionEn":"Services, citizen requests, cases, letters, decisions and archives.","isic":"O","icon":"building-2","color":"#0f766e","sortOrder":150},
    {"code":"OTHER","labelFr":"Autre secteur","labelEn":"Other","descriptionFr":"Socle commun configurable pour les secteurs non encore spécialisés.","descriptionEn":"Configurable common base for sectors not yet specialized.","isic":null,"icon":"layers","color":"#94a3b8","sortOrder":160}
  ]'::jsonb) AS x("code" TEXT, "labelFr" TEXT, "labelEn" TEXT, "descriptionFr" TEXT, "descriptionEn" TEXT, "isic" TEXT, "icon" TEXT, "color" TEXT, "sortOrder" INTEGER)
)
INSERT INTO "BusinessSector" ("id", "code", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "isicReferenceCode", "icon", "color", "isActive", "sortOrder")
SELECT CONCAT('sector-', LOWER(REPLACE("code", '_', '-'))), "code", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "isic", "icon", "color", true, "sortOrder"
FROM sectors
ON CONFLICT ("code") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "isicReferenceCode" = EXCLUDED."isicReferenceCode",
  "icon" = EXCLUDED."icon",
  "color" = EXCLUDED."color",
  "isActive" = true,
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "SectorTemplate" ("id", "sectorId", "version", "label", "description", "isActive")
SELECT CONCAT('template-', LOWER(REPLACE("code", '_', '-')), '-v1'), "id", 1, CONCAT("labelFr", ' · v1'), CONCAT('Modèle sectoriel DTSC inspiré des standards institutionnels applicables à ', "labelFr"), true
FROM "BusinessSector"
ON CONFLICT ("sectorId", "version") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

WITH core_modules AS (
  SELECT * FROM jsonb_to_recordset('[
    {"moduleCode":"ADMIN_DASHBOARD","labelFr":"Tableau de bord entreprise","labelEn":"Enterprise dashboard","category":"CORE","icon":"layout-dashboard","sortOrder":10},
    {"moduleCode":"COLLABORATORS_POSITIONS","labelFr":"Collaborateurs & postes","labelEn":"Collaborators & positions","category":"CORE","icon":"users-round","sortOrder":20},
    {"moduleCode":"DEPARTMENTS","labelFr":"Départements / services","labelEn":"Departments / services","category":"CORE","icon":"building-2","sortOrder":30},
    {"moduleCode":"PERMISSIONS","labelFr":"Rôles & permissions","labelEn":"Roles & permissions","category":"CORE","icon":"shield-check","sortOrder":40},
    {"moduleCode":"TASKS_OPERATIONS","labelFr":"Tâches & opérations","labelEn":"Tasks & operations","category":"CORE","icon":"list-checks","sortOrder":50},
    {"moduleCode":"MEETINGS","labelFr":"Réunions & comptes rendus","labelEn":"Meetings & minutes","category":"CORE","icon":"calendar-days","sortOrder":60},
    {"moduleCode":"INTERNAL_REQUESTS","labelFr":"Demandes internes","labelEn":"Internal requests","category":"CORE","icon":"inbox","sortOrder":70},
    {"moduleCode":"REPORTS","labelFr":"Rapports","labelEn":"Reports","category":"CORE","icon":"file-text","sortOrder":80},
    {"moduleCode":"DOCUMENTS","labelFr":"Documents","labelEn":"Documents","category":"CORE","icon":"folder","sortOrder":90},
    {"moduleCode":"FINANCE_BUDGETS","labelFr":"Finances & budgets","labelEn":"Finance & budgets","category":"CORE","icon":"wallet","sortOrder":100},
    {"moduleCode":"SUPPLIERS_PURCHASES","labelFr":"Fournisseurs & achats","labelEn":"Suppliers & purchases","category":"CORE","icon":"package-check","sortOrder":110},
    {"moduleCode":"WORKFLOWS","labelFr":"Workflows","labelEn":"Workflows","category":"CORE","icon":"workflow","sortOrder":120},
    {"moduleCode":"AUDIT_LOGS","labelFr":"Audit & historique","labelEn":"Audit & history","category":"CORE","icon":"history","sortOrder":130},
    {"moduleCode":"SETTINGS","labelFr":"Paramètres entreprise","labelEn":"Enterprise settings","category":"CORE","icon":"settings","sortOrder":140},
    {"moduleCode":"AI_ASSISTANT","labelFr":"IA Assistant Entreprise","labelEn":"Enterprise AI assistant","category":"CORE","icon":"bot","sortOrder":150}
  ]'::jsonb) AS x("moduleCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "category" TEXT, "icon" TEXT, "sortOrder" INTEGER)
)
INSERT INTO "SectorTemplateModule" ("id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder", "defaultEnabled")
SELECT CONCAT('stm-', t."id", '-', LOWER(REPLACE(m."moduleCode", '_', '-'))), t."id", m."moduleCode", m."labelFr", m."labelEn",
  CONCAT(m."labelFr", ' pour le socle commun entreprise.'), CONCAT(m."labelEn", ' for the enterprise common base.'),
  m."category", m."icon", m."sortOrder", true
FROM "SectorTemplate" t CROSS JOIN core_modules m
ON CONFLICT ("templateId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "moduleCategory" = EXCLUDED."moduleCategory",
  "icon" = EXCLUDED."icon", "sortOrder" = EXCLUDED."sortOrder", "defaultEnabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

WITH sector_modules AS (
  SELECT * FROM jsonb_to_recordset('[
    {"sectorCode":"HEALTH_CARE","moduleCode":"PATIENTS","labelFr":"Patients","labelEn":"Patients","category":"SECTOR","icon":"heart-pulse","sortOrder":210},{"sectorCode":"HEALTH_CARE","moduleCode":"APPOINTMENTS","labelFr":"Rendez-vous","labelEn":"Appointments","category":"SECTOR","icon":"calendar-check","sortOrder":220},{"sectorCode":"HEALTH_CARE","moduleCode":"CONSULTATIONS","labelFr":"Consultations","labelEn":"Consultations","category":"SECTOR","icon":"stethoscope","sortOrder":230},{"sectorCode":"HEALTH_CARE","moduleCode":"MEDICAL_RECORDS","labelFr":"Dossiers médicaux","labelEn":"Medical records","category":"SECTOR","icon":"file-heart","sortOrder":240},{"sectorCode":"HEALTH_CARE","moduleCode":"CARE_TEAM","labelFr":"Équipe de soins","labelEn":"Care team","category":"SECTOR","icon":"users-round","sortOrder":250},{"sectorCode":"HEALTH_CARE","moduleCode":"LABORATORY","labelFr":"Laboratoire","labelEn":"Laboratory","category":"SECTOR","icon":"microscope","sortOrder":260},{"sectorCode":"HEALTH_CARE","moduleCode":"INTERNAL_PHARMACY","labelFr":"Pharmacie interne","labelEn":"Internal pharmacy","category":"SECTOR","icon":"pill","sortOrder":270},{"sectorCode":"HEALTH_CARE","moduleCode":"MEDICAL_BILLING","labelFr":"Facturation médicale","labelEn":"Medical billing","category":"SECTOR","icon":"receipt","sortOrder":280},{"sectorCode":"HEALTH_CARE","moduleCode":"INSURANCE_COVERAGE","labelFr":"Prise en charge assurance","labelEn":"Insurance coverage","category":"SECTOR","icon":"shield-check","sortOrder":290},{"sectorCode":"HEALTH_CARE","moduleCode":"QUALITY_INCIDENTS","labelFr":"Incidents qualité","labelEn":"Quality incidents","category":"SECTOR","icon":"triangle-alert","sortOrder":300},{"sectorCode":"HEALTH_CARE","moduleCode":"MEDICAL_CONFIDENTIALITY","labelFr":"Confidentialité médicale","labelEn":"Medical confidentiality","category":"SECTOR","icon":"lock-keyhole","sortOrder":310},
    {"sectorCode":"PHARMACY","moduleCode":"MEDICINES_PRODUCTS","labelFr":"Médicaments & produits","labelEn":"Medicines & products","category":"SECTOR","icon":"pill","sortOrder":210},{"sectorCode":"PHARMACY","moduleCode":"SALES_CASHIER","labelFr":"Ventes & caisse","labelEn":"Sales & cashier","category":"SECTOR","icon":"receipt","sortOrder":220},{"sectorCode":"PHARMACY","moduleCode":"STOCK_INVENTORY","labelFr":"Stock & inventaire","labelEn":"Stock & inventory","category":"SECTOR","icon":"boxes","sortOrder":230},{"sectorCode":"PHARMACY","moduleCode":"BATCH_EXPIRY","labelFr":"Lots & péremption","labelEn":"Batch & expiry","category":"SECTOR","icon":"hourglass","sortOrder":240},{"sectorCode":"PHARMACY","moduleCode":"SUPPLIERS_ORDERS","labelFr":"Fournisseurs & commandes","labelEn":"Suppliers & orders","category":"SECTOR","icon":"package-check","sortOrder":250},{"sectorCode":"PHARMACY","moduleCode":"PRESCRIPTIONS","labelFr":"Ordonnances","labelEn":"Prescriptions","category":"SECTOR","icon":"clipboard-list","sortOrder":260},{"sectorCode":"PHARMACY","moduleCode":"PURCHASE_REQUESTS","labelFr":"Demandes d’achat","labelEn":"Purchase requests","category":"SECTOR","icon":"shopping-cart","sortOrder":270},{"sectorCode":"PHARMACY","moduleCode":"PHARMACY_REPORTS","labelFr":"Rapports pharmacie","labelEn":"Pharmacy reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":280},{"sectorCode":"PHARMACY","moduleCode":"ALERTS_EXPIRY_LOW_STOCK","labelFr":"Alertes péremption & stock faible","labelEn":"Expiry & low-stock alerts","category":"SECTOR","icon":"bell-ring","sortOrder":290},
    {"sectorCode":"INSURANCE","moduleCode":"CLIENTS_POLICYHOLDERS","labelFr":"Clients & assurés","labelEn":"Clients & policyholders","category":"SECTOR","icon":"users-round","sortOrder":210},{"sectorCode":"INSURANCE","moduleCode":"POLICIES","labelFr":"Polices","labelEn":"Policies","category":"SECTOR","icon":"file-badge","sortOrder":220},{"sectorCode":"INSURANCE","moduleCode":"PREMIUMS","labelFr":"Primes","labelEn":"Premiums","category":"SECTOR","icon":"wallet","sortOrder":230},{"sectorCode":"INSURANCE","moduleCode":"CLAIMS","labelFr":"Sinistres","labelEn":"Claims","category":"SECTOR","icon":"file-warning","sortOrder":240},{"sectorCode":"INSURANCE","moduleCode":"PROVIDERS","labelFr":"Prestataires","labelEn":"Providers","category":"SECTOR","icon":"network","sortOrder":250},{"sectorCode":"INSURANCE","moduleCode":"PREAUTHORIZATIONS","labelFr":"Préautorisations","labelEn":"Preauthorizations","category":"SECTOR","icon":"badge-check","sortOrder":260},{"sectorCode":"INSURANCE","moduleCode":"CLAIM_AUDIT","labelFr":"Audit sinistres","labelEn":"Claim audit","category":"SECTOR","icon":"search-check","sortOrder":270},{"sectorCode":"INSURANCE","moduleCode":"RISK_REPORTING","labelFr":"Reporting risques","labelEn":"Risk reporting","category":"SECTOR","icon":"activity","sortOrder":280},{"sectorCode":"INSURANCE","moduleCode":"COMPLIANCE","labelFr":"Conformité","labelEn":"Compliance","category":"SECTOR","icon":"shield-check","sortOrder":290},{"sectorCode":"INSURANCE","moduleCode":"CONTRACTS","labelFr":"Contrats","labelEn":"Contracts","category":"SECTOR","icon":"file-signature","sortOrder":300},
    {"sectorCode":"EDUCATION","moduleCode":"STUDENTS","labelFr":"Étudiants / élèves","labelEn":"Students","category":"SECTOR","icon":"users-round","sortOrder":210},{"sectorCode":"EDUCATION","moduleCode":"TEACHERS","labelFr":"Enseignants","labelEn":"Teachers","category":"SECTOR","icon":"graduation-cap","sortOrder":220},{"sectorCode":"EDUCATION","moduleCode":"CLASSES","labelFr":"Classes","labelEn":"Classes","category":"SECTOR","icon":"school","sortOrder":230},{"sectorCode":"EDUCATION","moduleCode":"COURSES","labelFr":"Cours","labelEn":"Courses","category":"SECTOR","icon":"book-open","sortOrder":240},{"sectorCode":"EDUCATION","moduleCode":"ATTENDANCE","labelFr":"Présences","labelEn":"Attendance","category":"SECTOR","icon":"clipboard-check","sortOrder":250},{"sectorCode":"EDUCATION","moduleCode":"EXAMS_GRADES","labelFr":"Examens & notes","labelEn":"Exams & grades","category":"SECTOR","icon":"file-check","sortOrder":260},{"sectorCode":"EDUCATION","moduleCode":"SCHOOL_FEES","labelFr":"Frais scolaires","labelEn":"School fees","category":"SECTOR","icon":"wallet","sortOrder":270},{"sectorCode":"EDUCATION","moduleCode":"PARENTS_GUARDIANS","labelFr":"Parents & tuteurs","labelEn":"Parents & guardians","category":"SECTOR","icon":"users","sortOrder":280},{"sectorCode":"EDUCATION","moduleCode":"DISCIPLINE","labelFr":"Discipline","labelEn":"Discipline","category":"SECTOR","icon":"scale","sortOrder":290},{"sectorCode":"EDUCATION","moduleCode":"ACADEMIC_REPORTS","labelFr":"Rapports académiques","labelEn":"Academic reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":300},
    {"sectorCode":"COMMERCE_RETAIL","moduleCode":"PRODUCTS","labelFr":"Produits","labelEn":"Products","category":"SECTOR","icon":"package","sortOrder":210},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"SALES","labelFr":"Ventes","labelEn":"Sales","category":"SECTOR","icon":"shopping-cart","sortOrder":220},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"CASH_REGISTER","labelFr":"Caisse","labelEn":"Cash register","category":"SECTOR","icon":"receipt","sortOrder":230},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"STOCK","labelFr":"Stock","labelEn":"Stock","category":"SECTOR","icon":"boxes","sortOrder":240},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"CUSTOMERS","labelFr":"Clients","labelEn":"Customers","category":"SECTOR","icon":"users-round","sortOrder":250},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"SUPPLIERS","labelFr":"Fournisseurs","labelEn":"Suppliers","category":"SECTOR","icon":"truck","sortOrder":260},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"PURCHASE_ORDERS","labelFr":"Commandes d’achat","labelEn":"Purchase orders","category":"SECTOR","icon":"file-plus","sortOrder":270},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"INVENTORY","labelFr":"Inventaire","labelEn":"Inventory","category":"SECTOR","icon":"clipboard-list","sortOrder":280},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"PROMOTIONS","labelFr":"Promotions","labelEn":"Promotions","category":"SECTOR","icon":"badge-percent","sortOrder":290},{"sectorCode":"COMMERCE_RETAIL","moduleCode":"SALES_REPORTS","labelFr":"Rapports de vente","labelEn":"Sales reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":300},
    {"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"CLIENTS","labelFr":"Clients","labelEn":"Clients","category":"SECTOR","icon":"users-round","sortOrder":210},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"CLIENT_FILES","labelFr":"Dossiers client","labelEn":"Client files","category":"SECTOR","icon":"folder","sortOrder":220},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"MISSIONS","labelFr":"Missions","labelEn":"Missions","category":"SECTOR","icon":"briefcase-business","sortOrder":230},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"CONTRACTS","labelFr":"Contrats","labelEn":"Contracts","category":"SECTOR","icon":"file-signature","sortOrder":240},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"TIMESHEETS","labelFr":"Temps travaillé","labelEn":"Timesheets","category":"SECTOR","icon":"clock","sortOrder":250},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"DELIVERABLES","labelFr":"Livrables","labelEn":"Deliverables","category":"SECTOR","icon":"file-check","sortOrder":260},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"INVOICING","labelFr":"Facturation","labelEn":"Invoicing","category":"SECTOR","icon":"receipt","sortOrder":270},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"EXPERT_REPORTS","labelFr":"Rapports d’expertise","labelEn":"Expert reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":280},{"sectorCode":"PROFESSIONAL_SERVICES","moduleCode":"KNOWLEDGE_BASE","labelFr":"Base de connaissances","labelEn":"Knowledge base","category":"SECTOR","icon":"book-open","sortOrder":290},
    {"sectorCode":"NGO_ASBL","moduleCode":"PROGRAMS_PROJECTS","labelFr":"Programmes & projets","labelEn":"Programs & projects","category":"SECTOR","icon":"folder-kanban","sortOrder":210},{"sectorCode":"NGO_ASBL","moduleCode":"BENEFICIARIES","labelFr":"Bénéficiaires","labelEn":"Beneficiaries","category":"SECTOR","icon":"users-round","sortOrder":220},{"sectorCode":"NGO_ASBL","moduleCode":"FIELD_ACTIVITIES","labelFr":"Activités terrain","labelEn":"Field activities","category":"SECTOR","icon":"map","sortOrder":230},{"sectorCode":"NGO_ASBL","moduleCode":"DONORS","labelFr":"Bailleurs","labelEn":"Donors","category":"SECTOR","icon":"hand-heart","sortOrder":240},{"sectorCode":"NGO_ASBL","moduleCode":"BUDGET_LINES","labelFr":"Lignes budgétaires","labelEn":"Budget lines","category":"SECTOR","icon":"wallet","sortOrder":250},{"sectorCode":"NGO_ASBL","moduleCode":"INDICATORS_ME","labelFr":"Indicateurs S&E","labelEn":"M&E indicators","category":"SECTOR","icon":"activity","sortOrder":260},{"sectorCode":"NGO_ASBL","moduleCode":"SUPPORTING_DOCUMENTS","labelFr":"Justificatifs","labelEn":"Supporting documents","category":"SECTOR","icon":"paperclip","sortOrder":270},{"sectorCode":"NGO_ASBL","moduleCode":"DONOR_REPORTS","labelFr":"Rapports bailleurs","labelEn":"Donor reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":280},{"sectorCode":"NGO_ASBL","moduleCode":"FIELD_INCIDENTS","labelFr":"Incidents terrain","labelEn":"Field incidents","category":"SECTOR","icon":"triangle-alert","sortOrder":290},{"sectorCode":"NGO_ASBL","moduleCode":"LOGFRAME","labelFr":"Cadre logique","labelEn":"Logframe","category":"SECTOR","icon":"workflow","sortOrder":300},
    {"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"FLEET","labelFr":"Flotte","labelEn":"Fleet","category":"SECTOR","icon":"truck","sortOrder":210},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"DRIVERS","labelFr":"Chauffeurs","labelEn":"Drivers","category":"SECTOR","icon":"user-round","sortOrder":220},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"TRANSPORT_MISSIONS","labelFr":"Missions transport","labelEn":"Transport missions","category":"SECTOR","icon":"route","sortOrder":230},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"DELIVERIES","labelFr":"Livraisons","labelEn":"Deliveries","category":"SECTOR","icon":"package-check","sortOrder":240},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"FUEL","labelFr":"Carburant","labelEn":"Fuel","category":"SECTOR","icon":"fuel","sortOrder":250},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"MAINTENANCE","labelFr":"Maintenance","labelEn":"Maintenance","category":"SECTOR","icon":"wrench","sortOrder":260},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"INCIDENTS","labelFr":"Incidents","labelEn":"Incidents","category":"SECTOR","icon":"triangle-alert","sortOrder":270},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"ROUTE_PLANNING","labelFr":"Planification itinéraires","labelEn":"Route planning","category":"SECTOR","icon":"map","sortOrder":280},{"sectorCode":"TRANSPORT_LOGISTICS","moduleCode":"LOGISTICS_REPORTS","labelFr":"Rapports logistiques","labelEn":"Logistics reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":290},
    {"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"CONSTRUCTION_SITES","labelFr":"Chantiers","labelEn":"Construction sites","category":"SECTOR","icon":"hard-hat","sortOrder":210},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"WORK_PACKAGES","labelFr":"Lots de travaux","labelEn":"Work packages","category":"SECTOR","icon":"boxes","sortOrder":220},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"TEAMS","labelFr":"Équipes","labelEn":"Teams","category":"SECTOR","icon":"users-round","sortOrder":230},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"MATERIALS","labelFr":"Matériaux","labelEn":"Materials","category":"SECTOR","icon":"package","sortOrder":240},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"SUBCONTRACTORS","labelFr":"Sous-traitants","labelEn":"Subcontractors","category":"SECTOR","icon":"network","sortOrder":250},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"QUOTES","labelFr":"Devis","labelEn":"Quotes","category":"SECTOR","icon":"file-text","sortOrder":260},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"SITE_PROGRESS","labelFr":"Avancement chantier","labelEn":"Site progress","category":"SECTOR","icon":"activity","sortOrder":270},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"TECHNICAL_DOCUMENTS","labelFr":"Documents techniques","labelEn":"Technical documents","category":"SECTOR","icon":"folder","sortOrder":280},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"SAFETY_INCIDENTS","labelFr":"Incidents sécurité","labelEn":"Safety incidents","category":"SECTOR","icon":"shield-alert","sortOrder":290},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","moduleCode":"REAL_ESTATE_ASSETS","labelFr":"Actifs immobiliers","labelEn":"Real estate assets","category":"SECTOR","icon":"building-2","sortOrder":300},
    {"sectorCode":"TECH_DIGITAL","moduleCode":"DIGITAL_PROJECTS","labelFr":"Projets numériques","labelEn":"Digital projects","category":"SECTOR","icon":"folder-kanban","sortOrder":210},{"sectorCode":"TECH_DIGITAL","moduleCode":"ROADMAP","labelFr":"Roadmap","labelEn":"Roadmap","category":"SECTOR","icon":"map","sortOrder":220},{"sectorCode":"TECH_DIGITAL","moduleCode":"TICKETS","labelFr":"Tickets","labelEn":"Tickets","category":"SECTOR","icon":"ticket","sortOrder":230},{"sectorCode":"TECH_DIGITAL","moduleCode":"BUGS","labelFr":"Bugs","labelEn":"Bugs","category":"SECTOR","icon":"bug","sortOrder":240},{"sectorCode":"TECH_DIGITAL","moduleCode":"DEPLOYMENTS","labelFr":"Déploiements","labelEn":"Deployments","category":"SECTOR","icon":"rocket","sortOrder":250},{"sectorCode":"TECH_DIGITAL","moduleCode":"REPOSITORIES","labelFr":"Référentiels code","labelEn":"Repositories","category":"SECTOR","icon":"git-branch","sortOrder":260},{"sectorCode":"TECH_DIGITAL","moduleCode":"APIS","labelFr":"APIs","labelEn":"APIs","category":"SECTOR","icon":"plug","sortOrder":270},{"sectorCode":"TECH_DIGITAL","moduleCode":"CLIENT_SUPPORT","labelFr":"Support client","labelEn":"Client support","category":"SECTOR","icon":"headphones","sortOrder":280},{"sectorCode":"TECH_DIGITAL","moduleCode":"TECH_DOCUMENTATION","labelFr":"Documentation technique","labelEn":"Technical documentation","category":"SECTOR","icon":"book-open","sortOrder":290},{"sectorCode":"TECH_DIGITAL","moduleCode":"RELEASE_NOTES","labelFr":"Notes de version","labelEn":"Release notes","category":"SECTOR","icon":"file-text","sortOrder":300},
    {"sectorCode":"MANUFACTURING","moduleCode":"PRODUCTION_ORDERS","labelFr":"Ordres de production","labelEn":"Production orders","category":"SECTOR","icon":"factory","sortOrder":210},{"sectorCode":"MANUFACTURING","moduleCode":"RAW_MATERIALS","labelFr":"Matières premières","labelEn":"Raw materials","category":"SECTOR","icon":"package","sortOrder":220},{"sectorCode":"MANUFACTURING","moduleCode":"FINISHED_PRODUCTS","labelFr":"Produits finis","labelEn":"Finished products","category":"SECTOR","icon":"package-check","sortOrder":230},{"sectorCode":"MANUFACTURING","moduleCode":"QUALITY_CONTROL","labelFr":"Contrôle qualité","labelEn":"Quality control","category":"SECTOR","icon":"badge-check","sortOrder":240},{"sectorCode":"MANUFACTURING","moduleCode":"MACHINE_MAINTENANCE","labelFr":"Maintenance machines","labelEn":"Machine maintenance","category":"SECTOR","icon":"wrench","sortOrder":250},{"sectorCode":"MANUFACTURING","moduleCode":"INVENTORY","labelFr":"Inventaire","labelEn":"Inventory","category":"SECTOR","icon":"clipboard-list","sortOrder":260},{"sectorCode":"MANUFACTURING","moduleCode":"BATCH_TRACEABILITY","labelFr":"Traçabilité lots","labelEn":"Batch traceability","category":"SECTOR","icon":"scan-line","sortOrder":270},{"sectorCode":"MANUFACTURING","moduleCode":"SUPPLIERS","labelFr":"Fournisseurs","labelEn":"Suppliers","category":"SECTOR","icon":"truck","sortOrder":280},{"sectorCode":"MANUFACTURING","moduleCode":"PRODUCTION_REPORTS","labelFr":"Rapports production","labelEn":"Production reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":290},
    {"sectorCode":"AGRI_FOOD","moduleCode":"FARMS_PLOTS","labelFr":"Exploitations & parcelles","labelEn":"Farms & plots","category":"SECTOR","icon":"map","sortOrder":210},{"sectorCode":"AGRI_FOOD","moduleCode":"INPUTS","labelFr":"Intrants","labelEn":"Inputs","category":"SECTOR","icon":"wheat","sortOrder":220},{"sectorCode":"AGRI_FOOD","moduleCode":"PRODUCTION","labelFr":"Production","labelEn":"Production","category":"SECTOR","icon":"sprout","sortOrder":230},{"sectorCode":"AGRI_FOOD","moduleCode":"HARVESTS","labelFr":"Récoltes","labelEn":"Harvests","category":"SECTOR","icon":"package-check","sortOrder":240},{"sectorCode":"AGRI_FOOD","moduleCode":"STOCKS","labelFr":"Stocks","labelEn":"Stocks","category":"SECTOR","icon":"boxes","sortOrder":250},{"sectorCode":"AGRI_FOOD","moduleCode":"PROCESSING","labelFr":"Transformation","labelEn":"Processing","category":"SECTOR","icon":"factory","sortOrder":260},{"sectorCode":"AGRI_FOOD","moduleCode":"QUALITY_FOOD_SAFETY","labelFr":"Qualité & sécurité alimentaire","labelEn":"Quality & food safety","category":"SECTOR","icon":"shield-check","sortOrder":270},{"sectorCode":"AGRI_FOOD","moduleCode":"DISTRIBUTION","labelFr":"Distribution","labelEn":"Distribution","category":"SECTOR","icon":"truck","sortOrder":280},{"sectorCode":"AGRI_FOOD","moduleCode":"FARMER_GROUPS","labelFr":"Groupes producteurs","labelEn":"Farmer groups","category":"SECTOR","icon":"users-round","sortOrder":290},{"sectorCode":"AGRI_FOOD","moduleCode":"AGRI_REPORTS","labelFr":"Rapports agricoles","labelEn":"Agri reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":300},
    {"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"BOOKINGS","labelFr":"Réservations","labelEn":"Bookings","category":"SECTOR","icon":"calendar-check","sortOrder":210},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"ROOMS_TABLES_SERVICES","labelFr":"Chambres, tables & services","labelEn":"Rooms, tables & services","category":"SECTOR","icon":"concierge-bell","sortOrder":220},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"CUSTOMERS","labelFr":"Clients","labelEn":"Customers","category":"SECTOR","icon":"users-round","sortOrder":230},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"EVENTS","labelFr":"Événements","labelEn":"Events","category":"SECTOR","icon":"party-popper","sortOrder":240},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"KITCHEN_STOCK","labelFr":"Stock cuisine","labelEn":"Kitchen stock","category":"SECTOR","icon":"utensils","sortOrder":250},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"CASHIER","labelFr":"Caisse","labelEn":"Cashier","category":"SECTOR","icon":"receipt","sortOrder":260},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"STAFF_SHIFTS","labelFr":"Plannings personnel","labelEn":"Staff shifts","category":"SECTOR","icon":"calendar-days","sortOrder":270},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"SERVICE_INCIDENTS","labelFr":"Incidents service","labelEn":"Service incidents","category":"SECTOR","icon":"triangle-alert","sortOrder":280},{"sectorCode":"HOSPITALITY_EVENTS","moduleCode":"HOSPITALITY_REPORTS","labelFr":"Rapports hôtellerie","labelEn":"Hospitality reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":290},
    {"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"CLIENT_ACCOUNTS","labelFr":"Comptes clients","labelEn":"Client accounts","category":"SECTOR","icon":"landmark","sortOrder":210},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"FINANCIAL_PRODUCTS","labelFr":"Produits financiers","labelEn":"Financial products","category":"SECTOR","icon":"wallet-cards","sortOrder":220},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"TRANSACTIONS","labelFr":"Transactions","labelEn":"Transactions","category":"SECTOR","icon":"receipt","sortOrder":230},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"CREDIT_FILES","labelFr":"Dossiers crédit","labelEn":"Credit files","category":"SECTOR","icon":"folder","sortOrder":240},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"REPAYMENTS","labelFr":"Remboursements","labelEn":"Repayments","category":"SECTOR","icon":"repeat","sortOrder":250},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"COLLECTIONS","labelFr":"Recouvrement","labelEn":"Collections","category":"SECTOR","icon":"hand-coins","sortOrder":260},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"RISK_REVIEW","labelFr":"Revue risque","labelEn":"Risk review","category":"SECTOR","icon":"activity","sortOrder":270},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"KYC_COMPLIANCE","labelFr":"KYC & conformité","labelEn":"KYC & compliance","category":"SECTOR","icon":"shield-check","sortOrder":280},{"sectorCode":"FINANCE_MICROFINANCE","moduleCode":"FINANCIAL_REPORTING","labelFr":"Reporting financier","labelEn":"Financial reporting","category":"SECTOR","icon":"file-bar-chart","sortOrder":290},
    {"sectorCode":"PUBLIC_ADMIN","moduleCode":"SERVICES","labelFr":"Services","labelEn":"Services","category":"SECTOR","icon":"building-2","sortOrder":210},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"CITIZEN_REQUESTS","labelFr":"Demandes citoyennes","labelEn":"Citizen requests","category":"SECTOR","icon":"inbox","sortOrder":220},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"FILES_CASES","labelFr":"Dossiers","labelEn":"Files & cases","category":"SECTOR","icon":"folder","sortOrder":230},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"OFFICIAL_LETTERS","labelFr":"Courriers officiels","labelEn":"Official letters","category":"SECTOR","icon":"mail","sortOrder":240},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"DECISIONS","labelFr":"Décisions","labelEn":"Decisions","category":"SECTOR","icon":"scale","sortOrder":250},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"ARCHIVES","labelFr":"Archives","labelEn":"Archives","category":"SECTOR","icon":"archive","sortOrder":260},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"BUDGETS","labelFr":"Budgets","labelEn":"Budgets","category":"SECTOR","icon":"wallet","sortOrder":270},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"PUBLIC_REPORTS","labelFr":"Rapports publics","labelEn":"Public reports","category":"SECTOR","icon":"file-bar-chart","sortOrder":280},{"sectorCode":"PUBLIC_ADMIN","moduleCode":"INTERNAL_MEMOS","labelFr":"Notes internes","labelEn":"Internal memos","category":"SECTOR","icon":"file-text","sortOrder":290}
  ]'::jsonb) AS x("sectorCode" TEXT, "moduleCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "category" TEXT, "icon" TEXT, "sortOrder" INTEGER)
)
INSERT INTO "SectorTemplateModule" ("id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder", "defaultEnabled")
SELECT CONCAT('stm-', t."id", '-', LOWER(REPLACE(m."moduleCode", '_', '-'))), t."id", m."moduleCode", m."labelFr", m."labelEn",
  CONCAT('Module sectoriel ', m."labelFr"), CONCAT('Sector module ', m."labelEn"),
  m."category", m."icon", m."sortOrder", true
FROM sector_modules m
JOIN "BusinessSector" s ON s."code" = m."sectorCode"
JOIN "SectorTemplate" t ON t."sectorId" = s."id" AND t."version" = 1
ON CONFLICT ("templateId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn", "moduleCategory" = EXCLUDED."moduleCategory", "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder", "defaultEnabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

WITH departments AS (
  SELECT * FROM jsonb_to_recordset('[
    {"departmentCode":"DIRECTION","labelFr":"Direction","labelEn":"Leadership","sortOrder":10},
    {"departmentCode":"OPERATIONS","labelFr":"Opérations","labelEn":"Operations","sortOrder":20},
    {"departmentCode":"ADMIN_FINANCE","labelFr":"Administration & finance","labelEn":"Administration & finance","sortOrder":30},
    {"departmentCode":"QUALITY_COMPLIANCE","labelFr":"Qualité & conformité","labelEn":"Quality & compliance","sortOrder":40}
  ]'::jsonb) AS x("departmentCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "sortOrder" INTEGER)
)
INSERT INTO "SectorTemplateDepartment" ("id", "templateId", "departmentCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "sortOrder")
SELECT CONCAT('std-', t."id", '-', LOWER(REPLACE(d."departmentCode", '_', '-'))), t."id", d."departmentCode", d."labelFr", d."labelEn",
  CONCAT('Département ', d."labelFr", ' généré par modèle sectoriel.'), CONCAT(d."labelEn", ' department generated from sector template.'), d."sortOrder"
FROM "SectorTemplate" t CROSS JOIN departments d
ON CONFLICT ("templateId", "departmentCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

WITH positions AS (
  SELECT * FROM jsonb_to_recordset('[
    {"sectorCode":"HEALTH_CARE","positionCode":"MEDICAL_DIRECTOR","labelFr":"Directeur médical","labelEn":"Medical director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"HEALTH_CARE","positionCode":"DOCTOR","labelFr":"Médecin","labelEn":"Doctor","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"HEALTH_CARE","positionCode":"NURSE","labelFr":"Infirmier","labelEn":"Nurse","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"HEALTH_CARE","positionCode":"RECEPTIONIST","labelFr":"Réceptionniste","labelEn":"Receptionist","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"HEALTH_CARE","positionCode":"LAB_TECHNICIAN","labelFr":"Laborantin","labelEn":"Lab technician","departmentCode":"OPERATIONS","level":45,"key":false},{"sectorCode":"HEALTH_CARE","positionCode":"PHARMACIST","labelFr":"Pharmacien","labelEn":"Pharmacist","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"HEALTH_CARE","positionCode":"MEDICAL_CASHIER","labelFr":"Caissier médical","labelEn":"Medical cashier","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"HEALTH_CARE","positionCode":"ADMIN_MANAGER","labelFr":"Responsable administratif","labelEn":"Administrative manager","departmentCode":"ADMIN_FINANCE","level":25,"key":true},{"sectorCode":"HEALTH_CARE","positionCode":"QUALITY_MANAGER","labelFr":"Responsable qualité","labelEn":"Quality manager","departmentCode":"QUALITY_COMPLIANCE","level":25,"key":true},{"sectorCode":"HEALTH_CARE","positionCode":"INSURANCE_AGENT","labelFr":"Agent assurance / prise en charge","labelEn":"Insurance coverage agent","departmentCode":"ADMIN_FINANCE","level":55,"key":false},
    {"sectorCode":"PHARMACY","positionCode":"PHARMACY_MANAGER","labelFr":"Gérant","labelEn":"Manager","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"PHARMACY","positionCode":"PHARMACIST","labelFr":"Pharmacien","labelEn":"Pharmacist","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"PHARMACY","positionCode":"ASSISTANT_PHARMACIST","labelFr":"Assistant pharmacien","labelEn":"Assistant pharmacist","departmentCode":"OPERATIONS","level":50,"key":false},{"sectorCode":"PHARMACY","positionCode":"CASHIER","labelFr":"Caissier","labelEn":"Cashier","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"PHARMACY","positionCode":"STOCK_KEEPER","labelFr":"Magasinier","labelEn":"Stock keeper","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"PHARMACY","positionCode":"STOCK_MANAGER","labelFr":"Responsable stock","labelEn":"Stock manager","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"PHARMACY","positionCode":"PURCHASE_MANAGER","labelFr":"Responsable achat","labelEn":"Purchase manager","departmentCode":"ADMIN_FINANCE","level":35,"key":true},
    {"sectorCode":"OTHER","positionCode":"ENTERPRISE_ADMIN","labelFr":"Admin entreprise","labelEn":"Enterprise admin","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"OTHER","positionCode":"MANAGER","labelFr":"Manager","labelEn":"Manager","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"OTHER","positionCode":"MEMBER","labelFr":"Collaborateur","labelEn":"Collaborator","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"OTHER","positionCode":"FINANCE","labelFr":"Finance","labelEn":"Finance","departmentCode":"ADMIN_FINANCE","level":40,"key":true},{"sectorCode":"OTHER","positionCode":"HR","labelFr":"RH","labelEn":"HR","departmentCode":"ADMIN_FINANCE","level":40,"key":true},{"sectorCode":"OTHER","positionCode":"OPERATIONS_LEAD","labelFr":"Responsable opérations","labelEn":"Operations lead","departmentCode":"OPERATIONS","level":30,"key":true}
  ]'::jsonb) AS x("sectorCode" TEXT, "positionCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "departmentCode" TEXT, "level" INTEGER, "key" BOOLEAN)
), generic_positions AS (
  SELECT s."code" AS "sectorCode", p."positionCode", p."labelFr", p."labelEn", p."departmentCode", p."level", p."key"
  FROM "BusinessSector" s
  CROSS JOIN (
    VALUES
      ('DIRECTOR','Directeur','Director','DIRECTION',10,true),
      ('OPERATIONS_MANAGER','Responsable opérations','Operations manager','OPERATIONS',25,true),
      ('FINANCE_MANAGER','Responsable finance','Finance manager','ADMIN_FINANCE',35,true),
      ('QUALITY_COMPLIANCE_MANAGER','Responsable qualité / conformité','Quality / compliance manager','QUALITY_COMPLIANCE',35,true),
      ('COLLABORATOR','Collaborateur','Collaborator','OPERATIONS',60,false)
  ) AS p("positionCode", "labelFr", "labelEn", "departmentCode", "level", "key")
  WHERE s."code" NOT IN ('HEALTH_CARE','PHARMACY','OTHER')
), all_positions AS (
  SELECT * FROM positions
  UNION ALL
  SELECT * FROM generic_positions
)
INSERT INTO "SectorTemplatePosition" ("id", "templateId", "positionCode", "labelFr", "labelEn", "departmentCode", "hierarchyLevel", "descriptionFr", "descriptionEn", "defaultPermissionsJson", "isKeyPosition", "sortOrder")
SELECT CONCAT('stp-', t."id", '-', LOWER(REPLACE(p."positionCode", '_', '-'))), t."id", p."positionCode", p."labelFr", p."labelEn", p."departmentCode", p."level",
  CONCAT('Poste sectoriel ', p."labelFr"), CONCAT('Sector position ', p."labelEn"),
  jsonb_build_object('modules', CASE WHEN p."key" THEN jsonb_build_array('read','write','manage') ELSE jsonb_build_array('read','submit') END),
  p."key", p."level"
FROM all_positions p
JOIN "BusinessSector" s ON s."code" = p."sectorCode"
JOIN "SectorTemplate" t ON t."sectorId" = s."id" AND t."version" = 1
ON CONFLICT ("templateId", "positionCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "departmentCode" = EXCLUDED."departmentCode",
  "hierarchyLevel" = EXCLUDED."hierarchyLevel", "defaultPermissionsJson" = EXCLUDED."defaultPermissionsJson",
  "isKeyPosition" = EXCLUDED."isKeyPosition", "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

WITH listed_positions AS (
  SELECT * FROM jsonb_to_recordset('[
    {"sectorCode":"INSURANCE","positionCode":"INSURANCE_DIRECTOR","labelFr":"Directeur assurance","labelEn":"Insurance director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"INSURANCE","positionCode":"POLICY_MANAGER","labelFr":"Gestionnaire police","labelEn":"Policy manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"INSURANCE","positionCode":"CLAIMS_MANAGER","labelFr":"Gestionnaire sinistre","labelEn":"Claims manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"INSURANCE","positionCode":"CLAIM_AUDITOR","labelFr":"Auditeur dossiers","labelEn":"File auditor","departmentCode":"QUALITY_COMPLIANCE","level":35,"key":true},{"sectorCode":"INSURANCE","positionCode":"PROVIDER_MANAGER","labelFr":"Responsable prestataires","labelEn":"Provider manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"INSURANCE","positionCode":"COMPLIANCE_MANAGER","labelFr":"Responsable conformité","labelEn":"Compliance manager","departmentCode":"QUALITY_COMPLIANCE","level":30,"key":true},{"sectorCode":"INSURANCE","positionCode":"INSURANCE_FINANCE","labelFr":"Finance assurance","labelEn":"Insurance finance","departmentCode":"ADMIN_FINANCE","level":35,"key":true},{"sectorCode":"INSURANCE","positionCode":"CLIENT_RELATIONS_AGENT","labelFr":"Agent relation client","labelEn":"Client relations agent","departmentCode":"OPERATIONS","level":60,"key":false},
    {"sectorCode":"EDUCATION","positionCode":"DIRECTOR","labelFr":"Directeur","labelEn":"Director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"EDUCATION","positionCode":"ACADEMIC_DIRECTOR","labelFr":"Directeur académique","labelEn":"Academic director","departmentCode":"OPERATIONS","level":20,"key":true},{"sectorCode":"EDUCATION","positionCode":"TEACHER","labelFr":"Enseignant","labelEn":"Teacher","departmentCode":"OPERATIONS","level":45,"key":true},{"sectorCode":"EDUCATION","positionCode":"SUPERVISOR","labelFr":"Surveillant","labelEn":"Supervisor","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"EDUCATION","positionCode":"SECRETARY","labelFr":"Secrétaire","labelEn":"Secretary","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"EDUCATION","positionCode":"SCHOOL_ACCOUNTANT","labelFr":"Comptable scolaire","labelEn":"School accountant","departmentCode":"ADMIN_FINANCE","level":45,"key":true},{"sectorCode":"EDUCATION","positionCode":"DISCIPLINE_MANAGER","labelFr":"Responsable discipline","labelEn":"Discipline manager","departmentCode":"QUALITY_COMPLIANCE","level":40,"key":true},{"sectorCode":"EDUCATION","positionCode":"ENROLLMENT_MANAGER","labelFr":"Responsable inscriptions","labelEn":"Enrollment manager","departmentCode":"ADMIN_FINANCE","level":45,"key":true},
    {"sectorCode":"COMMERCE_RETAIL","positionCode":"STORE_MANAGER","labelFr":"Gérant","labelEn":"Manager","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"COMMERCE_RETAIL","positionCode":"SALES_MANAGER","labelFr":"Responsable ventes","labelEn":"Sales manager","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"COMMERCE_RETAIL","positionCode":"SELLER","labelFr":"Vendeur","labelEn":"Seller","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"COMMERCE_RETAIL","positionCode":"CASHIER","labelFr":"Caissier","labelEn":"Cashier","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"COMMERCE_RETAIL","positionCode":"STOCK_KEEPER","labelFr":"Magasinier","labelEn":"Stock keeper","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"COMMERCE_RETAIL","positionCode":"STOCK_MANAGER","labelFr":"Responsable stock","labelEn":"Stock manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"COMMERCE_RETAIL","positionCode":"PURCHASE_MANAGER","labelFr":"Responsable achats","labelEn":"Purchasing manager","departmentCode":"ADMIN_FINANCE","level":35,"key":true},
    {"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"FIRM_DIRECTOR","labelFr":"Directeur cabinet","labelEn":"Firm director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"CONSULTANT","labelFr":"Consultant","labelEn":"Consultant","departmentCode":"OPERATIONS","level":45,"key":true},{"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"MISSION_LEAD","labelFr":"Chef de mission","labelEn":"Mission lead","departmentCode":"OPERATIONS","level":25,"key":true},{"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"ADMIN_ASSISTANT","labelFr":"Assistant administratif","labelEn":"Administrative assistant","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"LEGAL_OFFICER","labelFr":"Juriste","labelEn":"Legal officer","departmentCode":"QUALITY_COMPLIANCE","level":45,"key":true},{"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"ACCOUNTANT","labelFr":"Comptable","labelEn":"Accountant","departmentCode":"ADMIN_FINANCE","level":45,"key":true},{"sectorCode":"PROFESSIONAL_SERVICES","positionCode":"CLIENT_MANAGER","labelFr":"Responsable client","labelEn":"Client manager","departmentCode":"OPERATIONS","level":35,"key":true},
    {"sectorCode":"NGO_ASBL","positionCode":"COORDINATOR","labelFr":"Coordinateur","labelEn":"Coordinator","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"NGO_ASBL","positionCode":"PROJECT_MANAGER","labelFr":"Chef de projet","labelEn":"Project manager","departmentCode":"OPERATIONS","level":25,"key":true},{"sectorCode":"NGO_ASBL","positionCode":"FIELD_AGENT","labelFr":"Agent terrain","labelEn":"Field agent","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"NGO_ASBL","positionCode":"ME_MANAGER","labelFr":"Responsable suivi-évaluation","labelEn":"Monitoring and evaluation manager","departmentCode":"QUALITY_COMPLIANCE","level":35,"key":true},{"sectorCode":"NGO_ASBL","positionCode":"PROJECT_FINANCE_MANAGER","labelFr":"Responsable finance projet","labelEn":"Project finance manager","departmentCode":"ADMIN_FINANCE","level":35,"key":true},{"sectorCode":"NGO_ASBL","positionCode":"LOGISTICS_MANAGER","labelFr":"Responsable logistique","labelEn":"Logistics manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"NGO_ASBL","positionCode":"PARTNERSHIPS_MANAGER","labelFr":"Responsable partenariats","labelEn":"Partnerships manager","departmentCode":"DIRECTION","level":35,"key":true},
    {"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"LOGISTICS_MANAGER","labelFr":"Responsable logistique","labelEn":"Logistics manager","departmentCode":"DIRECTION","level":15,"key":true},{"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"DISPATCHER","labelFr":"Dispatcher","labelEn":"Dispatcher","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"DRIVER","labelFr":"Chauffeur","labelEn":"Driver","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"FLEET_MANAGER","labelFr":"Responsable flotte","labelEn":"Fleet manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"MECHANIC","labelFr":"Mécanicien","labelEn":"Mechanic","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"DELIVERY_AGENT","labelFr":"Agent livraison","labelEn":"Delivery agent","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"TRANSPORT_LOGISTICS","positionCode":"FUEL_MANAGER","labelFr":"Responsable carburant","labelEn":"Fuel manager","departmentCode":"ADMIN_FINANCE","level":45,"key":true},
    {"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"PROJECT_DIRECTOR","labelFr":"Directeur projet","labelEn":"Project director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"WORKS_SUPERVISOR","labelFr":"Conducteur travaux","labelEn":"Works supervisor","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"SITE_MANAGER","labelFr":"Chef chantier","labelEn":"Site manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"ENGINEER","labelFr":"Ingénieur","labelEn":"Engineer","departmentCode":"OPERATIONS","level":45,"key":true},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"ARCHITECT","labelFr":"Architecte","labelEn":"Architect","departmentCode":"OPERATIONS","level":45,"key":true},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"SITE_STOREKEEPER","labelFr":"Magasinier chantier","labelEn":"Site storekeeper","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"SAFETY_MANAGER","labelFr":"Responsable sécurité","labelEn":"Safety manager","departmentCode":"QUALITY_COMPLIANCE","level":35,"key":true},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","positionCode":"SUBCONTRACTOR","labelFr":"Sous-traitant","labelEn":"Subcontractor","departmentCode":"OPERATIONS","level":70,"key":false},
    {"sectorCode":"TECH_DIGITAL","positionCode":"TECH_CEO","labelFr":"CEO tech","labelEn":"Tech CEO","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"TECH_DIGITAL","positionCode":"CTO","labelFr":"CTO","labelEn":"CTO","departmentCode":"DIRECTION","level":15,"key":true},{"sectorCode":"TECH_DIGITAL","positionCode":"PRODUCT_MANAGER","labelFr":"Product Manager","labelEn":"Product Manager","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"TECH_DIGITAL","positionCode":"DEVELOPER","labelFr":"Développeur","labelEn":"Developer","departmentCode":"OPERATIONS","level":50,"key":true},{"sectorCode":"TECH_DIGITAL","positionCode":"UI_UX_DESIGNER","labelFr":"Designer UI/UX","labelEn":"UI/UX designer","departmentCode":"OPERATIONS","level":50,"key":true},{"sectorCode":"TECH_DIGITAL","positionCode":"CLIENT_SUPPORT","labelFr":"Support client","labelEn":"Client support","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"TECH_DIGITAL","positionCode":"QA_TESTER","labelFr":"QA tester","labelEn":"QA tester","departmentCode":"QUALITY_COMPLIANCE","level":55,"key":false},{"sectorCode":"TECH_DIGITAL","positionCode":"DEVOPS","labelFr":"DevOps","labelEn":"DevOps","departmentCode":"OPERATIONS","level":45,"key":true},
    {"sectorCode":"MANUFACTURING","positionCode":"PRODUCTION_DIRECTOR","labelFr":"Directeur production","labelEn":"Production director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"MANUFACTURING","positionCode":"WORKSHOP_LEAD","labelFr":"Chef d’atelier","labelEn":"Workshop lead","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"MANUFACTURING","positionCode":"OPERATOR","labelFr":"Opérateur","labelEn":"Operator","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"MANUFACTURING","positionCode":"QUALITY_MANAGER","labelFr":"Responsable qualité","labelEn":"Quality manager","departmentCode":"QUALITY_COMPLIANCE","level":35,"key":true},{"sectorCode":"MANUFACTURING","positionCode":"MAINTENANCE_MANAGER","labelFr":"Responsable maintenance","labelEn":"Maintenance manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"MANUFACTURING","positionCode":"STOREKEEPER","labelFr":"Magasinier","labelEn":"Storekeeper","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"MANUFACTURING","positionCode":"PURCHASE_MANAGER","labelFr":"Responsable achat","labelEn":"Purchase manager","departmentCode":"ADMIN_FINANCE","level":35,"key":true},
    {"sectorCode":"AGRI_FOOD","positionCode":"FARM_MANAGER","labelFr":"Responsable exploitation","labelEn":"Farm manager","departmentCode":"DIRECTION","level":15,"key":true},{"sectorCode":"AGRI_FOOD","positionCode":"AGRONOMIST","labelFr":"Agronome","labelEn":"Agronomist","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"AGRI_FOOD","positionCode":"FIELD_AGENT","labelFr":"Agent terrain","labelEn":"Field agent","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"AGRI_FOOD","positionCode":"INPUT_MANAGER","labelFr":"Responsable intrants","labelEn":"Inputs manager","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"AGRI_FOOD","positionCode":"PROCESSING_MANAGER","labelFr":"Responsable transformation","labelEn":"Processing manager","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"AGRI_FOOD","positionCode":"QUALITY_MANAGER","labelFr":"Responsable qualité","labelEn":"Quality manager","departmentCode":"QUALITY_COMPLIANCE","level":35,"key":true},{"sectorCode":"AGRI_FOOD","positionCode":"DISTRIBUTION_MANAGER","labelFr":"Responsable distribution","labelEn":"Distribution manager","departmentCode":"OPERATIONS","level":40,"key":true},
    {"sectorCode":"HOSPITALITY_EVENTS","positionCode":"MANAGER","labelFr":"Manager","labelEn":"Manager","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"RECEPTIONIST","labelFr":"Réceptionniste","labelEn":"Receptionist","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"WAITER","labelFr":"Serveur","labelEn":"Waiter","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"COOK","labelFr":"Cuisinier","labelEn":"Cook","departmentCode":"OPERATIONS","level":55,"key":false},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"EVENT_MANAGER","labelFr":"Responsable événement","labelEn":"Event manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"CASHIER","labelFr":"Caissier","labelEn":"Cashier","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"STOCK_MANAGER","labelFr":"Responsable stock","labelEn":"Stock manager","departmentCode":"OPERATIONS","level":40,"key":true},{"sectorCode":"HOSPITALITY_EVENTS","positionCode":"HOUSEKEEPING_AGENT","labelFr":"Agent entretien","labelEn":"Housekeeping agent","departmentCode":"OPERATIONS","level":60,"key":false},
    {"sectorCode":"FINANCE_MICROFINANCE","positionCode":"BRANCH_DIRECTOR","labelFr":"Directeur agence","labelEn":"Branch director","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"FINANCE_MICROFINANCE","positionCode":"CREDIT_AGENT","labelFr":"Agent crédit","labelEn":"Credit agent","departmentCode":"OPERATIONS","level":45,"key":true},{"sectorCode":"FINANCE_MICROFINANCE","positionCode":"CASHIER","labelFr":"Caissier","labelEn":"Cashier","departmentCode":"ADMIN_FINANCE","level":55,"key":false},{"sectorCode":"FINANCE_MICROFINANCE","positionCode":"RISK_ANALYST","labelFr":"Analyste risque","labelEn":"Risk analyst","departmentCode":"QUALITY_COMPLIANCE","level":40,"key":true},{"sectorCode":"FINANCE_MICROFINANCE","positionCode":"COLLECTIONS_MANAGER","labelFr":"Responsable recouvrement","labelEn":"Collections manager","departmentCode":"OPERATIONS","level":35,"key":true},{"sectorCode":"FINANCE_MICROFINANCE","positionCode":"COMPLIANCE_MANAGER","labelFr":"Responsable conformité","labelEn":"Compliance manager","departmentCode":"QUALITY_COMPLIANCE","level":35,"key":true},{"sectorCode":"FINANCE_MICROFINANCE","positionCode":"ACCOUNTANT","labelFr":"Comptable","labelEn":"Accountant","departmentCode":"ADMIN_FINANCE","level":45,"key":true},
    {"sectorCode":"PUBLIC_ADMIN","positionCode":"ADMINISTRATOR","labelFr":"Administrateur","labelEn":"Administrator","departmentCode":"DIRECTION","level":10,"key":true},{"sectorCode":"PUBLIC_ADMIN","positionCode":"SERVICE_HEAD","labelFr":"Chef de service","labelEn":"Service head","departmentCode":"OPERATIONS","level":30,"key":true},{"sectorCode":"PUBLIC_ADMIN","positionCode":"ADMIN_AGENT","labelFr":"Agent administratif","labelEn":"Administrative agent","departmentCode":"OPERATIONS","level":60,"key":false},{"sectorCode":"PUBLIC_ADMIN","positionCode":"SECRETARY","labelFr":"Secrétaire","labelEn":"Secretary","departmentCode":"ADMIN_FINANCE","level":60,"key":false},{"sectorCode":"PUBLIC_ADMIN","positionCode":"PUBLIC_ACCOUNTANT","labelFr":"Comptable public","labelEn":"Public accountant","departmentCode":"ADMIN_FINANCE","level":40,"key":true},{"sectorCode":"PUBLIC_ADMIN","positionCode":"ARCHIVES_MANAGER","labelFr":"Responsable archives","labelEn":"Archives manager","departmentCode":"QUALITY_COMPLIANCE","level":45,"key":true},{"sectorCode":"PUBLIC_ADMIN","positionCode":"MAIL_MANAGER","labelFr":"Responsable courrier","labelEn":"Mail manager","departmentCode":"OPERATIONS","level":45,"key":true}
  ]'::jsonb) AS x("sectorCode" TEXT, "positionCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "departmentCode" TEXT, "level" INTEGER, "key" BOOLEAN)
)
INSERT INTO "SectorTemplatePosition" ("id", "templateId", "positionCode", "labelFr", "labelEn", "departmentCode", "hierarchyLevel", "descriptionFr", "descriptionEn", "defaultPermissionsJson", "isKeyPosition", "sortOrder")
SELECT CONCAT('stp-', t."id", '-', LOWER(REPLACE(p."positionCode", '_', '-'))), t."id", p."positionCode", p."labelFr", p."labelEn", p."departmentCode", p."level",
  CONCAT('Poste sectoriel ', p."labelFr"), CONCAT('Sector position ', p."labelEn"),
  jsonb_build_object('modules', CASE WHEN p."key" THEN jsonb_build_array('read','write','manage') ELSE jsonb_build_array('read','submit') END),
  p."key", p."level"
FROM listed_positions p
JOIN "BusinessSector" s ON s."code" = p."sectorCode"
JOIN "SectorTemplate" t ON t."sectorId" = s."id" AND t."version" = 1
ON CONFLICT ("templateId", "positionCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "departmentCode" = EXCLUDED."departmentCode",
  "hierarchyLevel" = EXCLUDED."hierarchyLevel", "defaultPermissionsJson" = EXCLUDED."defaultPermissionsJson",
  "isKeyPosition" = EXCLUDED."isKeyPosition", "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

WITH activity_blocks AS (
  SELECT * FROM jsonb_to_recordset('[
    {"sectorCode":"HEALTH_CARE","blockCode":"MY_ASSIGNED_PATIENTS","labelFr":"Mes patients assignés","labelEn":"My assigned patients","targetModuleCode":"PATIENTS","icon":"heart-pulse","sortOrder":210},{"sectorCode":"HEALTH_CARE","blockCode":"MY_APPOINTMENTS","labelFr":"Mes rendez-vous","labelEn":"My appointments","targetModuleCode":"APPOINTMENTS","icon":"calendar-check","sortOrder":220},{"sectorCode":"HEALTH_CARE","blockCode":"REPORT_PATIENT_INCIDENT","labelFr":"Signaler un incident patient","labelEn":"Report patient incident","targetModuleCode":"QUALITY_INCIDENTS","icon":"triangle-alert","sortOrder":230},{"sectorCode":"HEALTH_CARE","blockCode":"REQUEST_COVERAGE","labelFr":"Demander une prise en charge","labelEn":"Request coverage","targetModuleCode":"INSURANCE_COVERAGE","icon":"shield-check","sortOrder":240},{"sectorCode":"HEALTH_CARE","blockCode":"SUBMIT_MEDICAL_REPORT","labelFr":"Soumettre un rapport médical","labelEn":"Submit medical report","targetModuleCode":"MEDICAL_RECORDS","icon":"file-heart","sortOrder":250},{"sectorCode":"HEALTH_CARE","blockCode":"REQUEST_MEDICAL_OPINION","labelFr":"Demander un avis médical","labelEn":"Request medical opinion","targetModuleCode":"CARE_TEAM","icon":"message-square","sortOrder":260},{"sectorCode":"HEALTH_CARE","blockCode":"REPORT_CONFIDENTIALITY_ISSUE","labelFr":"Signaler un problème de confidentialité","labelEn":"Report confidentiality issue","targetModuleCode":"MEDICAL_CONFIDENTIALITY","icon":"lock-keyhole","sortOrder":270},{"sectorCode":"HEALTH_CARE","blockCode":"REQUEST_ADMIN_VALIDATION","labelFr":"Demander une validation administrative","labelEn":"Request administrative validation","targetModuleCode":"INTERNAL_REQUESTS","icon":"badge-check","sortOrder":280},
    {"sectorCode":"PHARMACY","blockCode":"REPORT_LOW_STOCK","labelFr":"Signaler rupture de stock","labelEn":"Report stockout","targetModuleCode":"ALERTS_EXPIRY_LOW_STOCK","icon":"bell-ring","sortOrder":210},{"sectorCode":"PHARMACY","blockCode":"REQUEST_REPLENISHMENT","labelFr":"Demander réapprovisionnement","labelEn":"Request replenishment","targetModuleCode":"PURCHASE_REQUESTS","icon":"shopping-cart","sortOrder":220},{"sectorCode":"PHARMACY","blockCode":"DECLARE_NEAR_EXPIRY","labelFr":"Déclarer produit proche péremption","labelEn":"Declare near-expiry product","targetModuleCode":"BATCH_EXPIRY","icon":"hourglass","sortOrder":230},{"sectorCode":"PHARMACY","blockCode":"SUBMIT_CASH_REPORT","labelFr":"Soumettre rapport de caisse","labelEn":"Submit cash report","targetModuleCode":"SALES_CASHIER","icon":"receipt","sortOrder":240},{"sectorCode":"PHARMACY","blockCode":"REPORT_SALE_ANOMALY","labelFr":"Signaler anomalie de vente","labelEn":"Report sale anomaly","targetModuleCode":"SALES_CASHIER","icon":"triangle-alert","sortOrder":250},{"sectorCode":"PHARMACY","blockCode":"REQUEST_PURCHASE_VALIDATION","labelFr":"Demander validation d’achat","labelEn":"Request purchase validation","targetModuleCode":"PURCHASE_REQUESTS","icon":"badge-check","sortOrder":260},
    {"sectorCode":"OTHER","blockCode":"REQUEST_VALIDATION","labelFr":"Demander une validation","labelEn":"Request validation","targetModuleCode":"INTERNAL_REQUESTS","icon":"badge-check","sortOrder":210},{"sectorCode":"OTHER","blockCode":"REPORT_PROBLEM","labelFr":"Signaler un problème","labelEn":"Report a problem","targetModuleCode":"INTERNAL_REQUESTS","icon":"triangle-alert","sortOrder":220}
  ]'::jsonb) AS x("sectorCode" TEXT, "blockCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "targetModuleCode" TEXT, "icon" TEXT, "sortOrder" INTEGER)
), generic_blocks AS (
  SELECT s."code" AS "sectorCode", b."blockCode", b."labelFr", b."labelEn", b."targetModuleCode", b."icon", b."sortOrder"
  FROM "BusinessSector" s
  CROSS JOIN (
    VALUES
      ('SUBMIT_SECTOR_REPORT','Soumettre un rapport métier','Submit sector report','REPORTS','file-bar-chart',210),
      ('REPORT_SECTOR_INCIDENT','Signaler un incident métier','Report sector incident','INTERNAL_REQUESTS','triangle-alert',220),
      ('REQUEST_OPERATION_VALIDATION','Demander validation opérationnelle','Request operational validation','TASKS_OPERATIONS','badge-check',230),
      ('REQUEST_RESOURCE','Demander une ressource','Request a resource','SUPPLIERS_PURCHASES','package-plus',240),
      ('UPDATE_SECTOR_INDICATOR','Mettre à jour un indicateur','Update an indicator','ADMIN_DASHBOARD','activity',250)
  ) AS b("blockCode", "labelFr", "labelEn", "targetModuleCode", "icon", "sortOrder")
  WHERE s."code" NOT IN ('HEALTH_CARE','PHARMACY','OTHER')
), all_blocks AS (
  SELECT * FROM activity_blocks
  UNION ALL
  SELECT * FROM generic_blocks
)
INSERT INTO "SectorTemplateActivityBlock" ("id", "templateId", "blockCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder", "defaultEnabled", "targetModuleCode")
SELECT CONCAT('stab-', t."id", '-', LOWER(REPLACE(b."blockCode", '_', '-'))), t."id", b."blockCode", b."labelFr", b."labelEn",
  CONCAT('Action collaborative: ', b."labelFr"), CONCAT('Collaborative action: ', b."labelEn"), b."icon", b."sortOrder", true, b."targetModuleCode"
FROM all_blocks b
JOIN "BusinessSector" s ON s."code" = b."sectorCode"
JOIN "SectorTemplate" t ON t."sectorId" = s."id" AND t."version" = 1
ON CONFLICT ("templateId", "blockCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn", "icon" = EXCLUDED."icon", "sortOrder" = EXCLUDED."sortOrder",
  "defaultEnabled" = true, "targetModuleCode" = EXCLUDED."targetModuleCode", "updatedAt" = CURRENT_TIMESTAMP;

WITH listed_activity_blocks AS (
  SELECT * FROM jsonb_to_recordset('[
    {"sectorCode":"INSURANCE","blockCode":"SUBMIT_CLAIM_FILE","labelFr":"Soumettre dossier sinistre","labelEn":"Submit claim file","targetModuleCode":"CLAIMS","icon":"file-warning","sortOrder":210},{"sectorCode":"INSURANCE","blockCode":"REQUEST_COVERAGE_VALIDATION","labelFr":"Demander validation prise en charge","labelEn":"Request coverage validation","targetModuleCode":"PREAUTHORIZATIONS","icon":"badge-check","sortOrder":220},{"sectorCode":"INSURANCE","blockCode":"REPORT_INCOMPLETE_FILE","labelFr":"Signaler dossier incomplet","labelEn":"Report incomplete file","targetModuleCode":"CLAIMS","icon":"triangle-alert","sortOrder":230},{"sectorCode":"INSURANCE","blockCode":"REQUEST_CLAIM_AUDIT","labelFr":"Demander audit dossier","labelEn":"Request file audit","targetModuleCode":"CLAIM_AUDIT","icon":"search-check","sortOrder":240},{"sectorCode":"INSURANCE","blockCode":"ANSWER_COMPLIANCE_REQUEST","labelFr":"Répondre à une demande conformité","labelEn":"Answer compliance request","targetModuleCode":"COMPLIANCE","icon":"shield-check","sortOrder":250},{"sectorCode":"INSURANCE","blockCode":"SUBMIT_PROVIDER_REPORT","labelFr":"Soumettre rapport prestataire","labelEn":"Submit provider report","targetModuleCode":"PROVIDERS","icon":"file-bar-chart","sortOrder":260},
    {"sectorCode":"EDUCATION","blockCode":"REPORT_ABSENCE","labelFr":"Signaler absence","labelEn":"Report absence","targetModuleCode":"ATTENDANCE","icon":"clipboard-check","sortOrder":210},{"sectorCode":"EDUCATION","blockCode":"SUBMIT_CLASS_REPORT","labelFr":"Soumettre rapport de classe","labelEn":"Submit class report","targetModuleCode":"ACADEMIC_REPORTS","icon":"file-bar-chart","sortOrder":220},{"sectorCode":"EDUCATION","blockCode":"ENTER_GRADES","labelFr":"Saisir notes","labelEn":"Enter grades","targetModuleCode":"EXAMS_GRADES","icon":"file-check","sortOrder":230},{"sectorCode":"EDUCATION","blockCode":"REQUEST_PARENT_MEETING","labelFr":"Demander réunion parent","labelEn":"Request parent meeting","targetModuleCode":"PARENTS_GUARDIANS","icon":"calendar-check","sortOrder":240},{"sectorCode":"EDUCATION","blockCode":"REPORT_DISCIPLINE_INCIDENT","labelFr":"Signaler incident disciplinaire","labelEn":"Report discipline incident","targetModuleCode":"DISCIPLINE","icon":"triangle-alert","sortOrder":250},{"sectorCode":"EDUCATION","blockCode":"REQUEST_ACADEMIC_VALIDATION","labelFr":"Demander validation académique","labelEn":"Request academic validation","targetModuleCode":"COURSES","icon":"badge-check","sortOrder":260},
    {"sectorCode":"COMMERCE_RETAIL","blockCode":"REPORT_STOCKOUT","labelFr":"Signaler rupture de stock","labelEn":"Report stockout","targetModuleCode":"STOCK","icon":"bell-ring","sortOrder":210},{"sectorCode":"COMMERCE_RETAIL","blockCode":"REQUEST_REPLENISHMENT","labelFr":"Demander réapprovisionnement","labelEn":"Request replenishment","targetModuleCode":"PURCHASE_ORDERS","icon":"shopping-cart","sortOrder":220},{"sectorCode":"COMMERCE_RETAIL","blockCode":"SUBMIT_SALES_REPORT","labelFr":"Soumettre rapport de vente","labelEn":"Submit sales report","targetModuleCode":"SALES_REPORTS","icon":"file-bar-chart","sortOrder":230},{"sectorCode":"COMMERCE_RETAIL","blockCode":"SUBMIT_CASH_REPORT","labelFr":"Soumettre rapport caisse","labelEn":"Submit cash report","targetModuleCode":"CASH_REGISTER","icon":"receipt","sortOrder":240},{"sectorCode":"COMMERCE_RETAIL","blockCode":"REPORT_CUSTOMER_ANOMALY","labelFr":"Signaler anomalie client","labelEn":"Report customer anomaly","targetModuleCode":"CUSTOMERS","icon":"triangle-alert","sortOrder":250},{"sectorCode":"COMMERCE_RETAIL","blockCode":"REQUEST_DISCOUNT_VALIDATION","labelFr":"Demander validation remise","labelEn":"Request discount validation","targetModuleCode":"PROMOTIONS","icon":"badge-percent","sortOrder":260},
    {"sectorCode":"PROFESSIONAL_SERVICES","blockCode":"SUBMIT_DELIVERABLE","labelFr":"Soumettre livrable","labelEn":"Submit deliverable","targetModuleCode":"DELIVERABLES","icon":"file-check","sortOrder":210},{"sectorCode":"PROFESSIONAL_SERVICES","blockCode":"SEND_MISSION_REPORT","labelFr":"Envoyer rapport mission","labelEn":"Send mission report","targetModuleCode":"EXPERT_REPORTS","icon":"file-bar-chart","sortOrder":220},{"sectorCode":"PROFESSIONAL_SERVICES","blockCode":"REQUEST_CLIENT_VALIDATION","labelFr":"Demander validation client","labelEn":"Request client validation","targetModuleCode":"CLIENTS","icon":"badge-check","sortOrder":230},{"sectorCode":"PROFESSIONAL_SERVICES","blockCode":"REQUEST_CONTRACT_REVIEW","labelFr":"Demander relecture contrat","labelEn":"Request contract review","targetModuleCode":"CONTRACTS","icon":"file-signature","sortOrder":240},{"sectorCode":"PROFESSIONAL_SERVICES","blockCode":"DECLARE_TIME_WORKED","labelFr":"Déclarer temps travaillé","labelEn":"Declare time worked","targetModuleCode":"TIMESHEETS","icon":"clock","sortOrder":250},{"sectorCode":"PROFESSIONAL_SERVICES","blockCode":"REPORT_MISSION_BLOCKER","labelFr":"Signaler blocage mission","labelEn":"Report mission blocker","targetModuleCode":"MISSIONS","icon":"triangle-alert","sortOrder":260},
    {"sectorCode":"NGO_ASBL","blockCode":"SUBMIT_FIELD_REPORT","labelFr":"Soumettre rapport terrain","labelEn":"Submit field report","targetModuleCode":"FIELD_ACTIVITIES","icon":"map","sortOrder":210},{"sectorCode":"NGO_ASBL","blockCode":"SUBMIT_SUPPORTING_DOCUMENT","labelFr":"Soumettre justificatif","labelEn":"Submit supporting document","targetModuleCode":"SUPPORTING_DOCUMENTS","icon":"paperclip","sortOrder":220},{"sectorCode":"NGO_ASBL","blockCode":"REPORT_FIELD_INCIDENT","labelFr":"Signaler incident terrain","labelEn":"Report field incident","targetModuleCode":"FIELD_INCIDENTS","icon":"triangle-alert","sortOrder":230},{"sectorCode":"NGO_ASBL","blockCode":"REQUEST_ACTIVITY_VALIDATION","labelFr":"Demander validation activité","labelEn":"Request activity validation","targetModuleCode":"FIELD_ACTIVITIES","icon":"badge-check","sortOrder":240},{"sectorCode":"NGO_ASBL","blockCode":"UPDATE_INDICATOR","labelFr":"Mettre à jour indicateur","labelEn":"Update indicator","targetModuleCode":"INDICATORS_ME","icon":"activity","sortOrder":250},{"sectorCode":"NGO_ASBL","blockCode":"REQUEST_PROJECT_DISBURSEMENT","labelFr":"Demander décaissement projet","labelEn":"Request project disbursement","targetModuleCode":"BUDGET_LINES","icon":"wallet","sortOrder":260},
    {"sectorCode":"TRANSPORT_LOGISTICS","blockCode":"SUBMIT_MISSION_REPORT","labelFr":"Soumettre rapport mission","labelEn":"Submit mission report","targetModuleCode":"TRANSPORT_MISSIONS","icon":"file-bar-chart","sortOrder":210},{"sectorCode":"TRANSPORT_LOGISTICS","blockCode":"REPORT_BREAKDOWN","labelFr":"Signaler panne","labelEn":"Report breakdown","targetModuleCode":"MAINTENANCE","icon":"wrench","sortOrder":220},{"sectorCode":"TRANSPORT_LOGISTICS","blockCode":"DECLARE_DELIVERY_INCIDENT","labelFr":"Déclarer incident livraison","labelEn":"Declare delivery incident","targetModuleCode":"INCIDENTS","icon":"triangle-alert","sortOrder":230},{"sectorCode":"TRANSPORT_LOGISTICS","blockCode":"REQUEST_FUEL","labelFr":"Demander carburant","labelEn":"Request fuel","targetModuleCode":"FUEL","icon":"fuel","sortOrder":240},{"sectorCode":"TRANSPORT_LOGISTICS","blockCode":"REQUEST_MAINTENANCE","labelFr":"Demander maintenance","labelEn":"Request maintenance","targetModuleCode":"MAINTENANCE","icon":"wrench","sortOrder":250},{"sectorCode":"TRANSPORT_LOGISTICS","blockCode":"CONFIRM_DELIVERY","labelFr":"Confirmer livraison","labelEn":"Confirm delivery","targetModuleCode":"DELIVERIES","icon":"package-check","sortOrder":260},
    {"sectorCode":"CONSTRUCTION_REAL_ESTATE","blockCode":"SUBMIT_SITE_REPORT","labelFr":"Soumettre rapport chantier","labelEn":"Submit site report","targetModuleCode":"SITE_PROGRESS","icon":"file-bar-chart","sortOrder":210},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","blockCode":"REPORT_SAFETY_INCIDENT","labelFr":"Signaler incident sécurité","labelEn":"Report safety incident","targetModuleCode":"SAFETY_INCIDENTS","icon":"shield-alert","sortOrder":220},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","blockCode":"REQUEST_MATERIALS","labelFr":"Demander matériaux","labelEn":"Request materials","targetModuleCode":"MATERIALS","icon":"package","sortOrder":230},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","blockCode":"VALIDATE_PROGRESS","labelFr":"Valider avancement","labelEn":"Validate progress","targetModuleCode":"SITE_PROGRESS","icon":"badge-check","sortOrder":240},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","blockCode":"SUBMIT_SITE_PHOTO","labelFr":"Soumettre photo chantier","labelEn":"Submit site photo","targetModuleCode":"TECHNICAL_DOCUMENTS","icon":"image","sortOrder":250},{"sectorCode":"CONSTRUCTION_REAL_ESTATE","blockCode":"REPORT_SUBCONTRACTOR_DELAY","labelFr":"Signaler retard sous-traitant","labelEn":"Report subcontractor delay","targetModuleCode":"SUBCONTRACTORS","icon":"triangle-alert","sortOrder":260},
    {"sectorCode":"TECH_DIGITAL","blockCode":"REPORT_BUG","labelFr":"Signaler bug","labelEn":"Report bug","targetModuleCode":"BUGS","icon":"bug","sortOrder":210},{"sectorCode":"TECH_DIGITAL","blockCode":"REQUEST_TECH_ESTIMATE","labelFr":"Demander estimation technique","labelEn":"Request technical estimate","targetModuleCode":"DIGITAL_PROJECTS","icon":"calculator","sortOrder":220},{"sectorCode":"TECH_DIGITAL","blockCode":"SUBMIT_TICKET","labelFr":"Soumettre ticket","labelEn":"Submit ticket","targetModuleCode":"TICKETS","icon":"ticket","sortOrder":230},{"sectorCode":"TECH_DIGITAL","blockCode":"REQUEST_CODE_REVIEW","labelFr":"Demander revue code","labelEn":"Request code review","targetModuleCode":"REPOSITORIES","icon":"git-branch","sortOrder":240},{"sectorCode":"TECH_DIGITAL","blockCode":"REPORT_PRODUCTION_INCIDENT","labelFr":"Signaler incident production","labelEn":"Report production incident","targetModuleCode":"DEPLOYMENTS","icon":"triangle-alert","sortOrder":250},{"sectorCode":"TECH_DIGITAL","blockCode":"SUBMIT_RELEASE_NOTE","labelFr":"Soumettre release note","labelEn":"Submit release note","targetModuleCode":"RELEASE_NOTES","icon":"file-text","sortOrder":260},
    {"sectorCode":"MANUFACTURING","blockCode":"DECLARE_PRODUCTION","labelFr":"Déclarer production","labelEn":"Declare production","targetModuleCode":"PRODUCTION_ORDERS","icon":"factory","sortOrder":210},{"sectorCode":"MANUFACTURING","blockCode":"REPORT_MACHINE_FAILURE","labelFr":"Signaler panne machine","labelEn":"Report machine failure","targetModuleCode":"MACHINE_MAINTENANCE","icon":"wrench","sortOrder":220},{"sectorCode":"MANUFACTURING","blockCode":"REPORT_QUALITY_DEFECT","labelFr":"Signaler défaut qualité","labelEn":"Report quality defect","targetModuleCode":"QUALITY_CONTROL","icon":"triangle-alert","sortOrder":230},{"sectorCode":"MANUFACTURING","blockCode":"REQUEST_RAW_MATERIAL","labelFr":"Demander matière première","labelEn":"Request raw material","targetModuleCode":"RAW_MATERIALS","icon":"package","sortOrder":240},{"sectorCode":"MANUFACTURING","blockCode":"SUBMIT_WORKSHOP_REPORT","labelFr":"Soumettre rapport atelier","labelEn":"Submit workshop report","targetModuleCode":"PRODUCTION_REPORTS","icon":"file-bar-chart","sortOrder":250},{"sectorCode":"MANUFACTURING","blockCode":"REQUEST_MAINTENANCE","labelFr":"Demander maintenance","labelEn":"Request maintenance","targetModuleCode":"MACHINE_MAINTENANCE","icon":"wrench","sortOrder":260},
    {"sectorCode":"AGRI_FOOD","blockCode":"REPORT_INPUT_NEED","labelFr":"Signaler besoin intrants","labelEn":"Report input need","targetModuleCode":"INPUTS","icon":"wheat","sortOrder":210},{"sectorCode":"AGRI_FOOD","blockCode":"SUBMIT_FIELD_REPORT","labelFr":"Soumettre rapport terrain","labelEn":"Submit field report","targetModuleCode":"FARMS_PLOTS","icon":"map","sortOrder":220},{"sectorCode":"AGRI_FOOD","blockCode":"DECLARE_HARVEST","labelFr":"Déclarer récolte","labelEn":"Declare harvest","targetModuleCode":"HARVESTS","icon":"package-check","sortOrder":230},{"sectorCode":"AGRI_FOOD","blockCode":"REPORT_QUALITY_PROBLEM","labelFr":"Signaler problème qualité","labelEn":"Report quality problem","targetModuleCode":"QUALITY_FOOD_SAFETY","icon":"triangle-alert","sortOrder":240},{"sectorCode":"AGRI_FOOD","blockCode":"REQUEST_PRODUCT_TRANSPORT","labelFr":"Demander transport produits","labelEn":"Request product transport","targetModuleCode":"DISTRIBUTION","icon":"truck","sortOrder":250},{"sectorCode":"AGRI_FOOD","blockCode":"UPDATE_AGRI_STOCK","labelFr":"Mettre à jour stock agricole","labelEn":"Update agricultural stock","targetModuleCode":"STOCKS","icon":"boxes","sortOrder":260},
    {"sectorCode":"HOSPITALITY_EVENTS","blockCode":"CONFIRM_BOOKING","labelFr":"Confirmer réservation","labelEn":"Confirm booking","targetModuleCode":"BOOKINGS","icon":"calendar-check","sortOrder":210},{"sectorCode":"HOSPITALITY_EVENTS","blockCode":"REPORT_CUSTOMER_INCIDENT","labelFr":"Signaler incident client","labelEn":"Report customer incident","targetModuleCode":"SERVICE_INCIDENTS","icon":"triangle-alert","sortOrder":220},{"sectorCode":"HOSPITALITY_EVENTS","blockCode":"REQUEST_KITCHEN_STOCK","labelFr":"Demander stock cuisine","labelEn":"Request kitchen stock","targetModuleCode":"KITCHEN_STOCK","icon":"utensils","sortOrder":230},{"sectorCode":"HOSPITALITY_EVENTS","blockCode":"SUBMIT_CASH_REPORT","labelFr":"Soumettre rapport caisse","labelEn":"Submit cash report","targetModuleCode":"CASHIER","icon":"receipt","sortOrder":240},{"sectorCode":"HOSPITALITY_EVENTS","blockCode":"REQUEST_EXTRA_STAFF","labelFr":"Demander personnel extra","labelEn":"Request extra staff","targetModuleCode":"STAFF_SHIFTS","icon":"users-round","sortOrder":250},{"sectorCode":"HOSPITALITY_EVENTS","blockCode":"REPORT_ROOM_SERVICE_PROBLEM","labelFr":"Signaler problème chambre/service","labelEn":"Report room/service problem","targetModuleCode":"ROOMS_TABLES_SERVICES","icon":"concierge-bell","sortOrder":260},
    {"sectorCode":"FINANCE_MICROFINANCE","blockCode":"SUBMIT_CREDIT_FILE","labelFr":"Soumettre dossier crédit","labelEn":"Submit credit file","targetModuleCode":"CREDIT_FILES","icon":"folder","sortOrder":210},{"sectorCode":"FINANCE_MICROFINANCE","blockCode":"REQUEST_CREDIT_VALIDATION","labelFr":"Demander validation crédit","labelEn":"Request credit validation","targetModuleCode":"CREDIT_FILES","icon":"badge-check","sortOrder":220},{"sectorCode":"FINANCE_MICROFINANCE","blockCode":"REPORT_LATE_REPAYMENT","labelFr":"Signaler retard remboursement","labelEn":"Report late repayment","targetModuleCode":"REPAYMENTS","icon":"triangle-alert","sortOrder":230},{"sectorCode":"FINANCE_MICROFINANCE","blockCode":"SUBMIT_CASH_REPORT","labelFr":"Soumettre rapport caisse","labelEn":"Submit cash report","targetModuleCode":"TRANSACTIONS","icon":"receipt","sortOrder":240},{"sectorCode":"FINANCE_MICROFINANCE","blockCode":"REQUEST_RISK_REVIEW","labelFr":"Demander revue risque","labelEn":"Request risk review","targetModuleCode":"RISK_REVIEW","icon":"activity","sortOrder":250},{"sectorCode":"FINANCE_MICROFINANCE","blockCode":"REPORT_KYC_ANOMALY","labelFr":"Signaler anomalie KYC","labelEn":"Report KYC anomaly","targetModuleCode":"KYC_COMPLIANCE","icon":"shield-check","sortOrder":260},
    {"sectorCode":"PUBLIC_ADMIN","blockCode":"SUBMIT_CASE","labelFr":"Soumettre dossier","labelEn":"Submit case","targetModuleCode":"FILES_CASES","icon":"folder","sortOrder":210},{"sectorCode":"PUBLIC_ADMIN","blockCode":"REQUEST_LETTER_VALIDATION","labelFr":"Demander validation courrier","labelEn":"Request letter validation","targetModuleCode":"OFFICIAL_LETTERS","icon":"mail","sortOrder":220},{"sectorCode":"PUBLIC_ADMIN","blockCode":"REPORT_INCOMPLETE_CASE","labelFr":"Signaler dossier incomplet","labelEn":"Report incomplete case","targetModuleCode":"FILES_CASES","icon":"triangle-alert","sortOrder":230},{"sectorCode":"PUBLIC_ADMIN","blockCode":"SUBMIT_SERVICE_REPORT","labelFr":"Soumettre rapport service","labelEn":"Submit service report","targetModuleCode":"PUBLIC_REPORTS","icon":"file-bar-chart","sortOrder":240},{"sectorCode":"PUBLIC_ADMIN","blockCode":"REQUEST_ARCHIVING","labelFr":"Demander archivage","labelEn":"Request archiving","targetModuleCode":"ARCHIVES","icon":"archive","sortOrder":250},{"sectorCode":"PUBLIC_ADMIN","blockCode":"ESCALATE_DECISION","labelFr":"Escalader décision","labelEn":"Escalate decision","targetModuleCode":"DECISIONS","icon":"scale","sortOrder":260}
  ]'::jsonb) AS x("sectorCode" TEXT, "blockCode" TEXT, "labelFr" TEXT, "labelEn" TEXT, "targetModuleCode" TEXT, "icon" TEXT, "sortOrder" INTEGER)
)
INSERT INTO "SectorTemplateActivityBlock" ("id", "templateId", "blockCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder", "defaultEnabled", "targetModuleCode")
SELECT CONCAT('stab-', t."id", '-', LOWER(REPLACE(b."blockCode", '_', '-'))), t."id", b."blockCode", b."labelFr", b."labelEn",
  CONCAT('Action collaborative: ', b."labelFr"), CONCAT('Collaborative action: ', b."labelEn"), b."icon", b."sortOrder", true, b."targetModuleCode"
FROM listed_activity_blocks b
JOIN "BusinessSector" s ON s."code" = b."sectorCode"
JOIN "SectorTemplate" t ON t."sectorId" = s."id" AND t."version" = 1
ON CONFLICT ("templateId", "blockCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn", "icon" = EXCLUDED."icon", "sortOrder" = EXCLUDED."sortOrder",
  "defaultEnabled" = true, "targetModuleCode" = EXCLUDED."targetModuleCode", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "SectorTemplateWorkflow" ("id", "templateId", "workflowCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "stepsJson", "defaultEnabled")
SELECT CONCAT('stw-', t."id", '-standard-request-flow'), t."id", 'STANDARD_REQUEST_FLOW', 'Traitement standard des demandes', 'Standard request handling',
  'Soumission, qualification, traitement, validation, clôture et audit.', 'Submission, triage, handling, validation, closure and audit.',
  '[{"code":"SUBMITTED","labelFr":"Soumis","labelEn":"Submitted"},{"code":"IN_PROGRESS","labelFr":"En cours","labelEn":"In progress"},{"code":"VALIDATED","labelFr":"Validé","labelEn":"Validated"},{"code":"CLOSED","labelFr":"Clôturé","labelEn":"Closed"}]'::jsonb,
  true
FROM "SectorTemplate" t
ON CONFLICT ("templateId", "workflowCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "stepsJson" = EXCLUDED."stepsJson", "defaultEnabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Organization" o
SET "sectorId" = s."id",
    "sectorCode" = s."code"
FROM "BusinessSector" s
WHERE o."sectorId" IS NULL
  AND o."sectorCode" IS NULL
  AND o."industry" IS NOT NULL
  AND LOWER(o."industry") = LOWER(s."labelFr");
