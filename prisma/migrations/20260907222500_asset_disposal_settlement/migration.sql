CREATE TABLE "EnterpriseAssetDisposalAccountingSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetDisposalId" TEXT NOT NULL,
    "proceedsLedgerAccountId" TEXT,
    "gainLedgerAccountId" TEXT,
    "lossLedgerAccountId" TEXT,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseAssetDisposalAccountingSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseAssetDisposalAccountingSettlement_org_id_key" ON "EnterpriseAssetDisposalAccountingSettlement"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseAssetDisposalAccountingSettlement_org_disposal_key" ON "EnterpriseAssetDisposalAccountingSettlement"("organizationId", "assetDisposalId");
CREATE INDEX "EnterpriseAssetDisposalAccountingSettlement_org_proceeds_idx" ON "EnterpriseAssetDisposalAccountingSettlement"("organizationId", "proceedsLedgerAccountId");
