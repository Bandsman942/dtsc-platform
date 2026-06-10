ALTER TABLE "PharmacySale" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "PharmacySale" ADD COLUMN "invoiceId" TEXT;

CREATE TABLE "PharmacyCashSession" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "cashSessionNumber" TEXT NOT NULL, "cashPointName" TEXT, "cashPointType" TEXT,
  "cashierId" TEXT NOT NULL, "departmentId" TEXT, "financialAccountId" TEXT, "openedAt" TIMESTAMP(3) NOT NULL, "closedAt" TIMESTAMP(3),
  "openingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'USD', "theoreticalCashAmount" DECIMAL(14,2),
  "countedCashAmount" DECIMAL(14,2), "totalCashPayments" DECIMAL(14,2), "totalMobileMoneyPayments" DECIMAL(14,2),
  "totalCardPayments" DECIMAL(14,2), "totalTransferPayments" DECIMAL(14,2), "totalCreditPayments" DECIMAL(14,2),
  "totalInsurancePayments" DECIMAL(14,2), "totalRefunds" DECIMAL(14,2), "totalSales" DECIMAL(14,2), "totalPayments" DECIMAL(14,2),
  "varianceAmount" DECIMAL(14,2), "varianceCriticity" TEXT, "varianceJustification" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN',
  "submittedAt" TIMESTAMP(3), "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "rejectedById" TEXT, "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT, "financeSyncStatus" TEXT, "financeTransactionId" TEXT, "notes" TEXT, "createdById" TEXT NOT NULL,
  "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyCashSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPayment" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "paymentNumber" TEXT NOT NULL, "saleId" TEXT, "invoiceId" TEXT,
  "cashSessionId" TEXT, "customerId" TEXT, "cashierId" TEXT NOT NULL, "paymentMethod" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD', "paymentReference" TEXT, "payerName" TEXT, "payerPhone" TEXT, "paymentDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PAID', "cancellationReason" TEXT, "cancelledById" TEXT, "cancelledAt" TIMESTAMP(3), "notes" TEXT,
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyInvoice" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "invoiceNumber" TEXT NOT NULL, "saleId" TEXT, "customerId" TEXT,
  "customerName" TEXT, "invoiceDate" TIMESTAMP(3) NOT NULL, "dueDate" TIMESTAMP(3), "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2), "taxAmount" DECIMAL(14,2), "totalAmount" DECIMAL(14,2) NOT NULL, "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(14,2) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'USD', "status" TEXT NOT NULL DEFAULT 'DRAFT', "notes" TEXT,
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyCashReceipt" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "receiptNumber" TEXT NOT NULL, "saleId" TEXT, "paymentId" TEXT, "invoiceId" TEXT,
  "customerName" TEXT, "cashierId" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "paymentMethod" TEXT, "htmlContent" TEXT, "pdfUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'GENERATED', "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "generatedById" TEXT NOT NULL,
  "cancelledAt" TIMESTAMP(3), "cancelledById" TEXT, "cancellationReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyCashReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyRefund" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "refundNumber" TEXT NOT NULL, "saleId" TEXT NOT NULL, "paymentId" TEXT,
  "cashSessionId" TEXT, "refundType" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'USD',
  "reason" TEXT NOT NULL, "restockItems" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'SUBMITTED', "requestedById" TEXT NOT NULL,
  "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "rejectedById" TEXT, "rejectedAt" TIMESTAMP(3), "rejectionReason" TEXT, "paidAt" TIMESTAMP(3),
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyRefund_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyCashDiscrepancy" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "cashSessionId" TEXT NOT NULL, "cashierId" TEXT NOT NULL, "discrepancyType" TEXT NOT NULL,
  "theoreticalAmount" DECIMAL(14,2) NOT NULL, "countedAmount" DECIMAL(14,2) NOT NULL, "varianceAmount" DECIMAL(14,2) NOT NULL,
  "criticity" TEXT NOT NULL, "justification" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "responsibleUserId" TEXT, "resolvedAt" TIMESTAMP(3),
  "notes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyCashDiscrepancy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyCashSession_organizationId_cashSessionNumber_key" ON "PharmacyCashSession"("organizationId","cashSessionNumber");
