-- New operational workflow only: never recreate a financial account or ledger.
-- Historical CRM migrations did not materialize these Prisma-declared composite
-- uniques. They are redundant with the global id PKs, but PostgreSQL requires
-- an actual unique index on the exact columns of a tenant-scoped foreign key.
-- Creating them before the new tables' FKs repairs that physical schema gap
-- without rewriting or dropping any previous migration.
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseSalesOrder_organizationId_id_key"
  ON "EnterpriseSalesOrder"("organizationId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "EnterpriseSalesOrderItem_organizationId_id_key"
  ON "EnterpriseSalesOrderItem"("organizationId", "id");

CREATE TABLE "EnterpriseRetailOmnichannelReturn" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "reason" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "refundAmount" DECIMAL(20,6) NOT NULL,
  "salesInvoiceId" TEXT NOT NULL,
  "sourcePaymentId" TEXT NOT NULL,
  "refundPaymentId" TEXT,
  "salesCreditNoteId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "validatorUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "preparedByUserId" TEXT,
  "settledByUserId" TEXT,
  "inspectedByUserId" TEXT,
  "inspectedAt" TIMESTAMP(3),
  "inspectionNotes" TEXT,
  "decisionReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseRetailOmnichannelReturn_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseRetailOmnichannelReturnLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "salesOrderItemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "refundAmount" DECIMAL(20,6) NOT NULL,
  "stockDisposition" TEXT NOT NULL,
  "productCondition" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseRetailOmnichannelReturnLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_id_key" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_number_key" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_idempotencyKey_key" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_refundPaymentId_key" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "refundPaymentId");
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_salesCreditNoteId_key" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "salesCreditNoteId");
CREATE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_salesOrderId_status_idx" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "salesOrderId", "status");
CREATE INDEX "EnterpriseRetailOmnichannelReturn_organizationId_validatorUserId_status_createdAt_idx" ON "EnterpriseRetailOmnichannelReturn"("organizationId", "validatorUserId", "status", "createdAt");
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturnLine_organizationId_id_key" ON "EnterpriseRetailOmnichannelReturnLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailOmnichannelReturnLine_organizationId_returnId_salesOrderItemId_key" ON "EnterpriseRetailOmnichannelReturnLine"("organizationId", "returnId", "salesOrderItemId");
CREATE INDEX "EnterpriseRetailOmnichannelReturnLine_organizationId_salesOrderItemId_idx" ON "EnterpriseRetailOmnichannelReturnLine"("organizationId", "salesOrderItemId");
ALTER TABLE "EnterpriseRetailOmnichannelReturn" ADD CONSTRAINT "EnterpriseRetailOmnichannelReturn_organizationId_salesOrderId_fkey" FOREIGN KEY ("organizationId", "salesOrderId") REFERENCES "EnterpriseSalesOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailOmnichannelReturnLine" ADD CONSTRAINT "EnterpriseRetailOmnichannelReturnLine_organizationId_returnId_fkey" FOREIGN KEY ("organizationId", "returnId") REFERENCES "EnterpriseRetailOmnichannelReturn"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailOmnichannelReturnLine" ADD CONSTRAINT "EnterpriseRetailOmnichannelReturnLine_organizationId_salesOrderItemId_fkey" FOREIGN KEY ("organizationId", "salesOrderItemId") REFERENCES "EnterpriseSalesOrderItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
