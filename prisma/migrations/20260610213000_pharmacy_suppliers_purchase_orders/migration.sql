CREATE TABLE "PharmacySupplier" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "supplierCode" TEXT NOT NULL, "name" TEXT NOT NULL, "supplierType" TEXT NOT NULL,
  "category" TEXT, "taxNumber" TEXT, "legalIdentifier" TEXT, "description" TEXT, "mainContactName" TEXT, "mainContactRole" TEXT,
  "phone" TEXT, "email" TEXT, "whatsapp" TEXT, "secondaryContact" TEXT, "country" TEXT, "city" TEXT, "area" TEXT, "address" TEXT,
  "deliveryZone" TEXT, "averageDeliveryDays" INTEGER, "paymentTerms" TEXT, "mainCurrency" TEXT NOT NULL DEFAULT 'USD',
  "minimumOrderAmount" DECIMAL(14,2), "usualDiscountRate" DECIMAL(8,2), "deliveryFees" DECIMAL(14,2),
  "supplierCreditAllowed" BOOLEAN NOT NULL DEFAULT false, "complianceStatus" TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
  "complianceNotes" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "suspensionReason" TEXT, "notes" TEXT, "createdById" TEXT NOT NULL,
  "updatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySupplier_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacySupplierProduct" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "supplierId" TEXT NOT NULL, "productId" TEXT NOT NULL, "supplierReference" TEXT,
  "supplierPrice" DECIMAL(14,2), "deliveryDays" INTEGER, "minimumQuantity" DECIMAL(14,3), "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySupplierProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyReplenishmentRequest" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "requestNumber" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "requestedQuantity" DECIMAL(14,3) NOT NULL, "unit" TEXT NOT NULL, "source" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL', "suggestedSupplierId" TEXT, "estimatedPrice" DECIMAL(14,2), "requestedById" TEXT NOT NULL,
  "departmentId" TEXT, "desiredDate" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'DRAFT', "validatedById" TEXT,
  "validatedAt" TIMESTAMP(3), "rejectionReason" TEXT, "purchaseOrderId" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReplenishmentRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPurchaseOrder" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "orderNumber" TEXT NOT NULL, "supplierId" TEXT NOT NULL, "requestId" TEXT,
  "requestedById" TEXT NOT NULL, "departmentId" TEXT, "priority" TEXT NOT NULL DEFAULT 'NORMAL', "orderDate" TIMESTAMP(3) NOT NULL,
  "expectedDeliveryDate" TIMESTAMP(3), "deliveryAddress" TEXT, "deliveryMode" TEXT, "deliveryContact" TEXT, "budgetId" TEXT,
  "estimatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'USD',
  "financialValidationRequired" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'DRAFT', "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3), "validatedById" TEXT, "validatedAt" TIMESTAMP(3), "rejectionReason" TEXT, "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3), "cancellationReason" TEXT, "notes" TEXT, "createdById" TEXT NOT NULL, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPurchaseOrderLine" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "purchaseOrderId" TEXT NOT NULL, "productId" TEXT NOT NULL,
  "supplierProductId" TEXT, "orderedQuantity" DECIMAL(14,3) NOT NULL, "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "remainingQuantity" DECIMAL(14,3) NOT NULL, "unit" TEXT NOT NULL, "estimatedUnitPrice" DECIMAL(14,2), "discountRate" DECIMAL(8,2),
  "totalLine" DECIMAL(14,2), "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacySupplierDocument" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "supplierId" TEXT, "purchaseOrderId" TEXT, "receiptId" TEXT,
  "documentType" TEXT NOT NULL, "title" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "reference" TEXT, "documentDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3), "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL', "notes" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySupplierDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PharmacyPurchaseAlert" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "alertType" TEXT NOT NULL, "supplierId" TEXT, "purchaseOrderId" TEXT,
  "productId" TEXT, "criticality" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'OPEN', "message" TEXT NOT NULL,
  "recommendedAction" TEXT, "assignedToId" TEXT, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PharmacyPurchaseAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PharmacySupplier_organizationId_supplierCode_key" ON "PharmacySupplier"("organizationId","supplierCode");
