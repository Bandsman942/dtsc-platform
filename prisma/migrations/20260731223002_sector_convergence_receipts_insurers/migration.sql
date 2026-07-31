CREATE TABLE "PharmacyReceiptExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pharmacyReceiptId" TEXT NOT NULL,
  "purchaseExtensionId" TEXT NOT NULL,
  "enterpriseReceiptId" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PharmacyReceiptExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthInsuranceProviderExtension" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "healthInsuranceProviderId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "migrationKey" TEXT,
  "mappingVersion" INTEGER NOT NULL DEFAULT 1,
  "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
  "cutoverAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthInsuranceProviderExtension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyReceiptExtension_organizationId_id_key" ON "PharmacyReceiptExtension"("organizationId", "id");
CREATE UNIQUE INDEX "PharmacyReceiptExtension_source_key" ON "PharmacyReceiptExtension"("organizationId", "pharmacyReceiptId");
CREATE UNIQUE INDEX "PharmacyReceiptExtension_target_key" ON "PharmacyReceiptExtension"("organizationId", "enterpriseReceiptId");
CREATE INDEX "PharmacyReceiptExtension_purchase_idx" ON "PharmacyReceiptExtension"("organizationId", "purchaseExtensionId");
CREATE INDEX "PharmacyReceiptExtension_status_idx" ON "PharmacyReceiptExtension"("organizationId", "syncStatus");
CREATE UNIQUE INDEX "HealthInsuranceProviderExtension_organizationId_id_key" ON "HealthInsuranceProviderExtension"("organizationId", "id");
CREATE UNIQUE INDEX "HealthInsuranceProviderExtension_source_key" ON "HealthInsuranceProviderExtension"("organizationId", "healthInsuranceProviderId");
CREATE UNIQUE INDEX "HealthInsuranceProviderExtension_target_key" ON "HealthInsuranceProviderExtension"("organizationId", "businessPartyId");
CREATE UNIQUE INDEX "HealthInsuranceProviderExtension_migration_key" ON "HealthInsuranceProviderExtension"("organizationId", "migrationKey");
CREATE INDEX "HealthInsuranceProviderExtension_status_idx" ON "HealthInsuranceProviderExtension"("organizationId", "syncStatus");

ALTER TABLE "PharmacyReceiptExtension" ADD CONSTRAINT "PharmacyReceiptExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptExtension" ADD CONSTRAINT "PharmacyReceiptExtension_pharmacyReceiptId_fkey" FOREIGN KEY ("pharmacyReceiptId") REFERENCES "PharmacyReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptExtension" ADD CONSTRAINT "PharmacyReceiptExtension_purchaseExtensionId_fkey" FOREIGN KEY ("organizationId", "purchaseExtensionId") REFERENCES "PharmacyPurchaseExtension"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PharmacyReceiptExtension" ADD CONSTRAINT "PharmacyReceiptExtension_enterpriseReceiptId_fkey" FOREIGN KEY ("enterpriseReceiptId") REFERENCES "EnterprisePurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceProviderExtension" ADD CONSTRAINT "HealthInsuranceProviderExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceProviderExtension" ADD CONSTRAINT "HealthInsuranceProviderExtension_healthInsuranceProviderId_fkey" FOREIGN KEY ("healthInsuranceProviderId") REFERENCES "HealthInsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthInsuranceProviderExtension" ADD CONSTRAINT "HealthInsuranceProviderExtension_businessPartyId_fkey" FOREIGN KEY ("organizationId", "businessPartyId") REFERENCES "EnterpriseBusinessParty"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
