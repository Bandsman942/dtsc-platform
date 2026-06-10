CREATE TABLE "PharmacySale" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "saleNumber" TEXT NOT NULL, "saleType" TEXT NOT NULL,
  "customerName" TEXT, "customerPhone" TEXT, "customerType" TEXT, "prescriptionId" TEXT, "prescriberName" TEXT,
  "cashierId" TEXT NOT NULL, "pharmacistId" TEXT, "departmentId" TEXT, "saleDate" TIMESTAMP(3) NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL, "globalDiscount" DECIMAL(8,2), "taxAmount" DECIMAL(14,2), "totalAmount" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0, "remainingAmount" DECIMAL(14,2) NOT NULL, "changeAmount" DECIMAL(14,2),
  "paymentMethod" TEXT, "paymentReference" TEXT, "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  "validationRequired" BOOLEAN NOT NULL DEFAULT false, "pharmacistValidationStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "pharmacistValidationComment" TEXT, "pharmacistValidatedAt" TIMESTAMP(3), "pharmacistRejectionReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "stockImpactApplied" BOOLEAN NOT NULL DEFAULT false, "receiptGenerated" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT, "cancellationReason" TEXT, "cancelledById" TEXT, "cancelledAt" TIMESTAMP(3), "refundedAmount" DECIMAL(14,2),
  "createdById" TEXT NOT NULL, "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySale_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacySaleLine" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "saleId" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL, "unit" TEXT NOT NULL, "unitPrice" DECIMAL(14,2) NOT NULL, "lineDiscount" DECIMAL(8,2),
  "totalLine" DECIMAL(14,2) NOT NULL, "lineStatus" TEXT NOT NULL DEFAULT 'DRAFT', "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
  "requiresPharmacistValidation" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySaleLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacySaleRefund" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "saleId" TEXT NOT NULL, "refundType" TEXT NOT NULL, "refundAmount" DECIMAL(14,2) NOT NULL,
  "restockItems" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT NOT NULL, "validatedById" TEXT, "status" TEXT NOT NULL DEFAULT 'VALIDATED',
  "notes" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySaleRefund_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacySaleRefundLine" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "refundId" TEXT NOT NULL, "saleLineId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL, "quantityReturned" DECIMAL(14,3) NOT NULL, "restocked" BOOLEAN NOT NULL DEFAULT false, "itemCondition" TEXT, "notes" TEXT,
  CONSTRAINT "PharmacySaleRefundLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacySaleAnomaly" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "saleId" TEXT NOT NULL, "saleLineId" TEXT, "productId" TEXT, "batchId" TEXT,
  "anomalyType" TEXT NOT NULL, "description" TEXT NOT NULL, "criticality" TEXT NOT NULL DEFAULT 'MEDIUM', "responsibleUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "proposedAction" TEXT, "notes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacySaleAnomaly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacySale_organizationId_saleNumber_key" ON "PharmacySale"("organizationId","saleNumber");
CREATE INDEX "PharmacySale_organizationId_status_saleDate_idx" ON "PharmacySale"("organizationId","status","saleDate");
CREATE INDEX "PharmacySale_organizationId_paymentStatus_idx" ON "PharmacySale"("organizationId","paymentStatus");
CREATE INDEX "PharmacySale_organizationId_cashierId_idx" ON "PharmacySale"("organizationId","cashierId");
CREATE INDEX "PharmacySale_organizationId_pharmacistId_idx" ON "PharmacySale"("organizationId","pharmacistId");
CREATE INDEX "PharmacySaleLine_organizationId_saleId_idx" ON "PharmacySaleLine"("organizationId","saleId");
CREATE INDEX "PharmacySaleLine_organizationId_productId_idx" ON "PharmacySaleLine"("organizationId","productId");
CREATE INDEX "PharmacySaleLine_organizationId_batchId_idx" ON "PharmacySaleLine"("organizationId","batchId");
CREATE INDEX "PharmacySaleRefund_organizationId_saleId_idx" ON "PharmacySaleRefund"("organizationId","saleId");
CREATE INDEX "PharmacySaleRefund_organizationId_status_idx" ON "PharmacySaleRefund"("organizationId","status");
CREATE INDEX "PharmacySaleRefundLine_organizationId_refundId_idx" ON "PharmacySaleRefundLine"("organizationId","refundId");
CREATE INDEX "PharmacySaleRefundLine_organizationId_saleLineId_idx" ON "PharmacySaleRefundLine"("organizationId","saleLineId");
CREATE INDEX "PharmacySaleAnomaly_organizationId_saleId_status_idx" ON "PharmacySaleAnomaly"("organizationId","saleId","status");
CREATE INDEX "PharmacySaleAnomaly_organizationId_criticality_status_idx" ON "PharmacySaleAnomaly"("organizationId","criticality","status");
ALTER TABLE "PharmacySaleLine" ADD CONSTRAINT "PharmacySaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySaleRefund" ADD CONSTRAINT "PharmacySaleRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySaleRefundLine" ADD CONSTRAINT "PharmacySaleRefundLine_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "PharmacySaleRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySaleRefundLine" ADD CONSTRAINT "PharmacySaleRefundLine_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "PharmacySaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacySaleAnomaly" ADD CONSTRAINT "PharmacySaleAnomaly_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PharmacySale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySaleAnomaly" ADD CONSTRAINT "PharmacySaleAnomaly_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "PharmacySaleLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
