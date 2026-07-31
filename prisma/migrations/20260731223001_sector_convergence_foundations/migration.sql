-- Iteration 4: additive Pharmacy and Health convergence foundations.
-- No legacy table or column is removed or rewritten.

CREATE TABLE "EnterpriseSectorSyncState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "targetEntityType" TEXT,
  "targetEntityId" TEXT,
  "eventType" TEXT NOT NULL DEFAULT 'ENTITY_MAPPING',
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "lastSyncedVersion" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "requiresManualAction" BOOLEAN NOT NULL DEFAULT false,
  "cutoverComplete" BOOLEAN NOT NULL DEFAULT false,
  "metadataJson" JSONB,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseSectorSyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseSectorCutoverState" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "domainCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISABLED',
  "featureFlag" TEXT NOT NULL,
  "enabledByUserId" TEXT,
  "enabledAt" TIMESTAMP(3),
  "disabledByUserId" TEXT,
  "disabledAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "rollbackReason" TEXT,
  "notes" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseSectorCutoverState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyProductExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyProductId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "historicalKey" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyProductExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacySupplierExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacySupplierId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "enterpriseSupplierId" TEXT,
  "historicalKey" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySupplierExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyPurchaseExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyPurchaseOrderId" TEXT NOT NULL,
  "enterprisePurchaseId" TEXT NOT NULL,
  "pharmacyReceiptId" TEXT,
  "enterpriseReceiptId" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPurchaseExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacySalesExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacySaleId" TEXT NOT NULL,
  "salesInvoiceId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacySalesExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyInvoiceExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyInvoiceId" TEXT NOT NULL,
  "salesInvoiceId" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyInvoiceExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyPaymentExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyPaymentId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "pharmacySaleId" TEXT,
  "pharmacyInvoiceId" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyPaymentExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyCashExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyCashSessionId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyCashExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseSectorInventoryEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "sourceBatchId" TEXT,
  "sourceProductId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "inventoryItemId" TEXT,
  "eventType" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "direction" TEXT NOT NULL,
  "quantity" NUMERIC(20,6) NOT NULL,
  "unitCost" NUMERIC(20,6),
  "totalValue" NUMERIC(20,6),
  "currencyCode" TEXT,
  "valuationId" TEXT,
  "journalEntryId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnterpriseSectorInventoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthPatientFinancialProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "healthPatientId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "billingDisplayLabel" TEXT NOT NULL,
  "financialResponsiblePartyId" TEXT,
  "migrationKey" TEXT,
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'MEDICAL_CONFIDENTIAL',
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthPatientFinancialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthServiceCatalogExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "healthBillingServiceCatalogId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'MEDICAL_CONFIDENTIAL',
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthServiceCatalogExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthBillingExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "healthMedicalInvoiceId" TEXT NOT NULL,
  "salesInvoiceId" TEXT NOT NULL,
  "patientFinancialProfileId" TEXT NOT NULL,
  "consultationId" TEXT,
  "labRequestId" TEXT,
  "pharmacyDispensationId" TEXT,
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'MEDICAL_CONFIDENTIAL',
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthBillingExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthInvoicePayerComponent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "healthMedicalInvoiceId" TEXT NOT NULL,
  "salesInvoiceId" TEXT NOT NULL,
  "payerType" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "receivableId" TEXT,
  "currencyCode" TEXT NOT NULL,
  "requestedAmount" NUMERIC(20,6) NOT NULL,
  "approvedAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "settledAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "writtenOffAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "outstandingAmount" NUMERIC(20,6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthInvoicePayerComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthInsuranceReceivableExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "coverageRequestId" TEXT NOT NULL,
  "payerComponentId" TEXT NOT NULL,
  "insurerBusinessPartyId" TEXT NOT NULL,
  "claimStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestedAmount" NUMERIC(20,6) NOT NULL,
  "approvedAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "settledAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "rejectedAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "disputedAmount" NUMERIC(20,6) NOT NULL DEFAULT 0,
  "currencyCode" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthInsuranceReceivableExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthPaymentExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "healthMedicalInvoicePaymentId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "payerType" TEXT NOT NULL,
  "payerBusinessPartyId" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthPaymentExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthPayerAllocation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "payerComponentId" TEXT NOT NULL,
  "paymentAllocationId" TEXT NOT NULL,
  "amount" NUMERIC(20,6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  CONSTRAINT "HealthPayerAllocation_pkey" PRIMARY KEY ("id")
);

