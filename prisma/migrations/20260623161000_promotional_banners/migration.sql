-- Add managed promotional banners with per-user dismissals.
CREATE TABLE "PromotionalBanner" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "surfacesJson" JSONB NOT NULL DEFAULT '[]',
  "includeRoles" JSONB NOT NULL DEFAULT '[]',
  "excludeRoles" JSONB NOT NULL DEFAULT '[]',
  "ctaLabel" TEXT,
  "ctaUrl" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionalBanner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionalBannerDismissal" (
  "id" TEXT NOT NULL,
  "bannerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionalBannerDismissal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromotionalBanner_status_archivedAt_startsAt_endsAt_priority_idx"
  ON "PromotionalBanner"("status", "archivedAt", "startsAt", "endsAt", "priority");

CREATE INDEX "PromotionalBanner_createdById_createdAt_idx"
  ON "PromotionalBanner"("createdById", "createdAt");

CREATE UNIQUE INDEX "PromotionalBannerDismissal_bannerId_userId_key"
  ON "PromotionalBannerDismissal"("bannerId", "userId");

CREATE INDEX "PromotionalBannerDismissal_userId_createdAt_idx"
  ON "PromotionalBannerDismissal"("userId", "createdAt");

ALTER TABLE "PromotionalBanner"
  ADD CONSTRAINT "PromotionalBanner_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionalBannerDismissal"
  ADD CONSTRAINT "PromotionalBannerDismissal_bannerId_fkey"
  FOREIGN KEY ("bannerId") REFERENCES "PromotionalBanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionalBannerDismissal"
  ADD CONSTRAINT "PromotionalBannerDismissal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
