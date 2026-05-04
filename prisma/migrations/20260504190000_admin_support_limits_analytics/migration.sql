ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "dailyMessageLimit" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS "dailyTokenLimit" INTEGER NOT NULL DEFAULT 100000;

ALTER TABLE "SupportTicket"
ADD COLUMN IF NOT EXISTS "resolution" TEXT,
ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SiteVisit" (
  "id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "referrer" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteVisit_path_createdAt_idx" ON "SiteVisit"("path", "createdAt");
CREATE INDEX IF NOT EXISTS "SiteVisit_createdAt_idx" ON "SiteVisit"("createdAt");