-- Unique constraints.
CREATE UNIQUE INDEX "EnterpriseSectorSyncState_organizationId_id_key" ON "EnterpriseSectorSyncState"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSectorSyncState_organizationId_idempotencyKey_key" ON "EnterpriseSectorSyncState"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseSectorSyncState_source_event_key" ON "EnterpriseSectorSyncState"("organizationId", "sector", "sourceEntityType", "sourceEntityId", "eventType", "eventVersion");
CREATE UNIQUE INDEX "EnterpriseSectorCutoverState_organizationId_id_key" ON "EnterpriseSectorCutoverState"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSectorCutoverState_domain_key" ON "EnterpriseSectorCutoverState"("organizationId", "sector", "domainCode");
CREATE UNIQUE INDEX "PharmacyProductExtension_organizationId_id_key" ON "PharmacyProductExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyProductExtension_source_key" ON "PharmacyProductExtension"("organizationId", "pharmacyProductId");
CREATE UNIQUE INDEX "PharmacyProductExtension_target_key" ON "PharmacyProductExtension"("organizationId", "catalogItemId");
CREATE UNIQUE INDEX "PharmacyProductExtension_historical_key" ON "PharmacyProductExtension"("organizationId", "historicalKey");
CREATE UNIQUE INDEX "PharmacySupplierExtension_organizationId_id_key" ON "PharmacySupplierExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacySupplierExtension_source_key" ON "PharmacySupplierExtension"("organizationId", "pharmacySupplierId");
CREATE UNIQUE INDEX "PharmacySupplierExtension_party_key" ON "PharmacySupplierExtension"("organizationId", "businessPartyId");
CREATE UNIQUE INDEX "PharmacySupplierExtension_supplier_key" ON "PharmacySupplierExtension"("organizationId", "enterpriseSupplierId");
CREATE UNIQUE INDEX "PharmacySupplierExtension_historical_key" ON "PharmacySupplierExtension"("organizationId", "historicalKey");
CREATE UNIQUE INDEX "PharmacyPurchaseExtension_organizationId_id_key" ON "PharmacyPurchaseExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyPurchaseExtension_source_key" ON "PharmacyPurchaseExtension"("organizationId", "pharmacyPurchaseOrderId");
CREATE UNIQUE INDEX "PharmacyPurchaseExtension_target_key" ON "PharmacyPurchaseExtension"("organizationId", "enterprisePurchaseId");
CREATE UNIQUE INDEX "PharmacyPurchaseExtension_receipt_source_key" ON "PharmacyPurchaseExtension"("organizationId", "pharmacyReceiptId");
CREATE UNIQUE INDEX "PharmacyPurchaseExtension_receipt_target_key" ON "PharmacyPurchaseExtension"("organizationId", "enterpriseReceiptId");
CREATE UNIQUE INDEX "PharmacySalesExtension_organizationId_id_key" ON "PharmacySalesExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacySalesExtension_source_key" ON "PharmacySalesExtension"("organizationId", "pharmacySaleId");
CREATE UNIQUE INDEX "PharmacySalesExtension_target_key" ON "PharmacySalesExtension"("organizationId", "salesInvoiceId");
CREATE UNIQUE INDEX "PharmacyInvoiceExtension_organizationId_id_key" ON "PharmacyInvoiceExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyInvoiceExtension_source_key" ON "PharmacyInvoiceExtension"("organizationId", "pharmacyInvoiceId");
CREATE UNIQUE INDEX "PharmacyInvoiceExtension_target_key" ON "PharmacyInvoiceExtension"("organizationId", "salesInvoiceId");
CREATE UNIQUE INDEX "PharmacyPaymentExtension_organizationId_id_key" ON "PharmacyPaymentExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyPaymentExtension_source_key" ON "PharmacyPaymentExtension"("organizationId", "pharmacyPaymentId");
CREATE UNIQUE INDEX "PharmacyPaymentExtension_target_key" ON "PharmacyPaymentExtension"("organizationId", "paymentId");
CREATE UNIQUE INDEX "PharmacyCashExtension_organizationId_id_key" ON "PharmacyCashExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyCashExtension_source_key" ON "PharmacyCashExtension"("organizationId", "pharmacyCashSessionId");
CREATE UNIQUE INDEX "PharmacyCashExtension_target_key" ON "PharmacyCashExtension"("organizationId", "cashSessionId");
CREATE UNIQUE INDEX "EnterpriseSectorInventoryEvent_organizationId_id_key" ON "EnterpriseSectorInventoryEvent"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSectorInventoryEvent_idempotency_key" ON "EnterpriseSectorInventoryEvent"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "EnterpriseSectorInventoryEvent_source_event_key" ON "EnterpriseSectorInventoryEvent"("organizationId", "sector", "sourceMovementId", "eventType", "eventVersion");
CREATE UNIQUE INDEX "HealthPatientFinancialProfile_organizationId_id_key" ON "HealthPatientFinancialProfile"("organizationId", "id");
CREATE UNIQUE INDEX "HealthPatientFinancialProfile_source_key" ON "HealthPatientFinancialProfile"("organizationId", "healthPatientId");
CREATE UNIQUE INDEX "HealthPatientFinancialProfile_target_key" ON "HealthPatientFinancialProfile"("organizationId", "businessPartyId");
CREATE UNIQUE INDEX "HealthPatientFinancialProfile_migration_key" ON "HealthPatientFinancialProfile"("organizationId", "migrationKey");
CREATE UNIQUE INDEX "HealthServiceCatalogExtension_organizationId_id_key" ON "HealthServiceCatalogExtension"("organizationId", "id");
CREATE UNIQUE INDEX "HealthServiceCatalogExtension_source_key" ON "HealthServiceCatalogExtension"("organizationId", "healthBillingServiceCatalogId");
CREATE UNIQUE INDEX "HealthServiceCatalogExtension_target_key" ON "HealthServiceCatalogExtension"("organizationId", "catalogItemId");
CREATE UNIQUE INDEX "HealthBillingExtension_organizationId_id_key" ON "HealthBillingExtension"("organizationId", "id");
CREATE UNIQUE INDEX "HealthBillingExtension_source_key" ON "HealthBillingExtension"("organizationId", "healthMedicalInvoiceId");
CREATE UNIQUE INDEX "HealthBillingExtension_target_key" ON "HealthBillingExtension"("organizationId", "salesInvoiceId");
CREATE UNIQUE INDEX "HealthInvoicePayerComponent_organizationId_id_key" ON "HealthInvoicePayerComponent"("organizationId", "id");
CREATE UNIQUE INDEX "HealthInvoicePayerComponent_party_key" ON "HealthInvoicePayerComponent"("organizationId", "healthMedicalInvoiceId", "payerType", "businessPartyId");
CREATE UNIQUE INDEX "HealthInsuranceReceivableExtension_organizationId_id_key" ON "HealthInsuranceReceivableExtension"("organizationId", "id");
CREATE UNIQUE INDEX "HealthInsuranceReceivableExtension_source_key" ON "HealthInsuranceReceivableExtension"("organizationId", "coverageRequestId");
CREATE UNIQUE INDEX "HealthInsuranceReceivableExtension_component_key" ON "HealthInsuranceReceivableExtension"("organizationId", "payerComponentId");
CREATE UNIQUE INDEX "HealthPaymentExtension_organizationId_id_key" ON "HealthPaymentExtension"("organizationId", "id");
CREATE UNIQUE INDEX "HealthPaymentExtension_source_key" ON "HealthPaymentExtension"("organizationId", "healthMedicalInvoicePaymentId");
CREATE UNIQUE INDEX "HealthPaymentExtension_target_key" ON "HealthPaymentExtension"("organizationId", "paymentId");
CREATE UNIQUE INDEX "HealthPayerAllocation_organizationId_id_key" ON "HealthPayerAllocation"("organizationId", "id");
CREATE UNIQUE INDEX "HealthPayerAllocation_mapping_key" ON "HealthPayerAllocation"("organizationId", "payerComponentId", "paymentAllocationId");

