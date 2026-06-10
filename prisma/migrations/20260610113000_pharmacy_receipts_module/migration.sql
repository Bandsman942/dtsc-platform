CREATE TABLE "PharmacyReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "receiptType" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseOrderId" TEXT,
  "departmentId" TEXT,
  "mainLocationId" TEXT,
  "receivedById" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "supplierInvoiceReference" TEXT,
  "deliveryNoteReference" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "deliveryNoteDate" TIMESTAMP(3),
  "totalAmount" DECIMAL(14,2),
  "totalItems" DECIMAL(14,3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "validatedById" TEXT,
  "validatedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "stockImpactApplied" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyReceiptLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "purchaseOrderLineId" TEXT,
  "orderedQuantity" DECIMAL(14,3),
  "previouslyReceivedQuantity" DECIMAL(14,3),
  "receivedQuantity" DECIMAL(14,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "purchasePrice" DECIMAL(14,2),
  "supplierDiscount" DECIMAL(8,2),
  "totalLine" DECIMAL(14,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyReceiptBatch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "receiptLineId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "batchId" TEXT,
  "createNewBatch" BOOLEAN NOT NULL DEFAULT true,
  "batchNumber" TEXT NOT NULL,
  "manufacturingDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "barcode" TEXT,
  "receivedQuantity" DECIMAL(14,3) NOT NULL,
  "locationId" TEXT,
  "initialStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReceiptBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyReceiptDiscrepancy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "receiptLineId" TEXT,
  "productId" TEXT,
  "receiptBatchId" TEXT,
  "batchId" TEXT,
  "discrepancyType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "affectedQuantity" DECIMAL(14,3),
  "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
  "responsibleUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "proposedAction" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReceiptDiscrepancy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyReceiptDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "supplierId" TEXT,
  "purchaseOrderId" TEXT,
  "receiptBatchId" TEXT,
  "batchId" TEXT,
  "documentType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "reference" TEXT,
  "documentDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReceiptDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyReceipt_organizationId_receiptNumber_key" ON "PharmacyReceipt"("organizationId", "receiptNumber");
CREATE INDEX "PharmacyReceipt_organizationId_status_receivedAt_idx" ON "PharmacyReceipt"("organizationId", "status", "receivedAt");
CREATE INDEX "PharmacyReceipt_organizationId_supplierId_idx" ON "PharmacyReceipt"("organizationId", "supplierId");
CREATE INDEX "PharmacyReceipt_organizationId_purchaseOrderId_idx" ON "PharmacyReceipt"("organizationId", "purchaseOrderId");
CREATE INDEX "PharmacyReceiptLine_organizationId_receiptId_idx" ON "PharmacyReceiptLine"("organizationId", "receiptId");
CREATE INDEX "PharmacyReceiptLine_organizationId_productId_idx" ON "PharmacyReceiptLine"("organizationId", "productId");
CREATE INDEX "PharmacyReceiptLine_organizationId_purchaseOrderLineId_idx" ON "PharmacyReceiptLine"("organizationId", "purchaseOrderLineId");
CREATE INDEX "PharmacyReceiptBatch_organizationId_receiptId_idx" ON "PharmacyReceiptBatch"("organizationId", "receiptId");
CREATE INDEX "PharmacyReceiptBatch_organizationId_receiptLineId_idx" ON "PharmacyReceiptBatch"("organizationId", "receiptLineId");
CREATE INDEX "PharmacyReceiptBatch_organizationId_productId_idx" ON "PharmacyReceiptBatch"("organizationId", "productId");
CREATE INDEX "PharmacyReceiptBatch_organizationId_batchId_idx" ON "PharmacyReceiptBatch"("organizationId", "batchId");
CREATE INDEX "PharmacyReceiptBatch_organizationId_expiryDate_idx" ON "PharmacyReceiptBatch"("organizationId", "expiryDate");
CREATE INDEX "PharmacyReceiptDiscrepancy_organizationId_receiptId_status_idx" ON "PharmacyReceiptDiscrepancy"("organizationId", "receiptId", "status");
CREATE INDEX "PharmacyReceiptDiscrepancy_organizationId_criticality_status_idx" ON "PharmacyReceiptDiscrepancy"("organizationId", "criticality", "status");
CREATE INDEX "PharmacyReceiptDiscrepancy_organizationId_productId_idx" ON "PharmacyReceiptDiscrepancy"("organizationId", "productId");
CREATE INDEX "PharmacyReceiptDiscrepancy_organizationId_batchId_idx" ON "PharmacyReceiptDiscrepancy"("organizationId", "batchId");
CREATE INDEX "PharmacyReceiptDocument_organizationId_receiptId_idx" ON "PharmacyReceiptDocument"("organizationId", "receiptId");
CREATE INDEX "PharmacyReceiptDocument_organizationId_supplierId_idx" ON "PharmacyReceiptDocument"("organizationId", "supplierId");
CREATE INDEX "PharmacyReceiptDocument_organizationId_purchaseOrderId_idx" ON "PharmacyReceiptDocument"("organizationId", "purchaseOrderId");
CREATE INDEX "PharmacyReceiptDocument_organizationId_batchId_idx" ON "PharmacyReceiptDocument"("organizationId", "batchId");

ALTER TABLE "PharmacyReceiptLine" ADD CONSTRAINT "PharmacyReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PharmacyReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptBatch" ADD CONSTRAINT "PharmacyReceiptBatch_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PharmacyReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptBatch" ADD CONSTRAINT "PharmacyReceiptBatch_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "PharmacyReceiptLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptDiscrepancy" ADD CONSTRAINT "PharmacyReceiptDiscrepancy_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PharmacyReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptDiscrepancy" ADD CONSTRAINT "PharmacyReceiptDiscrepancy_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "PharmacyReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptDiscrepancy" ADD CONSTRAINT "PharmacyReceiptDiscrepancy_receiptBatchId_fkey" FOREIGN KEY ("receiptBatchId") REFERENCES "PharmacyReceiptBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptDocument" ADD CONSTRAINT "PharmacyReceiptDocument_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PharmacyReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptDocument" ADD CONSTRAINT "PharmacyReceiptDocument_receiptBatchId_fkey" FOREIGN KEY ("receiptBatchId") REFERENCES "PharmacyReceiptBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
