-- DTSC ERP consolidation iteration 02: business parties, catalog, sites and warehouses.
-- Additive only. No legacy table or data is removed.

CREATE TABLE "EnterpriseBusinessParty" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partyType" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "displayName" TEXT,
  "normalizedName" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "migrationKey" TEXT,
  "taxIdentifier" TEXT,
  "registrationId" TEXT,
  "primaryEmail" TEXT,
  "primaryPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseBusinessParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBusinessPartyRole" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "roleCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseBusinessPartyRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBusinessPartyContact" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "contactType" TEXT NOT NULL,
  "label" TEXT,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseBusinessPartyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseBusinessPartyAddress" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "addressType" TEXT NOT NULL DEFAULT 'PRIMARY',
  "label" TEXT,
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "city" TEXT,
  "stateProvince" TEXT,
  "postalCode" TEXT,
  "countryCode" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseBusinessPartyAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseUnitOfMeasure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "decimalScale" INTEGER NOT NULL DEFAULT 3,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseUnitOfMeasure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseCatalogCategory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parentCategoryId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseCatalogCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseCatalogItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "itemType" TEXT NOT NULL,
  "categoryId" TEXT,
  "unitOfMeasureId" TEXT NOT NULL,
  "indicativeSalePrice" DECIMAL(18,2),
  "indicativeCost" DECIMAL(18,2),
  "currency" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "taxCode" TEXT,
  "trackInventory" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseSite" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "siteType" TEXT NOT NULL,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "stateProvince" TEXT,
  "postalCode" TEXT,
  "countryCode" TEXT,
  "timezone" TEXT,
  "managerUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "settingsJson" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseWarehouse" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "warehouseType" TEXT NOT NULL DEFAULT 'GENERAL',
  "managerUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "settingsJson" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseWarehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseStorageLocation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "parentLocationId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "locationType" TEXT NOT NULL DEFAULT 'GENERAL',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "restrictedAccess" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseStorageLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseBusinessParty_organizationId_id_key" ON "EnterpriseBusinessParty"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseBusinessParty_organizationId_code_key" ON "EnterpriseBusinessParty"("organizationId", "code");
CREATE UNIQUE INDEX "EnterpriseBusinessParty_organizationId_migrationKey_key" ON "EnterpriseBusinessParty"("organizationId", "migrationKey");
CREATE INDEX "EnterpriseBusinessParty_organizationId_partyType_status_idx" ON "EnterpriseBusinessParty"("organizationId", "partyType", "status");
CREATE INDEX "EnterpriseBusinessParty_organizationId_normalizedName_status_idx" ON "EnterpriseBusinessParty"("organizationId", "normalizedName", "status");
CREATE INDEX "EnterpriseBusinessParty_organizationId_taxIdentifier_idx" ON "EnterpriseBusinessParty"("organizationId", "taxIdentifier");
CREATE INDEX "EnterpriseBusinessParty_organizationId_registrationId_idx" ON "EnterpriseBusinessParty"("organizationId", "registrationId");
CREATE INDEX "EnterpriseBusinessParty_organizationId_primaryEmail_idx" ON "EnterpriseBusinessParty"("organizationId", "primaryEmail");
CREATE INDEX "EnterpriseBusinessParty_archivedAt_idx" ON "EnterpriseBusinessParty"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseBusinessPartyRole_organizationId_businessPartyId_roleCode_key" ON "EnterpriseBusinessPartyRole"("organizationId", "businessPartyId", "roleCode");
CREATE INDEX "EnterpriseBusinessPartyRole_organizationId_roleCode_status_idx" ON "EnterpriseBusinessPartyRole"("organizationId", "roleCode", "status");
CREATE INDEX "EnterpriseBusinessPartyRole_organizationId_businessPartyId_status_idx" ON "EnterpriseBusinessPartyRole"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterpriseBusinessPartyRole_archivedAt_idx" ON "EnterpriseBusinessPartyRole"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseBusinessPartyContact_organizationId_businessPartyId_contactType_normalizedValue_key" ON "EnterpriseBusinessPartyContact"("organizationId", "businessPartyId", "contactType", "normalizedValue");
CREATE INDEX "EnterpriseBusinessPartyContact_organizationId_businessPartyId_isPrimary_idx" ON "EnterpriseBusinessPartyContact"("organizationId", "businessPartyId", "isPrimary");
CREATE INDEX "EnterpriseBusinessPartyContact_organizationId_normalizedValue_idx" ON "EnterpriseBusinessPartyContact"("organizationId", "normalizedValue");
CREATE INDEX "EnterpriseBusinessPartyContact_archivedAt_idx" ON "EnterpriseBusinessPartyContact"("archivedAt");