CREATE INDEX "PharmacyCashSession_organizationId_status_openedAt_idx" ON "PharmacyCashSession"("organizationId","status","openedAt");
CREATE INDEX "PharmacyCashSession_organizationId_cashierId_status_idx" ON "PharmacyCashSession"("organizationId","cashierId","status");
CREATE UNIQUE INDEX "PharmacyPayment_organizationId_paymentNumber_key" ON "PharmacyPayment"("organizationId","paymentNumber");
CREATE INDEX "PharmacyPayment_organizationId_cashSessionId_status_idx" ON "PharmacyPayment"("organizationId","cashSessionId","status");
CREATE INDEX "PharmacyPayment_organizationId_saleId_idx" ON "PharmacyPayment"("organizationId","saleId");
CREATE INDEX "PharmacyPayment_organizationId_invoiceId_idx" ON "PharmacyPayment"("organizationId","invoiceId");
CREATE INDEX "PharmacyPayment_organizationId_paymentMethod_paymentDate_idx" ON "PharmacyPayment"("organizationId","paymentMethod","paymentDate");
CREATE UNIQUE INDEX "PharmacyInvoice_saleId_key" ON "PharmacyInvoice"("saleId");
CREATE UNIQUE INDEX "PharmacyInvoice_organizationId_invoiceNumber_key" ON "PharmacyInvoice"("organizationId","invoiceNumber");
CREATE INDEX "PharmacyInvoice_organizationId_status_invoiceDate_idx" ON "PharmacyInvoice"("organizationId","status","invoiceDate");
CREATE UNIQUE INDEX "PharmacyCashReceipt_organizationId_receiptNumber_key" ON "PharmacyCashReceipt"("organizationId","receiptNumber");
CREATE INDEX "PharmacyCashReceipt_organizationId_saleId_idx" ON "PharmacyCashReceipt"("organizationId","saleId");
CREATE INDEX "PharmacyCashReceipt_organizationId_paymentId_idx" ON "PharmacyCashReceipt"("organizationId","paymentId");
CREATE INDEX "PharmacyCashReceipt_organizationId_status_generatedAt_idx" ON "PharmacyCashReceipt"("organizationId","status","generatedAt");
CREATE UNIQUE INDEX "PharmacyRefund_organizationId_refundNumber_key" ON "PharmacyRefund"("organizationId","refundNumber");
CREATE INDEX "PharmacyRefund_organizationId_saleId_status_idx" ON "PharmacyRefund"("organizationId","saleId","status");
CREATE INDEX "PharmacyRefund_organizationId_cashSessionId_idx" ON "PharmacyRefund"("organizationId","cashSessionId");
CREATE INDEX "PharmacyCashDiscrepancy_organizationId_cashSessionId_status_idx" ON "PharmacyCashDiscrepancy"("organizationId","cashSessionId","status");
CREATE INDEX "PharmacyCashDiscrepancy_organizationId_criticity_status_idx" ON "PharmacyCashDiscrepancy"("organizationId","criticity","status");
CREATE INDEX "PharmacySale_organizationId_cashSessionId_idx" ON "PharmacySale"("organizationId","cashSessionId");
CREATE INDEX "PharmacySale_organizationId_invoiceId_idx" ON "PharmacySale"("organizationId","invoiceId");

ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "PharmacyCashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PharmacyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPayment" ADD CONSTRAINT "PharmacyPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPayment" ADD CONSTRAINT "PharmacyPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PharmacyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPayment" ADD CONSTRAINT "PharmacyPayment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "PharmacyCashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyInvoice" ADD CONSTRAINT "PharmacyInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashReceipt" ADD CONSTRAINT "PharmacyCashReceipt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashReceipt" ADD CONSTRAINT "PharmacyCashReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PharmacyPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashReceipt" ADD CONSTRAINT "PharmacyCashReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PharmacyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyRefund" ADD CONSTRAINT "PharmacyRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyRefund" ADD CONSTRAINT "PharmacyRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PharmacyPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyRefund" ADD CONSTRAINT "PharmacyRefund_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "PharmacyCashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashDiscrepancy" ADD CONSTRAINT "PharmacyCashDiscrepancy_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "PharmacyCashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
