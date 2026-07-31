ALTER TABLE "EnterpriseExpense" ADD COLUMN "accountedAt" TIMESTAMP(3), ADD COLUMN "accountingTreatment" TEXT NOT NULL DEFAULT 'UNCLASSIFIED', ADD COLUMN "journalEntryId" TEXT, ADD COLUMN "supplierInvoiceId" TEXT;
CREATE TABLE "EnterpriseSupplierCreditNoteItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierCreditNoteId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "netAmount" DECIMAL(18,6) NOT NULL,
    "taxAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseSupplierCreditNoteItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseSupplierInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "businessPartyId" TEXT,
    "purchaseId" TEXT,
    "purchaseReceiptId" TEXT,
    "expenseId" TEXT,
    "projectId" TEXT,
    "assetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "currencyCode" TEXT NOT NULL,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "taxTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(20,6) NOT NULL,
    "amountPaid" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "amountCredited" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(20,6) NOT NULL,
    "varianceReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseSupplierInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseSupplierInvoiceItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "netAmount" DECIMAL(20,6) NOT NULL,
    "taxCodeId" TEXT,
    "taxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,6) NOT NULL,
    "expenseAccountId" TEXT,
    "inventoryAccountId" TEXT,
    "assetAccountId" TEXT,
    "clearingAccountId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseSupplierInvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseSupplierCreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
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
    CONSTRAINT "EnterpriseSupplierCreditNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterprisePayable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "businessPartyId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "originalAmount" DECIMAL(20,6) NOT NULL,
    "allocatedAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "creditedAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(20,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterprisePayable_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterprisePayableAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "allocationDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterprisePayableAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EnterpriseThreeWayMatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "purchaseReceiptId" TEXT,
    "quantityVariance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "priceVariance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxVariance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "currencyMatches" BOOLEAN NOT NULL DEFAULT true,
    "supplierMatches" BOOLEAN NOT NULL DEFAULT true,
    "withinTolerance" BOOLEAN NOT NULL DEFAULT true,
    "overrideReason" TEXT,
    "overriddenByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checkedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseThreeWayMatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EnterpriseSupplierCreditNoteItem_organizationId_supplierCre_idx" ON "EnterpriseSupplierCreditNoteItem"("organizationId", "supplierCreditNoteId");
CREATE INDEX "EnterpriseSupplierCreditNoteItem_organizationId_catalogItem_idx" ON "EnterpriseSupplierCreditNoteItem"("organizationId", "catalogItemId");
CREATE UNIQUE INDEX "EnterpriseSupplierCreditNoteItem_organizationId_id_key" ON "EnterpriseSupplierCreditNoteItem"("organizationId", "id");
CREATE INDEX "EnterpriseSupplierInvoice_organizationId_supplierId_status_idx" ON "EnterpriseSupplierInvoice"("organizationId", "supplierId", "status");
CREATE INDEX "EnterpriseSupplierInvoice_organizationId_dueDate_status_idx" ON "EnterpriseSupplierInvoice"("organizationId", "dueDate", "status");
CREATE INDEX "EnterpriseSupplierInvoice_organizationId_purchaseId_idx" ON "EnterpriseSupplierInvoice"("organizationId", "purchaseId");
CREATE INDEX "EnterpriseSupplierInvoice_organizationId_purchaseReceiptId_idx" ON "EnterpriseSupplierInvoice"("organizationId", "purchaseReceiptId");
CREATE UNIQUE INDEX "EnterpriseSupplierInvoice_organizationId_id_key" ON "EnterpriseSupplierInvoice"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSupplierInvoice_organizationId_number_key" ON "EnterpriseSupplierInvoice"("organizationId", "number");
CREATE INDEX "EnterpriseSupplierInvoiceItem_organizationId_supplierInvoic_idx" ON "EnterpriseSupplierInvoiceItem"("organizationId", "supplierInvoiceId");
CREATE INDEX "EnterpriseSupplierInvoiceItem_organizationId_catalogItemId_idx" ON "EnterpriseSupplierInvoiceItem"("organizationId", "catalogItemId");
CREATE UNIQUE INDEX "EnterpriseSupplierInvoiceItem_organizationId_id_key" ON "EnterpriseSupplierInvoiceItem"("organizationId", "id");
CREATE INDEX "EnterpriseSupplierCreditNote_organizationId_supplierInvoice_idx" ON "EnterpriseSupplierCreditNote"("organizationId", "supplierInvoiceId", "status");
CREATE UNIQUE INDEX "EnterpriseSupplierCreditNote_organizationId_id_key" ON "EnterpriseSupplierCreditNote"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSupplierCreditNote_organizationId_number_key" ON "EnterpriseSupplierCreditNote"("organizationId", "number");
CREATE UNIQUE INDEX "EnterprisePayable_supplierInvoiceId_key" ON "EnterprisePayable"("supplierInvoiceId");
CREATE INDEX "EnterprisePayable_organizationId_supplierId_status_idx" ON "EnterprisePayable"("organizationId", "supplierId", "status");
CREATE INDEX "EnterprisePayable_organizationId_dueDate_status_idx" ON "EnterprisePayable"("organizationId", "dueDate", "status");
CREATE UNIQUE INDEX "EnterprisePayable_organizationId_id_key" ON "EnterprisePayable"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePayable_organizationId_supplierInvoiceId_key" ON "EnterprisePayable"("organizationId", "supplierInvoiceId");
CREATE INDEX "EnterprisePayableAllocation_organizationId_payableId_status_idx" ON "EnterprisePayableAllocation"("organizationId", "payableId", "status");
CREATE UNIQUE INDEX "EnterprisePayableAllocation_organizationId_id_key" ON "EnterprisePayableAllocation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePayableAllocation_organizationId_payableId_source_key" ON "EnterprisePayableAllocation"("organizationId", "payableId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "EnterpriseThreeWayMatch_supplierInvoiceId_key" ON "EnterpriseThreeWayMatch"("supplierInvoiceId");
CREATE INDEX "EnterpriseThreeWayMatch_organizationId_status_idx" ON "EnterpriseThreeWayMatch"("organizationId", "status");
CREATE UNIQUE INDEX "EnterpriseThreeWayMatch_organizationId_id_key" ON "EnterpriseThreeWayMatch"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseThreeWayMatch_organizationId_supplierInvoiceId_key" ON "EnterpriseThreeWayMatch"("organizationId", "supplierInvoiceId");
CREATE INDEX "EnterpriseExpense_organizationId_accountingTreatment_accoun_idx" ON "EnterpriseExpense"("organizationId", "accountingTreatment", "accountedAt");
CREATE INDEX "EnterpriseExpense_organizationId_journalEntryId_idx" ON "EnterpriseExpense"("organizationId", "journalEntryId");
CREATE UNIQUE INDEX "EnterpriseExpense_organizationId_supplierInvoiceId_key" ON "EnterpriseExpense"("organizationId", "supplierInvoiceId");
