-- Additive only: canonical Finance and Inventory records remain authoritative.
ALTER TABLE "EnterpriseRetailInvoiceCheckout"
  ADD COLUMN "invoiceFooterSnapshot" JSONB;

CREATE TABLE "EnterpriseRetailDirectCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "salesInvoiceId" TEXT,
  "paymentId" TEXT,
  "cashTendered" DECIMAL(20,6) NOT NULL,
  "lockToken" TEXT,
  "lockUntil" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailDirectCheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "retail_direct_checkout_positive_tender" CHECK ("cashTendered" > 0),
  CONSTRAINT "retail_direct_checkout_state" CHECK ("status" IN ('PENDING','PROCESSING','FAILED','COMPLETED'))
);
CREATE UNIQUE INDEX "EnterpriseRetailDirectCheckoutAttempt_organizationId_id_key"
  ON "EnterpriseRetailDirectCheckoutAttempt" ("organizationId","id");
CREATE UNIQUE INDEX "EnterpriseRetailDirectCheckoutAttempt_organizationId_idempotencyKey_key"
  ON "EnterpriseRetailDirectCheckoutAttempt" ("organizationId","idempotencyKey");
CREATE INDEX "EnterpriseRetailDirectCheckoutAttempt_organizationId_actorUserId_createdAt_idx"
  ON "EnterpriseRetailDirectCheckoutAttempt" ("organizationId","actorUserId","createdAt");
CREATE INDEX "EnterpriseRetailDirectCheckoutAttempt_organizationId_status_updatedAt_idx"
  ON "EnterpriseRetailDirectCheckoutAttempt" ("organizationId","status","updatedAt");
