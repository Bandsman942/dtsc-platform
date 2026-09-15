-- Gaming Lounge #644 — operational checkout links and daily-close snapshots.
-- Financial authority remains in EnterpriseSalesInvoice / EnterpriseReceivable /
-- EnterprisePayment / EnterpriseFinancialAccount / EnterpriseCashSession.

CREATE TABLE "EnterpriseGamingCheckout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVOICE_PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "refundRequestedAt" TIMESTAMP(3),
    "refundRequestedByUserId" TEXT,
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseGamingCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseGamingDailyClose" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "endedSessionCount" INTEGER NOT NULL DEFAULT 0,
    "paidSessionCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCheckoutCount" INTEGER NOT NULL DEFAULT 0,
    "refundedCheckoutCount" INTEGER NOT NULL DEFAULT 0,
    "submittedByUserId" TEXT NOT NULL,
    "validatedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseGamingDailyClose_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseGamingDailyCloseLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dailyCloseId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "paymentCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "inboundAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "expectedAmount" DECIMAL(20,6) NOT NULL,
    "declaredAmount" DECIMAL(20,6) NOT NULL,
    "differenceAmount" DECIMAL(20,6) NOT NULL,
    "varianceReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseGamingDailyCloseLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GamingCheckout_org_reference_key" ON "EnterpriseGamingCheckout"("organizationId", "reference");
CREATE UNIQUE INDEX "GamingCheckout_org_session_key" ON "EnterpriseGamingCheckout"("organizationId", "sessionId");
CREATE UNIQUE INDEX "GamingCheckout_org_invoice_key" ON "EnterpriseGamingCheckout"("organizationId", "salesInvoiceId");
CREATE UNIQUE INDEX "GamingCheckout_org_idempotency_key" ON "EnterpriseGamingCheckout"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseGamingCheckout_organizationId_id_key" ON "EnterpriseGamingCheckout"("organizationId", "id");
CREATE INDEX "EnterpriseGamingCheckout_organizationId_status_createdAt_idx" ON "EnterpriseGamingCheckout"("organizationId", "status", "createdAt");
CREATE INDEX "EnterpriseGamingCheckout_organizationId_refundRequestedAt_idx" ON "EnterpriseGamingCheckout"("organizationId", "refundRequestedAt");

CREATE UNIQUE INDEX "GamingDailyClose_org_reference_key" ON "EnterpriseGamingDailyClose"("organizationId", "reference");
CREATE UNIQUE INDEX "GamingDailyClose_org_idempotency_key" ON "EnterpriseGamingDailyClose"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseGamingDailyClose_organizationId_id_key" ON "EnterpriseGamingDailyClose"("organizationId", "id");
CREATE UNIQUE INDEX "GamingDailyClose_org_date_global_active_key"
  ON "EnterpriseGamingDailyClose"("organizationId", "businessDate")
  WHERE "siteId" IS NULL AND "status" IN ('SUBMITTED', 'VALIDATED');
CREATE UNIQUE INDEX "GamingDailyClose_org_date_site_active_key"
  ON "EnterpriseGamingDailyClose"("organizationId", "businessDate", "siteId")
  WHERE "siteId" IS NOT NULL AND "status" IN ('SUBMITTED', 'VALIDATED');
CREATE INDEX "EnterpriseGamingDailyClose_organizationId_businessDate_status_idx" ON "EnterpriseGamingDailyClose"("organizationId", "businessDate", "status");
CREATE INDEX "EnterpriseGamingDailyClose_organizationId_siteId_businessDate_idx" ON "EnterpriseGamingDailyClose"("organizationId", "siteId", "businessDate");

CREATE UNIQUE INDEX "EnterpriseGamingDailyCloseLine_organizationId_id_key" ON "EnterpriseGamingDailyCloseLine"("organizationId", "id");
CREATE UNIQUE INDEX "GamingDailyCloseLine_scope_key" ON "EnterpriseGamingDailyCloseLine"("organizationId", "dailyCloseId", "financialAccountId", "methodType");
CREATE INDEX "EnterpriseGamingDailyCloseLine_organizationId_dailyCloseId_idx" ON "EnterpriseGamingDailyCloseLine"("organizationId", "dailyCloseId");
CREATE INDEX "EnterpriseGamingDailyCloseLine_organizationId_financialAccountId_currencyCode_idx" ON "EnterpriseGamingDailyCloseLine"("organizationId", "financialAccountId", "currencyCode");
CREATE INDEX "EnterpriseGamingDailyCloseLine_organizationId_cashSessionId_idx" ON "EnterpriseGamingDailyCloseLine"("organizationId", "cashSessionId");

ALTER TABLE "EnterpriseGamingCheckout"
  ADD CONSTRAINT "EnterpriseGamingCheckout_org_session_fkey"
  FOREIGN KEY ("organizationId", "sessionId")
  REFERENCES "EnterpriseGamingSession"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingDailyCloseLine"
  ADD CONSTRAINT "EnterpriseGamingDailyCloseLine_org_close_fkey"
  FOREIGN KEY ("organizationId", "dailyCloseId")
  REFERENCES "EnterpriseGamingDailyClose"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnterpriseGamingCheckout"
  ADD CONSTRAINT "EnterpriseGamingCheckout_status_check"
  CHECK ("status" IN ('INVOICE_PENDING','AWAITING_PAYMENT','PARTIALLY_PAID','PAID','REFUND_PENDING','REFUNDED','CANCELLED'));

ALTER TABLE "EnterpriseGamingDailyClose"
  ADD CONSTRAINT "EnterpriseGamingDailyClose_status_check"
  CHECK ("status" IN ('SUBMITTED','VALIDATED','REJECTED'));

ALTER TABLE "EnterpriseGamingDailyClose"
  ADD CONSTRAINT "EnterpriseGamingDailyClose_counts_check"
  CHECK ("endedSessionCount" >= 0 AND "paidSessionCount" >= 0 AND "pendingCheckoutCount" >= 0 AND "refundedCheckoutCount" >= 0);

ALTER TABLE "EnterpriseGamingDailyCloseLine"
  ADD CONSTRAINT "EnterpriseGamingDailyCloseLine_amounts_check"
  CHECK ("paymentCount" >= 0 AND "refundCount" >= 0 AND "inboundAmount" >= 0 AND "refundAmount" >= 0);
