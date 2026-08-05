ALTER TABLE "BillingPlan" ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'PERSONAL';

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoiceType" TEXT NOT NULL DEFAULT 'SUBSCRIPTION_PERSONAL';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "recipientEmails" JSONB;

CREATE INDEX IF NOT EXISTS "Invoice_invoiceType_issuedAt_idx" ON "Invoice"("invoiceType", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_organizationId_invoiceType_issuedAt_idx" ON "Invoice"("organizationId", "invoiceType", "issuedAt");

CREATE TABLE IF NOT EXISTS "CollaborationConnection" (
  "id" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "message" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationConnection_pairKey_key" ON "CollaborationConnection"("pairKey");
CREATE INDEX IF NOT EXISTS "CollaborationConnection_requesterId_status_updatedAt_idx" ON "CollaborationConnection"("requesterId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CollaborationConnection_recipientId_status_updatedAt_idx" ON "CollaborationConnection"("recipientId", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "SubscriptionManualPayment" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "planId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "organizationSubscriptionId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "paymentMethod" TEXT NOT NULL,
  "paymentReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
  "requestedByUserId" TEXT NOT NULL,
  "validatedByUserId" TEXT,
  "validationComment" TEXT,
  "validatedAt" TIMESTAMP(3),
  "invoiceId" TEXT,
  "revenueTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionManualPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionManualPayment_idempotencyKey_key" ON "SubscriptionManualPayment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_scope_status_createdAt_idx" ON "SubscriptionManualPayment"("scope", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_userId_status_createdAt_idx" ON "SubscriptionManualPayment"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_organizationId_status_createdAt_idx" ON "SubscriptionManualPayment"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_requestedByUserId_createdAt_idx" ON "SubscriptionManualPayment"("requestedByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_validatedByUserId_validatedAt_idx" ON "SubscriptionManualPayment"("validatedByUserId", "validatedAt");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_invoiceId_idx" ON "SubscriptionManualPayment"("invoiceId");
CREATE INDEX IF NOT EXISTS "SubscriptionManualPayment_revenueTransactionId_idx" ON "SubscriptionManualPayment"("revenueTransactionId");

UPDATE "Invoice" SET "invoiceType" = 'HRCFO_TRANSACTION' WHERE "hrcfoTransactionId" IS NOT NULL;
UPDATE "Invoice" SET "invoiceType" = 'SUBSCRIPTION_PERSONAL' WHERE "paymentId" IS NOT NULL AND "hrcfoTransactionId" IS NULL;
