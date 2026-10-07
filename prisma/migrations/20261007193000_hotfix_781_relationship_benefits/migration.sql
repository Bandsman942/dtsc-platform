-- Hotfix #781 — moteur d'avantages relationnels.
-- Migration additive : aucun historique n'est supprimé ou réécrit.

CREATE TABLE "EnterpriseRelationshipBenefit" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameFr" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "descriptionFr" TEXT NOT NULL,
  "descriptionEn" TEXT NOT NULL,
  "benefitType" TEXT NOT NULL,
  "assignmentMode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
  "valueType" TEXT NOT NULL DEFAULT 'NONE',
  "valueDecimal" DECIMAL(20,6),
  "currencyCode" TEXT,
  "minimumAmount" DECIMAL(20,6),
  "actionCode" TEXT NOT NULL DEFAULT 'NONE',
  "actionLabelFr" TEXT,
  "actionLabelEn" TEXT,
  "targetModuleCode" TEXT,
  "usageLimitTotal" INTEGER,
  "usageLimitPerPeriod" INTEGER,
  "usagePeriodDays" INTEGER,
  "stackable" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "conditionsJson" JSONB,
  "settingsJson" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRelationshipBenefit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseRelationshipBenefit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EnterpriseRelationshipBenefitAudience" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "benefitId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "roleCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseRelationshipBenefitAudience_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseRelationshipBenefitAudience_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "EnterpriseRelationshipBenefit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EnterpriseRelationshipBenefitAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "benefitId" TEXT NOT NULL,
  "identityLinkId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseRelationshipBenefitAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseRelationshipBenefitAssignment_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "EnterpriseRelationshipBenefit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EnterpriseRelationshipBenefitUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "benefitId" TEXT NOT NULL,
  "identityLinkId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actionCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "idempotencyKey" TEXT NOT NULL,
  "note" TEXT,
  "organizationNote" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRelationshipBenefitUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseRelationshipBenefitUsage_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "EnterpriseRelationshipBenefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EnterpriseRelationshipBenefit_org_id_key" ON "EnterpriseRelationshipBenefit"("organizationId","id");
CREATE UNIQUE INDEX "EnterpriseRelationshipBenefit_org_code_key" ON "EnterpriseRelationshipBenefit"("organizationId","code");
CREATE INDEX "EnterpriseRelationshipBenefit_org_status_dates_idx" ON "EnterpriseRelationshipBenefit"("organizationId","status","startsAt","endsAt");
CREATE INDEX "EnterpriseRelationshipBenefit_org_type_status_idx" ON "EnterpriseRelationshipBenefit"("organizationId","benefitType","status");
CREATE INDEX "EnterpriseRelationshipBenefit_archived_idx" ON "EnterpriseRelationshipBenefit"("archivedAt");
CREATE UNIQUE INDEX "ERBA_org_benefit_relation_role_key" ON "EnterpriseRelationshipBenefitAudience"("organizationId","benefitId","relationType","roleCode");
CREATE INDEX "ERBA_org_relation_benefit_idx" ON "EnterpriseRelationshipBenefitAudience"("organizationId","relationType","benefitId");
CREATE UNIQUE INDEX "ERBAS_org_benefit_link_key" ON "EnterpriseRelationshipBenefitAssignment"("organizationId","benefitId","identityLinkId");
CREATE INDEX "ERBAS_org_link_status_idx" ON "EnterpriseRelationshipBenefitAssignment"("organizationId","identityLinkId","status");
CREATE UNIQUE INDEX "ERBU_org_id_key" ON "EnterpriseRelationshipBenefitUsage"("organizationId","id");
CREATE UNIQUE INDEX "ERBU_org_idempotency_key" ON "EnterpriseRelationshipBenefitUsage"("organizationId","idempotencyKey");
CREATE INDEX "ERBU_org_link_status_requested_idx" ON "EnterpriseRelationshipBenefitUsage"("organizationId","identityLinkId","status","requestedAt");
CREATE INDEX "ERBU_org_benefit_status_requested_idx" ON "EnterpriseRelationshipBenefitUsage"("organizationId","benefitId","status","requestedAt");

INSERT INTO "EnterpriseModule" (
  "id","organizationId","sectorId","moduleCode","labelFr","labelEn","descriptionFr","descriptionEn",
  "moduleCategory","icon","isEnabled","isCore","sourceTemplateId","requiresPlanLevel","sortOrder","createdAt","updatedAt"
)
SELECT
  'relbenefit_' || substr(md5(o."id"), 1, 20),
  o."id", o."sectorId", 'RELATIONSHIP_BENEFITS',
  'Relations & avantages', 'Relationships & benefits',
  'Catalogue d’avantages et interactions des relations actives.',
  'Benefit catalogue and interactions for active relationships.',
  'ADMINISTRATION', 'badge-percent', true, false, NULL, 'BUSINESS', 75, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE o."organizationType" = 'CLIENT' AND o."deletedAt" IS NULL
ON CONFLICT ("organizationId","moduleCode") DO NOTHING;