CREATE INDEX "PharmacySupplier_organizationId_status_name_idx" ON "PharmacySupplier"("organizationId","status","name");
CREATE INDEX "PharmacySupplier_organizationId_supplierType_idx" ON "PharmacySupplier"("organizationId","supplierType");
CREATE UNIQUE INDEX "PharmacySupplierProduct_organizationId_supplierId_productId_key" ON "PharmacySupplierProduct"("organizationId","supplierId","productId");
CREATE INDEX "PharmacySupplierProduct_organizationId_productId_status_idx" ON "PharmacySupplierProduct"("organizationId","productId","status");
CREATE UNIQUE INDEX "PharmacyReplenishmentRequest_organizationId_requestNumber_key" ON "PharmacyReplenishmentRequest"("organizationId","requestNumber");
CREATE INDEX "PharmacyReplenishmentRequest_organizationId_status_priority_idx" ON "PharmacyReplenishmentRequest"("organizationId","status","priority");
CREATE INDEX "PharmacyReplenishmentRequest_organizationId_productId_idx" ON "PharmacyReplenishmentRequest"("organizationId","productId");
CREATE INDEX "PharmacyReplenishmentRequest_organizationId_suggestedSupplierId_idx" ON "PharmacyReplenishmentRequest"("organizationId","suggestedSupplierId");
CREATE UNIQUE INDEX "PharmacyPurchaseOrder_organizationId_orderNumber_key" ON "PharmacyPurchaseOrder"("organizationId","orderNumber");
CREATE INDEX "PharmacyPurchaseOrder_organizationId_status_expectedDeliveryDate_idx" ON "PharmacyPurchaseOrder"("organizationId","status","expectedDeliveryDate");
CREATE INDEX "PharmacyPurchaseOrder_organizationId_supplierId_idx" ON "PharmacyPurchaseOrder"("organizationId","supplierId");
CREATE INDEX "PharmacyPurchaseOrder_organizationId_requestId_idx" ON "PharmacyPurchaseOrder"("organizationId","requestId");
CREATE INDEX "PharmacyPurchaseOrderLine_organizationId_purchaseOrderId_idx" ON "PharmacyPurchaseOrderLine"("organizationId","purchaseOrderId");
CREATE INDEX "PharmacyPurchaseOrderLine_organizationId_productId_idx" ON "PharmacyPurchaseOrderLine"("organizationId","productId");
CREATE INDEX "PharmacySupplierDocument_organizationId_supplierId_idx" ON "PharmacySupplierDocument"("organizationId","supplierId");
CREATE INDEX "PharmacySupplierDocument_organizationId_purchaseOrderId_idx" ON "PharmacySupplierDocument"("organizationId","purchaseOrderId");
CREATE INDEX "PharmacySupplierDocument_organizationId_receiptId_idx" ON "PharmacySupplierDocument"("organizationId","receiptId");
CREATE INDEX "PharmacyPurchaseAlert_organizationId_status_criticality_idx" ON "PharmacyPurchaseAlert"("organizationId","status","criticality");
CREATE INDEX "PharmacyPurchaseAlert_organizationId_supplierId_idx" ON "PharmacyPurchaseAlert"("organizationId","supplierId");
CREATE INDEX "PharmacyPurchaseAlert_organizationId_purchaseOrderId_idx" ON "PharmacyPurchaseAlert"("organizationId","purchaseOrderId");
ALTER TABLE "PharmacySupplierProduct" ADD CONSTRAINT "PharmacySupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PharmacySupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReplenishmentRequest" ADD CONSTRAINT "PharmacyReplenishmentRequest_suggestedSupplierId_fkey" FOREIGN KEY ("suggestedSupplierId") REFERENCES "PharmacySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrder" ADD CONSTRAINT "PharmacyPurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PharmacySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseOrderLine" ADD CONSTRAINT "PharmacyPurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PharmacyPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySupplierDocument" ADD CONSTRAINT "PharmacySupplierDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PharmacySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacySupplierDocument" ADD CONSTRAINT "PharmacySupplierDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PharmacyPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseAlert" ADD CONSTRAINT "PharmacyPurchaseAlert_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PharmacySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseAlert" ADD CONSTRAINT "PharmacyPurchaseAlert_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PharmacyPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