CREATE INDEX "EnterpriseBusinessPartyAddress_organizationId_businessPartyId_isPrimary_idx" ON "EnterpriseBusinessPartyAddress"("organizationId", "businessPartyId", "isPrimary");
CREATE INDEX "EnterpriseBusinessPartyAddress_organizationId_countryCode_city_idx" ON "EnterpriseBusinessPartyAddress"("organizationId", "countryCode", "city");
CREATE INDEX "EnterpriseBusinessPartyAddress_archivedAt_idx" ON "EnterpriseBusinessPartyAddress"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseUnitOfMeasure_organizationId_id_key" ON "EnterpriseUnitOfMeasure"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseUnitOfMeasure_organizationId_code_key" ON "EnterpriseUnitOfMeasure"("organizationId", "code");
CREATE INDEX "EnterpriseUnitOfMeasure_organizationId_category_status_idx" ON "EnterpriseUnitOfMeasure"("organizationId", "category", "status");
CREATE INDEX "EnterpriseUnitOfMeasure_archivedAt_idx" ON "EnterpriseUnitOfMeasure"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseCatalogCategory_organizationId_id_key" ON "EnterpriseCatalogCategory"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseCatalogCategory_organizationId_code_key" ON "EnterpriseCatalogCategory"("organizationId", "code");
CREATE INDEX "EnterpriseCatalogCategory_organizationId_parentCategoryId_status_idx" ON "EnterpriseCatalogCategory"("organizationId", "parentCategoryId", "status");
CREATE INDEX "EnterpriseCatalogCategory_organizationId_name_status_idx" ON "EnterpriseCatalogCategory"("organizationId", "name", "status");
CREATE INDEX "EnterpriseCatalogCategory_archivedAt_idx" ON "EnterpriseCatalogCategory"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseCatalogItem_organizationId_id_key" ON "EnterpriseCatalogItem"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseCatalogItem_organizationId_code_key" ON "EnterpriseCatalogItem"("organizationId", "code");
CREATE UNIQUE INDEX "EnterpriseCatalogItem_organizationId_sku_key" ON "EnterpriseCatalogItem"("organizationId", "sku");
CREATE INDEX "EnterpriseCatalogItem_organizationId_itemType_status_idx" ON "EnterpriseCatalogItem"("organizationId", "itemType", "status");
CREATE INDEX "EnterpriseCatalogItem_organizationId_categoryId_status_idx" ON "EnterpriseCatalogItem"("organizationId", "categoryId", "status");
CREATE INDEX "EnterpriseCatalogItem_organizationId_normalizedName_status_idx" ON "EnterpriseCatalogItem"("organizationId", "normalizedName", "status");
CREATE INDEX "EnterpriseCatalogItem_organizationId_trackInventory_status_idx" ON "EnterpriseCatalogItem"("organizationId", "trackInventory", "status");
CREATE INDEX "EnterpriseCatalogItem_archivedAt_idx" ON "EnterpriseCatalogItem"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseSite_organizationId_id_key" ON "EnterpriseSite"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseSite_organizationId_code_key" ON "EnterpriseSite"("organizationId", "code");
CREATE INDEX "EnterpriseSite_organizationId_siteType_status_idx" ON "EnterpriseSite"("organizationId", "siteType", "status");
CREATE INDEX "EnterpriseSite_organizationId_managerUserId_status_idx" ON "EnterpriseSite"("organizationId", "managerUserId", "status");
CREATE INDEX "EnterpriseSite_archivedAt_idx" ON "EnterpriseSite"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseWarehouse_organizationId_id_key" ON "EnterpriseWarehouse"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseWarehouse_organizationId_code_key" ON "EnterpriseWarehouse"("organizationId", "code");
CREATE INDEX "EnterpriseWarehouse_organizationId_siteId_status_idx" ON "EnterpriseWarehouse"("organizationId", "siteId", "status");
CREATE INDEX "EnterpriseWarehouse_organizationId_managerUserId_status_idx" ON "EnterpriseWarehouse"("organizationId", "managerUserId", "status");
CREATE INDEX "EnterpriseWarehouse_archivedAt_idx" ON "EnterpriseWarehouse"("archivedAt");

CREATE UNIQUE INDEX "EnterpriseStorageLocation_organizationId_id_key" ON "EnterpriseStorageLocation"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseStorageLocation_organizationId_warehouseId_code_key" ON "EnterpriseStorageLocation"("organizationId", "warehouseId", "code");
CREATE INDEX "EnterpriseStorageLocation_organizationId_warehouseId_status_idx" ON "EnterpriseStorageLocation"("organizationId", "warehouseId", "status");
CREATE INDEX "EnterpriseStorageLocation_organizationId_parentLocationId_status_idx" ON "EnterpriseStorageLocation"("organizationId", "parentLocationId", "status");
CREATE INDEX "EnterpriseStorageLocation_archivedAt_idx" ON "EnterpriseStorageLocation"("archivedAt");
