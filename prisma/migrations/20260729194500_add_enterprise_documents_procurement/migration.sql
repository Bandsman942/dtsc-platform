-- Sprint 7: dedicated enterprise documents, suppliers and purchases.
-- Additive migration: EnterpriseCoreRecord remains available for legacy Sprint 8 domains and historical data.

CREATE TABLE "EnterpriseDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "documentType" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "ownerUserId" TEXT,
    "departmentId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseDocumentVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'SUPABASE',
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksum" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseDocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseDocumentAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'READ',
    "grantedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseDocumentAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseSupplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT,
    "normalizedName" TEXT NOT NULL,
    "supplierType" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT,
    "taxIdentifier" TEXT,
    "registrationId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterpriseSupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseSupplierContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseSupplierContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterprisePurchase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "supplierId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "departmentId" TEXT,
    "requestId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expectedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EnterprisePurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterprisePurchaseItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterprisePurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterprisePurchaseReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterprisePurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterprisePurchaseReceiptItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "quantityReceived" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterprisePurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseDocument_organizationId_id_key" ON "EnterpriseDocument"("organizationId", "id");
CREATE INDEX "EnterpriseDocument_organizationId_status_updatedAt_idx" ON "EnterpriseDocument"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseDocument_organizationId_documentType_status_idx" ON "EnterpriseDocument"("organizationId", "documentType", "status");
CREATE INDEX "EnterpriseDocument_organizationId_category_status_idx" ON "EnterpriseDocument"("organizationId", "category", "status");
CREATE INDEX "EnterpriseDocument_organizationId_visibility_status_idx" ON "EnterpriseDocument"("organizationId", "visibility", "status");
CREATE INDEX "EnterpriseDocument_organizationId_departmentId_status_idx" ON "EnterpriseDocument"("organizationId", "departmentId", "status");
CREATE INDEX "EnterpriseDocument_organizationId_ownerUserId_status_idx" ON "EnterpriseDocument"("organizationId", "ownerUserId", "status");
CREATE INDEX "EnterpriseDocument_organizationId_expiresAt_idx" ON "EnterpriseDocument"("organizationId", "expiresAt");
CREATE INDEX "EnterpriseDocument_organizationId_sourceEntityType_sourceEntityId_idx" ON "EnterpriseDocument"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterpriseDocument_archivedAt_idx" ON "EnterpriseDocument"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseDocumentVersion_organizationId_documentId_versionNumber_key" ON "EnterpriseDocumentVersion"("organizationId", "documentId", "versionNumber");
CREATE UNIQUE INDEX "EnterpriseDocumentVersion_organizationId_id_key" ON "EnterpriseDocumentVersion"("organizationId", "id");
CREATE INDEX "EnterpriseDocumentVersion_organizationId_documentId_createdAt_idx" ON "EnterpriseDocumentVersion"("organizationId", "documentId", "createdAt");
CREATE INDEX "EnterpriseDocumentVersion_organizationId_checksum_idx" ON "EnterpriseDocumentVersion"("organizationId", "checksum");

CREATE UNIQUE INDEX "EnterpriseDocumentAccess_organizationId_documentId_userId_key" ON "EnterpriseDocumentAccess"("organizationId", "documentId", "userId");
CREATE INDEX "EnterpriseDocumentAccess_organizationId_userId_createdAt_idx" ON "EnterpriseDocumentAccess"("organizationId", "userId", "createdAt");

CREATE UNIQUE INDEX "EnterpriseSupplier_organizationId_id_key" ON "EnterpriseSupplier"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSupplier_organizationId_normalizedName_key" ON "EnterpriseSupplier"("organizationId", "normalizedName");
CREATE INDEX "EnterpriseSupplier_organizationId_status_legalName_idx" ON "EnterpriseSupplier"("organizationId", "status", "legalName");
CREATE INDEX "EnterpriseSupplier_organizationId_category_status_idx" ON "EnterpriseSupplier"("organizationId", "category", "status");
CREATE INDEX "EnterpriseSupplier_organizationId_country_status_idx" ON "EnterpriseSupplier"("organizationId", "country", "status");
CREATE INDEX "EnterpriseSupplier_organizationId_taxIdentifier_idx" ON "EnterpriseSupplier"("organizationId", "taxIdentifier");
CREATE INDEX "EnterpriseSupplier_organizationId_registrationId_idx" ON "EnterpriseSupplier"("organizationId", "registrationId");
CREATE INDEX "EnterpriseSupplier_archivedAt_idx" ON "EnterpriseSupplier"("archivedAt");
CREATE INDEX "EnterpriseSupplierContact_organizationId_supplierId_isPrimary_idx" ON "EnterpriseSupplierContact"("organizationId", "supplierId", "isPrimary");

