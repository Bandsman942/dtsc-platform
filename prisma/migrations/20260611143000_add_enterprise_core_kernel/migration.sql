-- Additive common ERP kernel. Sector tables remain unchanged and can link through EnterpriseEntityLink.
CREATE TABLE "EnterpriseCoreRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "departmentId" TEXT,
    "assignedToUserId" TEXT,
    "requestedById" TEXT,
    "validatorUserId" TEXT,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "sectorCode" TEXT,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "metadataJson" JSONB,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseCoreRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseCoreEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadataJson" JSONB,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseCoreEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseCoreComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseCoreComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseEntityLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "targetModule" TEXT NOT NULL,
    "targetEntityType" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'RELATED_TO',
    "label" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseEntityLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseCoreRecord_organizationId_reference_key" ON "EnterpriseCoreRecord"("organizationId", "reference");
CREATE INDEX "EnterpriseCoreRecord_organizationId_moduleCode_status_idx" ON "EnterpriseCoreRecord"("organizationId", "moduleCode", "status");
CREATE INDEX "EnterpriseCoreRecord_organizationId_recordType_createdAt_idx" ON "EnterpriseCoreRecord"("organizationId", "recordType", "createdAt");
CREATE INDEX "EnterpriseCoreRecord_organizationId_assignedToUserId_status_idx" ON "EnterpriseCoreRecord"("organizationId", "assignedToUserId", "status");
CREATE INDEX "EnterpriseCoreRecord_organizationId_requestedById_status_idx" ON "EnterpriseCoreRecord"("organizationId", "requestedById", "status");
CREATE INDEX "EnterpriseCoreRecord_organizationId_validatorUserId_status_idx" ON "EnterpriseCoreRecord"("organizationId", "validatorUserId", "status");
CREATE INDEX "EnterpriseCoreRecord_organizationId_sourceModule_sourceEntityType_sourceEntityId_idx" ON "EnterpriseCoreRecord"("organizationId", "sourceModule", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseCoreRecord_organizationId_dueAt_idx" ON "EnterpriseCoreRecord"("organizationId", "dueAt");
CREATE INDEX "EnterpriseCoreRecord_archivedAt_idx" ON "EnterpriseCoreRecord"("archivedAt");
CREATE INDEX "EnterpriseCoreEvent_organizationId_recordId_createdAt_idx" ON "EnterpriseCoreEvent"("organizationId", "recordId", "createdAt");
CREATE INDEX "EnterpriseCoreEvent_organizationId_eventType_createdAt_idx" ON "EnterpriseCoreEvent"("organizationId", "eventType", "createdAt");
CREATE INDEX "EnterpriseCoreEvent_actorUserId_createdAt_idx" ON "EnterpriseCoreEvent"("actorUserId", "createdAt");
CREATE INDEX "EnterpriseCoreComment_organizationId_recordId_createdAt_idx" ON "EnterpriseCoreComment"("organizationId", "recordId", "createdAt");
CREATE INDEX "EnterpriseCoreComment_authorUserId_createdAt_idx" ON "EnterpriseCoreComment"("authorUserId", "createdAt");
CREATE INDEX "EnterpriseCoreComment_deletedAt_idx" ON "EnterpriseCoreComment"("deletedAt");
CREATE UNIQUE INDEX "EnterpriseEntityLink_organizationId_sourceEntityType_sourceEntityId_targetEntityType_targetEntityId_linkType_key" ON "EnterpriseEntityLink"("organizationId", "sourceEntityType", "sourceEntityId", "targetEntityType", "targetEntityId", "linkType");
CREATE INDEX "EnterpriseEntityLink_organizationId_sourceModule_sourceEntityType_sourceEntityId_idx" ON "EnterpriseEntityLink"("organizationId", "sourceModule", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseEntityLink_organizationId_targetModule_targetEntityType_targetEntityId_idx" ON "EnterpriseEntityLink"("organizationId", "targetModule", "targetEntityType", "targetEntityId");
CREATE INDEX "EnterpriseEntityLink_createdById_createdAt_idx" ON "EnterpriseEntityLink"("createdById", "createdAt");

ALTER TABLE "EnterpriseCoreEvent" ADD CONSTRAINT "EnterpriseCoreEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "EnterpriseCoreRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseCoreComment" ADD CONSTRAINT "EnterpriseCoreComment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "EnterpriseCoreRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Complete the common navigation for existing and future sector templates.
WITH added_modules AS (
  SELECT * FROM (VALUES
    ('VALIDATIONS', 'Validations', 'Validations', 'Centralisez les décisions attendues sur les demandes, tâches, documents et opérations métier.', 'Centralize decisions expected for requests, tasks, documents and business operations.', 'badge-check', 75),
    ('NOTIFICATIONS', 'Notifications métier', 'Business notifications', 'Consultez les signaux de travail générés par les opérations communes et sectorielles de l’entreprise.', 'Review work signals generated by common and sector operations.', 'bell-ring', 125)
  ) AS x("moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder")
)
INSERT INTO "SectorTemplateModule" ("id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder", "defaultEnabled")
SELECT CONCAT('stm-', t."id", '-', LOWER(m."moduleCode")), t."id", m."moduleCode", m."labelFr", m."labelEn", m."descriptionFr", m."descriptionEn", 'CORE', m."icon", m."sortOrder", true
FROM "SectorTemplate" t CROSS JOIN added_modules m
ON CONFLICT ("templateId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn", "icon" = EXCLUDED."icon", "sortOrder" = EXCLUDED."sortOrder",
  "defaultEnabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

WITH added_modules AS (
  SELECT * FROM (VALUES
    ('VALIDATIONS', 'Validations', 'Validations', 'Centralisez les décisions attendues sur les demandes, tâches, documents et opérations métier.', 'Centralize decisions expected for requests, tasks, documents and business operations.', 'badge-check', 75),
    ('NOTIFICATIONS', 'Notifications métier', 'Business notifications', 'Consultez les signaux de travail générés par les opérations communes et sectorielles de l’entreprise.', 'Review work signals generated by common and sector operations.', 'bell-ring', 125)
  ) AS x("moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "icon", "sortOrder")
)
INSERT INTO "EnterpriseModule" ("id", "organizationId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "isEnabled", "isCore", "sortOrder")
SELECT CONCAT('ecm-', o."id", '-', LOWER(m."moduleCode")), o."id", m."moduleCode", m."labelFr", m."labelEn", m."descriptionFr", m."descriptionEn", 'CORE', m."icon", true, true, m."sortOrder"
FROM "Organization" o CROSS JOIN added_modules m
WHERE o."organizationType" = 'CLIENT' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn", "icon" = EXCLUDED."icon", "sortOrder" = EXCLUDED."sortOrder",
  "isCore" = true, "updatedAt" = CURRENT_TIMESTAMP;
