CREATE TABLE "EnterpriseInventoryQualityScan" (
  "organizationId" TEXT NOT NULL,
  "nextScanAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseInventoryQualityScan_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "EnterpriseInventoryQualityScan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "inventory_quality_scan_due_idx" ON "EnterpriseInventoryQualityScan"("nextScanAt","leaseUntil");