-- Operational indexes.
CREATE INDEX "EnterpriseSectorSyncState_status_idx" ON "EnterpriseSectorSyncState"("organizationId", "sector", "status", "updatedAt");
CREATE INDEX "EnterpriseSectorSyncState_manual_idx" ON "EnterpriseSectorSyncState"("organizationId", "requiresManualAction", "status");
CREATE INDEX "EnterpriseSectorCutoverState_status_idx" ON "EnterpriseSectorCutoverState"("organizationId", "status", "updatedAt");
CREATE INDEX "EnterpriseSectorInventoryEvent_status_idx" ON "EnterpriseSectorInventoryEvent"("organizationId", "sector", "status", "createdAt");
CREATE INDEX "HealthInvoicePayerComponent_party_idx" ON "HealthInvoicePayerComponent"("organizationId", "businessPartyId", "status");
CREATE INDEX "HealthInsuranceReceivableExtension_insurer_idx" ON "HealthInsuranceReceivableExtension"("organizationId", "insurerBusinessPartyId", "claimStatus");

-- Tenant and critical structural foreign keys.
ALTER TABLE "EnterpriseSectorSyncState" ADD CONSTRAINT "EnterpriseSectorSyncState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSectorCutoverState" ADD CONSTRAINT "EnterpriseSectorCutoverState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyProductExtension" ADD CONSTRAINT "PharmacyProductExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyProductExtension" ADD CONSTRAINT "PharmacyProductExtension_pharmacyProductId_fkey" FOREIGN KEY ("pharmacyProductId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyProductExtension" ADD CONSTRAINT "PharmacyProductExtension_catalogItemId_fkey" FOREIGN KEY ("organizationId", "catalogItemId") REFERENCES "EnterpriseCatalogItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacySupplierExtension" ADD CONSTRAINT "PharmacySupplierExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySupplierExtension" ADD CONSTRAINT "PharmacySupplierExtension_pharmacySupplierId_fkey" FOREIGN KEY ("pharmacySupplierId") REFERENCES "PharmacySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacySupplierExtension" ADD CONSTRAINT "PharmacySupplierExtension_businessPartyId_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseExtension" ADD CONSTRAINT "PharmacyPurchaseExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseExtension" ADD CONSTRAINT "PharmacyPurchaseExtension_pharmacyPurchaseOrderId_fkey" FOREIGN KEY ("pharmacyPurchaseOrderId") REFERENCES "PharmacyPurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPurchaseExtension" ADD CONSTRAINT "PharmacyPurchaseExtension_enterprisePurchaseId_fkey" FOREIGN KEY ("enterprisePurchaseId") REFERENCES "EnterprisePurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacySalesExtension" ADD CONSTRAINT "PharmacySalesExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacySalesExtension" ADD CONSTRAINT "PharmacySalesExtension_pharmacySaleId_fkey" FOREIGN KEY ("pharmacySaleId") REFERENCES "PharmacySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacySalesExtension" ADD CONSTRAINT "PharmacySalesExtension_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyInvoiceExtension" ADD CONSTRAINT "PharmacyInvoiceExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyInvoiceExtension" ADD CONSTRAINT "PharmacyInvoiceExtension_pharmacyInvoiceId_fkey" FOREIGN KEY ("pharmacyInvoiceId") REFERENCES "PharmacyInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyInvoiceExtension" ADD CONSTRAINT "PharmacyInvoiceExtension_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPaymentExtension" ADD CONSTRAINT "PharmacyPaymentExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyPaymentExtension" ADD CONSTRAINT "PharmacyPaymentExtension_pharmacyPaymentId_fkey" FOREIGN KEY ("pharmacyPaymentId") REFERENCES "PharmacyPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyPaymentExtension" ADD CONSTRAINT "PharmacyPaymentExtension_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashExtension" ADD CONSTRAINT "PharmacyCashExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashExtension" ADD CONSTRAINT "PharmacyCashExtension_pharmacyCashSessionId_fkey" FOREIGN KEY ("pharmacyCashSessionId") REFERENCES "PharmacyCashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyCashExtension" ADD CONSTRAINT "PharmacyCashExtension_cashSessionId_fkey" FOREIGN KEY ("organizationId", "cashSessionId") REFERENCES "EnterpriseCashSession"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSectorInventoryEvent" ADD CONSTRAINT "EnterpriseSectorInventoryEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseSectorInventoryEvent" ADD CONSTRAINT "EnterpriseSectorInventoryEvent_catalogItemId_fkey" FOREIGN KEY ("organizationId", "catalogItemId") REFERENCES "EnterpriseCatalogItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPatientFinancialProfile" ADD CONSTRAINT "HealthPatientFinancialProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPatientFinancialProfile" ADD CONSTRAINT "HealthPatientFinancialProfile_healthPatientId_fkey" FOREIGN KEY ("organizationId", "healthPatientId") REFERENCES "HealthPatient"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPatientFinancialProfile" ADD CONSTRAINT "HealthPatientFinancialProfile_businessPartyId_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthServiceCatalogExtension" ADD CONSTRAINT "HealthServiceCatalogExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthServiceCatalogExtension" ADD CONSTRAINT "HealthServiceCatalogExtension_healthBillingServiceCatalogId_fkey" FOREIGN KEY ("healthBillingServiceCatalogId") REFERENCES "HealthBillingServiceCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthServiceCatalogExtension" ADD CONSTRAINT "HealthServiceCatalogExtension_catalogItemId_fkey" FOREIGN KEY ("organizationId", "catalogItemId") REFERENCES "EnterpriseCatalogItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthBillingExtension" ADD CONSTRAINT "HealthBillingExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthBillingExtension" ADD CONSTRAINT "HealthBillingExtension_healthMedicalInvoiceId_fkey" FOREIGN KEY ("organizationId", "healthMedicalInvoiceId") REFERENCES "HealthMedicalInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthBillingExtension" ADD CONSTRAINT "HealthBillingExtension_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthBillingExtension" ADD CONSTRAINT "HealthBillingExtension_patientFinancialProfileId_fkey" FOREIGN KEY ("organizationId", "patientFinancialProfileId") REFERENCES "HealthPatientFinancialProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInvoicePayerComponent" ADD CONSTRAINT "HealthInvoicePayerComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthInvoicePayerComponent" ADD CONSTRAINT "HealthInvoicePayerComponent_healthMedicalInvoiceId_fkey" FOREIGN KEY ("organizationId", "healthMedicalInvoiceId") REFERENCES "HealthMedicalInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInvoicePayerComponent" ADD CONSTRAINT "HealthInvoicePayerComponent_salesInvoiceId_fkey" FOREIGN KEY ("organizationId", "salesInvoiceId") REFERENCES "EnterpriseSalesInvoice"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInvoicePayerComponent" ADD CONSTRAINT "HealthInvoicePayerComponent_businessPartyId_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceReceivableExtension" ADD CONSTRAINT "HealthInsuranceReceivableExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceReceivableExtension" ADD CONSTRAINT "HealthInsuranceReceivableExtension_coverageRequestId_fkey" FOREIGN KEY ("organizationId", "coverageRequestId") REFERENCES "HealthCoverageRequest"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceReceivableExtension" ADD CONSTRAINT "HealthInsuranceReceivableExtension_payerComponentId_fkey" FOREIGN KEY ("organizationId", "payerComponentId") REFERENCES "HealthInvoicePayerComponent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceReceivableExtension" ADD CONSTRAINT "HealthInsuranceReceivableExtension_insurerBusinessPartyId_fkey" FOREIGN KEY ("organizationId", "insurerBusinessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPaymentExtension" ADD CONSTRAINT "HealthPaymentExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPaymentExtension" ADD CONSTRAINT "HealthPaymentExtension_healthMedicalInvoicePaymentId_fkey" FOREIGN KEY ("healthMedicalInvoicePaymentId") REFERENCES "HealthMedicalInvoicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPaymentExtension" ADD CONSTRAINT "HealthPaymentExtension_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "EnterprisePayment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPaymentExtension" ADD CONSTRAINT "HealthPaymentExtension_payerBusinessPartyId_fkey" FOREIGN KEY ("organizationId", "payerBusinessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthPayerAllocation" ADD CONSTRAINT "HealthPayerAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPayerAllocation" ADD CONSTRAINT "HealthPayerAllocation_payerComponentId_fkey" FOREIGN KEY ("organizationId", "payerComponentId") REFERENCES "HealthInvoicePayerComponent"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
