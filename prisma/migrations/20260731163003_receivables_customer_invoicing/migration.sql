-- CreateTable
CREATE TABLE "EnterpriseSalesInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "businessPartyId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "fulfillmentId" TEXT,
    "contractId" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "currencyCode" TEXT NOT NULL,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "discountTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(20,6) NOT NULL,
    "amountPaid" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "amountCredited" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(20,6) NOT NULL,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseSalesInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseSalesInvoiceItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "discountAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(20,6) NOT NULL,
    "taxCodeId" TEXT,
    "taxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,6) NOT NULL,
    "revenueAccountId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseSalesInvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseSalesCreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "creditDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "taxTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(20,6) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseSalesCreditNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseSalesCreditNoteItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesCreditNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "netAmount" DECIMAL(20,6) NOT NULL,
    "taxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseSalesCreditNoteItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseReceivable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "businessPartyId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "originalAmount" DECIMAL(20,6) NOT NULL,
    "allocatedAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "creditedAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "writtenOffAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseReceivable_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseReceivableAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "allocationDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseReceivableAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseSalesInvoice_organizationId_businessPartyId_statu_idx" ON "EnterpriseSalesInvoice"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterpriseSalesInvoice_organizationId_dueDate_status_idx" ON "EnterpriseSalesInvoice"("organizationId", "dueDate", "status");
CREATE INDEX "EnterpriseSalesInvoice_organizationId_salesOrderId_idx" ON "EnterpriseSalesInvoice"("organizationId", "salesOrderId");
CREATE UNIQUE INDEX "EnterpriseSalesInvoice_organizationId_id_key" ON "EnterpriseSalesInvoice"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSalesInvoice_organizationId_number_key" ON "EnterpriseSalesInvoice"("organizationId", "number");
CREATE INDEX "EnterpriseSalesInvoiceItem_organizationId_salesInvoiceId_idx" ON "EnterpriseSalesInvoiceItem"("organizationId", "salesInvoiceId");
CREATE INDEX "EnterpriseSalesInvoiceItem_organizationId_catalogItemId_idx" ON "EnterpriseSalesInvoiceItem"("organizationId", "catalogItemId");
CREATE UNIQUE INDEX "EnterpriseSalesInvoiceItem_organizationId_id_key" ON "EnterpriseSalesInvoiceItem"("organizationId", "id");
CREATE INDEX "EnterpriseSalesCreditNote_organizationId_salesInvoiceId_sta_idx" ON "EnterpriseSalesCreditNote"("organizationId", "salesInvoiceId", "status");
CREATE UNIQUE INDEX "EnterpriseSalesCreditNote_organizationId_id_key" ON "EnterpriseSalesCreditNote"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSalesCreditNote_organizationId_number_key" ON "EnterpriseSalesCreditNote"("organizationId", "number");
CREATE INDEX "EnterpriseSalesCreditNoteItem_organizationId_salesCreditNot_idx" ON "EnterpriseSalesCreditNoteItem"("organizationId", "salesCreditNoteId");
CREATE UNIQUE INDEX "EnterpriseSalesCreditNoteItem_organizationId_id_key" ON "EnterpriseSalesCreditNoteItem"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseReceivable_salesInvoiceId_key" ON "EnterpriseReceivable"("salesInvoiceId");
CREATE INDEX "EnterpriseReceivable_organizationId_businessPartyId_status_idx" ON "EnterpriseReceivable"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterpriseReceivable_organizationId_dueDate_status_idx" ON "EnterpriseReceivable"("organizationId", "dueDate", "status");
CREATE UNIQUE INDEX "EnterpriseReceivable_organizationId_id_key" ON "EnterpriseReceivable"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseReceivable_organizationId_salesInvoiceId_key" ON "EnterpriseReceivable"("organizationId", "salesInvoiceId");
CREATE INDEX "EnterpriseReceivableAllocation_organizationId_receivableId__idx" ON "EnterpriseReceivableAllocation"("organizationId", "receivableId", "status");
CREATE UNIQUE INDEX "EnterpriseReceivableAllocation_organizationId_id_key" ON "EnterpriseReceivableAllocation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseReceivableAllocation_organizationId_receivableId__key" ON "EnterpriseReceivableAllocation"("organizationId", "receivableId", "sourceType", "sourceId");
