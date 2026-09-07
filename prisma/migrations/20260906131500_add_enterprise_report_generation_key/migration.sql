ALTER TABLE "EnterpriseReport"
  ADD COLUMN "generationKey" TEXT,
  ADD COLUMN "calculationVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "EnterpriseReport_organizationId_generationKey_key"
  ON "EnterpriseReport"("organizationId", "generationKey");

CREATE INDEX "EnterpriseReport_organizationId_calculationVersion_generatedAt_idx"
  ON "EnterpriseReport"("organizationId", "calculationVersion", "generatedAt");
