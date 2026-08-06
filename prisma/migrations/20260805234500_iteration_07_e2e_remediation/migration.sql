CREATE TABLE IF NOT EXISTS "CollaborationContactRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationContactRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationContactRequest_requesterId_targetUserId_key" ON "CollaborationContactRequest"("requesterId", "targetUserId");
CREATE INDEX IF NOT EXISTS "CollaborationContactRequest_targetUserId_status_createdAt_idx" ON "CollaborationContactRequest"("targetUserId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationContactRequest_requesterId_status_createdAt_idx" ON "CollaborationContactRequest"("requesterId", "status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CollaborationContactRequest" ADD CONSTRAINT "CollaborationContactRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CollaborationContactRequest" ADD CONSTRAINT "CollaborationContactRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "BillingPlan" ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'BOTH';
ALTER TABLE "BillingPlanVersion" ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'BOTH';

UPDATE "BillingPlan"
SET "audience" = 'PERSONAL'
WHERE "id" IN ('freemium', 'starter', 'growth', 'premium')
  AND "audience" = 'BOTH';

UPDATE "BillingPlanVersion" AS version
SET "audience" = plan."audience"
FROM "BillingPlan" AS plan
WHERE version."planId" = plan."id";
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "organizationSubscriptionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "organizationSubscriptionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "manualPaymentId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'PERSONAL_SUBSCRIPTION';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT;

CREATE TABLE IF NOT EXISTS "ManualSubscriptionPayment" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "planId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "organizationSubscriptionId" TEXT,
  "paymentId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "paymentMethod" TEXT NOT NULL,
  "externalReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
  "requestedByUserId" TEXT NOT NULL,
  "validatorUserId" TEXT NOT NULL,
  "validatedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "validationComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualSubscriptionPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ManualSubscriptionPayment_idempotencyKey_key" ON "ManualSubscriptionPayment"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ManualSubscriptionPayment_paymentId_key" ON "ManualSubscriptionPayment"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_manualPaymentId_key" ON "Invoice"("manualPaymentId");
CREATE INDEX IF NOT EXISTS "ManualSubscriptionPayment_scope_status_requestedAt_idx" ON "ManualSubscriptionPayment"("scope", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "ManualSubscriptionPayment_userId_status_requestedAt_idx" ON "ManualSubscriptionPayment"("userId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "ManualSubscriptionPayment_organizationId_status_requestedAt_idx" ON "ManualSubscriptionPayment"("organizationId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "ManualSubscriptionPayment_validatorUserId_status_requestedAt_idx" ON "ManualSubscriptionPayment"("validatorUserId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "Payment_organizationId_status_createdAt_idx" ON "Payment"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_organizationSubscriptionId_idx" ON "Payment"("organizationSubscriptionId");
CREATE INDEX IF NOT EXISTS "Invoice_category_issuedAt_idx" ON "Invoice"("category", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_organizationId_category_issuedAt_idx" ON "Invoice"("organizationId", "category", "issuedAt");

UPDATE "Invoice"
SET "category" = 'HR_CFO_TRANSACTION'
WHERE "hrcfoTransactionId" IS NOT NULL
  AND "paymentId" IS NULL
  AND "category" = 'PERSONAL_SUBSCRIPTION';

DO $$ BEGIN ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationSubscriptionId_fkey" FOREIGN KEY ("organizationSubscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationSubscriptionId_fkey" FOREIGN KEY ("organizationSubscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_organizationSubscriptionId_fkey" FOREIGN KEY ("organizationSubscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManualSubscriptionPayment" ADD CONSTRAINT "ManualSubscriptionPayment_validatorUserId_fkey" FOREIGN KEY ("validatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_manualPaymentId_fkey" FOREIGN KEY ("manualPaymentId") REFERENCES "ManualSubscriptionPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
