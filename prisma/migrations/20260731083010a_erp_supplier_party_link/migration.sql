-- DTSC ERP consolidation iteration 02: supplier to business party link.

CREATE TABLE "EnterpriseSupplierPartyLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "paymentTerms" TEXT,
  "complianceStatus" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
  "averageLeadTimeDays" INTEGER,
  "migrationKey" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseSupplierPartyLink_pkey" PRIMARY KEY ("id")
);
