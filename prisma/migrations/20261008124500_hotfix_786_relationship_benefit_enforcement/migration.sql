ALTER TABLE "EnterpriseRelationshipBenefitUsage"
  ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'REQUEST',
  ADD COLUMN "effectModuleCode" TEXT,
  ADD COLUMN "effectEntityType" TEXT,
  ADD COLUMN "effectEntityId" TEXT,
  ADD COLUMN "effectAmount" DECIMAL(20,6),
  ADD COLUMN "effectCurrencyCode" TEXT,
  ADD COLUMN "effectIdempotencyKey" TEXT,
  ADD COLUMN "effectMetadataJson" JSONB,
  ADD COLUMN "executedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "EnterpriseRelationshipBenefitUsage_organizationId_effectIdempotencyKey_key"
  ON "EnterpriseRelationshipBenefitUsage"("organizationId", "effectIdempotencyKey");

CREATE INDEX "EnterpriseRelationshipBenefitUsage_organizationId_effectModuleCode_effectEntityType_effectEntityId_idx"
  ON "EnterpriseRelationshipBenefitUsage"("organizationId", "effectModuleCode", "effectEntityType", "effectEntityId");
