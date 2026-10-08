CREATE TABLE "EnterpriseRelationshipBenefitApplication" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "benefitId" TEXT NOT NULL,
  "identityLinkId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceModuleCode" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "applicationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "baseAmount" DECIMAL(20,6),
  "appliedAmount" DECIMAL(20,6),
  "currencyCode" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "contextJson" JSONB,
  "appliedByUserId" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnterpriseRelationshipBenefitApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterpriseRelationshipBenefitApplication_benefit_fkey"
    FOREIGN KEY ("organizationId","benefitId")
    REFERENCES "EnterpriseRelationshipBenefit"("organizationId","id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EnterpriseRelationshipBenefitApplication_org_id_key"
  ON "EnterpriseRelationshipBenefitApplication"("organizationId","id");
CREATE UNIQUE INDEX "EnterpriseRelationshipBenefitApplication_org_idempotency_key"
  ON "EnterpriseRelationshipBenefitApplication"("organizationId","idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseRelationshipBenefitApplication_org_source_benefit_link_key"
  ON "EnterpriseRelationshipBenefitApplication"("organizationId","sourceEntityType","sourceEntityId","benefitId","identityLinkId");
CREATE INDEX "EnterpriseRelationshipBenefitApplication_org_link_status_applied_idx"
  ON "EnterpriseRelationshipBenefitApplication"("organizationId","identityLinkId","status","appliedAt");
CREATE INDEX "EnterpriseRelationshipBenefitApplication_org_source_idx"
  ON "EnterpriseRelationshipBenefitApplication"("organizationId","sourceModuleCode","sourceEntityType","sourceEntityId");
CREATE INDEX "EnterpriseRelationshipBenefitApplication_org_benefit_status_idx"
  ON "EnterpriseRelationshipBenefitApplication"("organizationId","benefitId","status","appliedAt");
