-- Progressive hybrid multi-tenant foundation for DTSC Platform.
-- All organization links are nullable at this stage to avoid breaking existing data.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "logoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "organizationType" TEXT NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Africa/Kinshasa',
  ADD COLUMN IF NOT EXISTS "settingsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "brandingJson" JSONB,
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByDtscUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "Organization"
SET "slug" = trim(both '-' from lower(regexp_replace(coalesce("slug", "name", "id"), '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || left("id", 8)
WHERE "slug" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_status_organizationType_idx" ON "Organization"("status", "organizationType");
CREATE INDEX IF NOT EXISTS "Organization_createdByDtscUserId_idx" ON "Organization"("createdByDtscUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Organization_createdByDtscUserId_fkey'
      AND table_name = 'Organization'
  ) THEN
    ALTER TABLE "Organization"
      ADD CONSTRAINT "Organization_createdByDtscUserId_fkey"
      FOREIGN KEY ("createdByDtscUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "Organization" (
  "id",
  "name",
  "slug",
  "status",
  "organizationType",
  "sector",
  "industry",
  "country",
  "city",
  "timezone",
  "createdAt",
  "updatedAt"
)
VALUES (
  'dtsc-internal',
  'DTSC Internal',
  'dtsc-internal',
  'ACTIVE',
  'DTSC_INTERNAL',
  'Technology',
  'Data, IA et transformation digitale',
  'RDC',
  'Kinshasa',
  'Africa/Kinshasa',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

CREATE TABLE IF NOT EXISTS "OrganizationMember" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "invitedBy" TEXT,
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "OrganizationMember_userId_status_idx" ON "OrganizationMember"("userId", "status");
CREATE INDEX IF NOT EXISTS "OrganizationMember_organizationId_role_status_idx" ON "OrganizationMember"("organizationId", "role", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationMember_organizationId_fkey') THEN
    ALTER TABLE "OrganizationMember"
      ADD CONSTRAINT "OrganizationMember_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationMember_userId_fkey') THEN
    ALTER TABLE "OrganizationMember"
      ADD CONSTRAINT "OrganizationMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrganizationAdminGrant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedByDtscUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationAdminGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrganizationAdminGrant_organizationId_status_idx" ON "OrganizationAdminGrant"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "OrganizationAdminGrant_userId_status_idx" ON "OrganizationAdminGrant"("userId", "status");
CREATE INDEX IF NOT EXISTS "OrganizationAdminGrant_grantedByDtscUserId_idx" ON "OrganizationAdminGrant"("grantedByDtscUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationAdminGrant_organizationId_fkey') THEN
    ALTER TABLE "OrganizationAdminGrant"
      ADD CONSTRAINT "OrganizationAdminGrant_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationAdminGrant_userId_fkey') THEN
    ALTER TABLE "OrganizationAdminGrant"
      ADD CONSTRAINT "OrganizationAdminGrant_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationAdminGrant_grantedByDtscUserId_fkey') THEN
    ALTER TABLE "OrganizationAdminGrant"
      ADD CONSTRAINT "OrganizationAdminGrant_grantedByDtscUserId_fkey"
      FOREIGN KEY ("grantedByDtscUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrganizationSubscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  "startedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "createdByDtscUserId" TEXT,
  "updatedByDtscUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrganizationSubscription_organizationId_status_idx" ON "OrganizationSubscription"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "OrganizationSubscription_planId_idx" ON "OrganizationSubscription"("planId");
CREATE INDEX IF NOT EXISTS "OrganizationSubscription_expiresAt_idx" ON "OrganizationSubscription"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationSubscription_organizationId_fkey') THEN
    ALTER TABLE "OrganizationSubscription"
      ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationSubscription_planId_fkey') THEN
    ALTER TABLE "OrganizationSubscription"
      ADD CONSTRAINT "OrganizationSubscription_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationSubscription_createdByDtscUserId_fkey') THEN
    ALTER TABLE "OrganizationSubscription"
      ADD CONSTRAINT "OrganizationSubscription_createdByDtscUserId_fkey"
      FOREIGN KEY ("createdByDtscUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrganizationSubscription_updatedByDtscUserId_fkey') THEN
    ALTER TABLE "OrganizationSubscription"
      ADD CONSTRAINT "OrganizationSubscription_updatedByDtscUserId_fkey"
      FOREIGN KEY ("updatedByDtscUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BillingRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentMethod" TEXT,
  "reference" TEXT,
  "invoiceUrl" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BillingRecord_organizationId_status_createdAt_idx" ON "BillingRecord"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingRecord_subscriptionId_idx" ON "BillingRecord"("subscriptionId");
CREATE INDEX IF NOT EXISTS "BillingRecord_reference_idx" ON "BillingRecord"("reference");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BillingRecord_organizationId_fkey') THEN
    ALTER TABLE "BillingRecord"
      ADD CONSTRAINT "BillingRecord_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BillingRecord_subscriptionId_fkey') THEN
    ALTER TABLE "BillingRecord"
      ADD CONSTRAINT "BillingRecord_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'BillingRecord_createdByUserId_fkey') THEN
    ALTER TABLE "BillingRecord"
      ADD CONSTRAINT "BillingRecord_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedToDtscUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SupportTicket_organizationId_status_createdAt_idx" ON "SupportTicket"("organizationId", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'SupportTicket_organizationId_fkey') THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT "SupportTicket_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "authorOrganizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'GLOBAL_PRIVATE',
  ADD COLUMN IF NOT EXISTS "moderationStatus" TEXT NOT NULL DEFAULT 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "Announcement_scope_organizationId_moderationStatus_idx" ON "Announcement"("scope", "organizationId", "moderationStatus");
CREATE INDEX IF NOT EXISTS "Announcement_authorOrganizationId_idx" ON "Announcement"("authorOrganizationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Announcement_organizationId_fkey') THEN
    ALTER TABLE "Announcement"
      ADD CONSTRAINT "Announcement_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Announcement_authorOrganizationId_fkey') THEN
    ALTER TABLE "Announcement"
      ADD CONSTRAINT "Announcement_authorOrganizationId_fkey"
      FOREIGN KEY ("authorOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "CollaborationGroup"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "CollaborationGroup_organizationId_groupType_status_idx" ON "CollaborationGroup"("organizationId", "groupType", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CollaborationGroup_organizationId_fkey') THEN
    ALTER TABLE "CollaborationGroup"
      ADD CONSTRAINT "CollaborationGroup_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
