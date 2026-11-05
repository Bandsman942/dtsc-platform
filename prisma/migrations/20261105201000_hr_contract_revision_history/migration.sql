-- #1028: Preserve the immutable content of every pre-approval contract edit.
-- Additive migration; historical contracts remain untouched.
CREATE TABLE "EnterpriseEmploymentContractRevision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "savedByUserId" TEXT NOT NULL,
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseEmploymentContractRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ECR_contract_revision_uniq"
  ON "EnterpriseEmploymentContractRevision"("organizationId", "contractId", "revisionNumber");
CREATE INDEX "ECR_contract_saved_idx"
  ON "EnterpriseEmploymentContractRevision"("organizationId", "contractId", "savedAt");
ALTER TABLE "EnterpriseEmploymentContractRevision"
  ADD CONSTRAINT "EnterpriseEmploymentContractRevision_organizationId_contractId_fkey"
  FOREIGN KEY ("organizationId", "contractId")
  REFERENCES "EnterpriseEmploymentContract"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
