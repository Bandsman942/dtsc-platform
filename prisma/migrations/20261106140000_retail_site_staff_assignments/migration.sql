-- Tenant-aware optional boutique roles, additive to existing organization RBAC.
CREATE TABLE "EnterpriseRetailSiteAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleCode" TEXT NOT NULL,
  "permissionsJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailSiteAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailSiteAssignment_organizationId_siteId_userId_key"
  ON "EnterpriseRetailSiteAssignment"("organizationId", "siteId", "userId");
CREATE INDEX "EnterpriseRetailSiteAssignment_organizationId_userId_isActi_idx"
  ON "EnterpriseRetailSiteAssignment"("organizationId", "userId", "isActive");
CREATE INDEX "EnterpriseRetailSiteAssignment_organizationId_siteId_roleCo_idx"
  ON "EnterpriseRetailSiteAssignment"("organizationId", "siteId", "roleCode", "isActive");
ALTER TABLE "EnterpriseRetailSiteAssignment"
  ADD CONSTRAINT "EnterpriseRetailSiteAssignment_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "EnterpriseSite"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailSiteAssignment"
  ADD CONSTRAINT "EnterpriseRetailSiteAssignment_organizationId_userId_fkey"
  FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMember"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
