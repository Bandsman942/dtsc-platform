-- Additive tax configuration: old tax codes remain usable and never activate
-- automatic taxation until an authorized organization explicitly opts in.
ALTER TABLE "EnterpriseTaxCode"
  ADD COLUMN "sourceTemplateCode" TEXT,
  ADD COLUMN "sourceTemplateVersion" TEXT,
  ADD COLUMN "autoApply" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "taxTreatment" TEXT NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "EnterpriseTaxCode_organizationId_isActive_autoApply_idx"
  ON "EnterpriseTaxCode"("organizationId", "isActive", "autoApply");
