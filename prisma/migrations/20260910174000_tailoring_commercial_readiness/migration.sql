-- Manufacturing 4/4 #608: persistent Couture self-service onboarding state.
-- This table stores only onboarding choices/progress. Canonical company, site,
-- warehouse, catalog, inventory, finance and production data remain in Core ERP.

CREATE TABLE "EnterpriseTailoringOnboardingRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "currentStep" TEXT NOT NULL DEFAULT 'IDENTITY',
  "operatingMode" TEXT NOT NULL DEFAULT 'MIXED',
  "preferredSiteId" TEXT,
  "preferredWarehouseId" TEXT,
  "readinessJson" JSONB,
  "blockedReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseTailoringOnboardingRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseTailoringOnboardingRun_organizationId_key"
  ON "EnterpriseTailoringOnboardingRun"("organizationId");
CREATE INDEX "TailoringOnboarding_org_status_updated_idx"
  ON "EnterpriseTailoringOnboardingRun"("organizationId", "status", "updatedAt");
CREATE INDEX "TailoringOnboarding_org_archived_updated_idx"
  ON "EnterpriseTailoringOnboardingRun"("organizationId", "archivedAt", "updatedAt");
