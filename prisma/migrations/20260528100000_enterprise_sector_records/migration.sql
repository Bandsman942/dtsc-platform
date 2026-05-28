-- Non-destructive generic sector business records for enterprise workspaces.

CREATE TABLE IF NOT EXISTS "EnterpriseSectorRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sectorCode" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "payloadJson" JSONB,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "assignedToUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseSectorRecord_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseSectorRecord_organizationId_fkey'
  ) THEN
    ALTER TABLE "EnterpriseSectorRecord"
      ADD CONSTRAINT "EnterpriseSectorRecord_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseSectorRecord_createdById_fkey'
  ) THEN
    ALTER TABLE "EnterpriseSectorRecord"
      ADD CONSTRAINT "EnterpriseSectorRecord_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseSectorRecord_updatedById_fkey'
  ) THEN
    ALTER TABLE "EnterpriseSectorRecord"
      ADD CONSTRAINT "EnterpriseSectorRecord_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EnterpriseSectorRecord_assignedToUserId_fkey'
  ) THEN
    ALTER TABLE "EnterpriseSectorRecord"
      ADD CONSTRAINT "EnterpriseSectorRecord_assignedToUserId_fkey"
      FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EnterpriseSectorRecord_org_sector_module_status_idx"
  ON "EnterpriseSectorRecord"("organizationId", "sectorCode", "moduleCode", "status");

CREATE INDEX IF NOT EXISTS "EnterpriseSectorRecord_org_record_created_idx"
  ON "EnterpriseSectorRecord"("organizationId", "recordType", "createdAt");

CREATE INDEX IF NOT EXISTS "EnterpriseSectorRecord_createdBy_created_idx"
  ON "EnterpriseSectorRecord"("createdById", "createdAt");

CREATE INDEX IF NOT EXISTS "EnterpriseSectorRecord_assigned_status_idx"
  ON "EnterpriseSectorRecord"("assignedToUserId", "status");

CREATE INDEX IF NOT EXISTS "EnterpriseSectorRecord_deletedAt_idx"
  ON "EnterpriseSectorRecord"("deletedAt");