CREATE UNIQUE INDEX "EnterprisePurchase_organizationId_id_key" ON "EnterprisePurchase"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePurchase_organizationId_reference_key" ON "EnterprisePurchase"("organizationId", "reference");
CREATE INDEX "EnterprisePurchase_organizationId_status_createdAt_idx" ON "EnterprisePurchase"("organizationId", "status", "createdAt");
CREATE INDEX "EnterprisePurchase_organizationId_supplierId_status_idx" ON "EnterprisePurchase"("organizationId", "supplierId", "status");
CREATE INDEX "EnterprisePurchase_organizationId_departmentId_status_idx" ON "EnterprisePurchase"("organizationId", "departmentId", "status");
CREATE INDEX "EnterprisePurchase_organizationId_requestedByUserId_status_idx" ON "EnterprisePurchase"("organizationId", "requestedByUserId", "status");
CREATE INDEX "EnterprisePurchase_organizationId_buyerUserId_status_idx" ON "EnterprisePurchase"("organizationId", "buyerUserId", "status");
CREATE INDEX "EnterprisePurchase_organizationId_requestId_idx" ON "EnterprisePurchase"("organizationId", "requestId");
CREATE INDEX "EnterprisePurchase_organizationId_expectedAt_idx" ON "EnterprisePurchase"("organizationId", "expectedAt");
CREATE INDEX "EnterprisePurchase_organizationId_sourceEntityType_sourceEntityId_idx" ON "EnterprisePurchase"("organizationId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "EnterprisePurchase_archivedAt_idx" ON "EnterprisePurchase"("archivedAt");
CREATE UNIQUE INDEX "EnterprisePurchaseItem_organizationId_id_key" ON "EnterprisePurchaseItem"("organizationId", "id");
CREATE INDEX "EnterprisePurchaseItem_organizationId_purchaseId_sortOrder_idx" ON "EnterprisePurchaseItem"("organizationId", "purchaseId", "sortOrder");
CREATE INDEX "EnterprisePurchaseItem_organizationId_sourceEntityType_sourceEntityId_idx" ON "EnterprisePurchaseItem"("organizationId", "sourceEntityType", "sourceEntityId");

CREATE UNIQUE INDEX "EnterprisePurchaseReceipt_organizationId_id_key" ON "EnterprisePurchaseReceipt"("organizationId", "id");
CREATE UNIQUE INDEX "EnterprisePurchaseReceipt_organizationId_reference_key" ON "EnterprisePurchaseReceipt"("organizationId", "reference");
CREATE INDEX "EnterprisePurchaseReceipt_organizationId_purchaseId_receivedAt_idx" ON "EnterprisePurchaseReceipt"("organizationId", "purchaseId", "receivedAt");
CREATE INDEX "EnterprisePurchaseReceipt_organizationId_receivedByUserId_receivedAt_idx" ON "EnterprisePurchaseReceipt"("organizationId", "receivedByUserId", "receivedAt");
CREATE UNIQUE INDEX "EnterprisePurchaseReceiptItem_organizationId_receiptId_purchaseItemId_key" ON "EnterprisePurchaseReceiptItem"("organizationId", "receiptId", "purchaseItemId");
CREATE INDEX "EnterprisePurchaseReceiptItem_organizationId_purchaseItemId_idx" ON "EnterprisePurchaseReceiptItem"("organizationId", "purchaseItemId");

ALTER TABLE "EnterpriseDocumentVersion" ADD CONSTRAINT "EnterpriseDocumentVersion_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "EnterpriseDocument"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseDocumentAccess" ADD CONSTRAINT "EnterpriseDocumentAccess_organizationId_documentId_fkey" FOREIGN KEY ("organizationId", "documentId") REFERENCES "EnterpriseDocument"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSupplierContact" ADD CONSTRAINT "EnterpriseSupplierContact_organizationId_supplierId_fkey" FOREIGN KEY ("organizationId", "supplierId") REFERENCES "EnterpriseSupplier"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterprisePurchase" ADD CONSTRAINT "EnterprisePurchase_organizationId_supplierId_fkey" FOREIGN KEY ("organizationId", "supplierId") REFERENCES "EnterpriseSupplier"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePurchaseItem" ADD CONSTRAINT "EnterprisePurchaseItem_organizationId_purchaseId_fkey" FOREIGN KEY ("organizationId", "purchaseId") REFERENCES "EnterprisePurchase"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterprisePurchaseReceipt" ADD CONSTRAINT "EnterprisePurchaseReceipt_organizationId_purchaseId_fkey" FOREIGN KEY ("organizationId", "purchaseId") REFERENCES "EnterprisePurchase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterprisePurchaseReceiptItem" ADD CONSTRAINT "EnterprisePurchaseReceiptItem_organizationId_receiptId_fkey" FOREIGN KEY ("organizationId", "receiptId") REFERENCES "EnterprisePurchaseReceipt"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterprisePurchaseReceiptItem" ADD CONSTRAINT "EnterprisePurchaseReceiptItem_organizationId_purchaseItemId_fkey" FOREIGN KEY ("organizationId", "purchaseItemId") REFERENCES "EnterprisePurchaseItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
