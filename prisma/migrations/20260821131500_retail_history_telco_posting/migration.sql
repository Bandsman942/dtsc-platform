CREATE TABLE "EnterpriseRetailHistoricalImport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "previewJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "preparedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EnterpriseRetailHistoricalImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailHistoricalImport_organizationId_id_key"
  ON "EnterpriseRetailHistoricalImport"("organizationId", "id");

CREATE UNIQUE INDEX "EnterpriseRetailHistoricalImport_organizationId_reference_key"
  ON "EnterpriseRetailHistoricalImport"("organizationId", "reference");

CREATE INDEX "EnterpriseRetailHistoricalImport_organizationId_status_periodStart_idx"
  ON "EnterpriseRetailHistoricalImport"("organizationId", "status", "periodStart");

CREATE INDEX "EnterpriseRetailHistoricalImport_organizationId_createdAt_idx"
  ON "EnterpriseRetailHistoricalImport"("organizationId", "createdAt");
