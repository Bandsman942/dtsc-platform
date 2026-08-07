-- DTSC Platform — COMMERCE_RETAIL + RETAIL_TELCO_MOBILE_MONEY
-- Additive migration only. Historical Commerce migrations remain immutable.

-- ---------------------------------------------------------------------------
-- 1. Operational Retail domain
-- ---------------------------------------------------------------------------
CREATE TABLE "EnterpriseRetailConfiguration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileCode" TEXT NOT NULL DEFAULT 'RETAIL_TELCO_MOBILE_MONEY',
    "defaultSiteId" TEXT,
    "defaultWarehouseId" TEXT,
    "defaultStorageLocationId" TEXT,
    "baseCurrencyCode" TEXT NOT NULL DEFAULT 'CDF',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settingsJson" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseRetailConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "mobileMoneyFloatAccountId" TEXT,
    "telcoFloatAccountId" TEXT,
    "settingsJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseRetailProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "customerBusinessPartyId" TEXT,
    "siteId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "storageLocationId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "subtotal" DECIMAL(20,6) NOT NULL,
    "discountTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(20,6) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashierUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseRetailSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailSaleLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "stockLotId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "discountAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(20,6) NOT NULL,
    "trackInventory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailSaleLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailTender" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailTender_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseMobileMoneyTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "principalAmount" DECIMAL(20,6) NOT NULL,
    "customerFeeAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "providerCommissionAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "feeCollectionMode" TEXT NOT NULL DEFAULT 'NONE',
    "cashAccountId" TEXT NOT NULL,
    "floatAccountId" TEXT NOT NULL,
    "cashEffectAmount" DECIMAL(20,6) NOT NULL,
    "floatEffectAmount" DECIMAL(20,6) NOT NULL,
    "externalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseMobileMoneyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTelcoTopup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "destinationPhone" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "offerLabel" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "saleAmount" DECIMAL(20,6) NOT NULL,
    "operatorCost" DECIMAL(20,6) NOT NULL,
    "marginAmount" DECIMAL(20,6) NOT NULL,
    "tenderFinancialAccountId" TEXT NOT NULL,
    "operatorFloatAccountId" TEXT NOT NULL,
    "externalReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseTelcoTopup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailDailyClose" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedByUserId" TEXT NOT NULL,
    "validatedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnterpriseRetailDailyClose_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseRetailDailyCloseLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dailyCloseId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "systemClosingBalance" DECIMAL(20,6) NOT NULL,
    "declaredBalance" DECIMAL(20,6) NOT NULL,
    "differenceAmount" DECIMAL(20,6) NOT NULL,
    "varianceReason" TEXT,
    "countDetailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRetailDailyCloseLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseRetailConfiguration_organizationId_key" ON "EnterpriseRetailConfiguration"("organizationId");
CREATE INDEX "EnterpriseRetailConfiguration_organizationId_status_idx" ON "EnterpriseRetailConfiguration"("organizationId", "status");
CREATE INDEX "EnterpriseRetailConfiguration_profileCode_status_idx" ON "EnterpriseRetailConfiguration"("profileCode", "status");

CREATE UNIQUE INDEX "EnterpriseRetailProvider_organizationId_id_key" ON "EnterpriseRetailProvider"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailProvider_organizationId_providerCode_key" ON "EnterpriseRetailProvider"("organizationId", "providerCode");
CREATE INDEX "EnterpriseRetailProvider_organizationId_providerType_isActive_idx" ON "EnterpriseRetailProvider"("organizationId", "providerType", "isActive");

CREATE UNIQUE INDEX "EnterpriseRetailSale_organizationId_id_key" ON "EnterpriseRetailSale"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailSale_organizationId_number_key" ON "EnterpriseRetailSale"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseRetailSale_organizationId_idempotencyKey_key" ON "EnterpriseRetailSale"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailSale_organizationId_status_soldAt_idx" ON "EnterpriseRetailSale"("organizationId", "status", "soldAt");
CREATE INDEX "EnterpriseRetailSale_organizationId_cashierUserId_soldAt_idx" ON "EnterpriseRetailSale"("organizationId", "cashierUserId", "soldAt");
CREATE INDEX "EnterpriseRetailSale_organizationId_customerBusinessPartyId_idx" ON "EnterpriseRetailSale"("organizationId", "customerBusinessPartyId");

CREATE UNIQUE INDEX "EnterpriseRetailSaleLine_organizationId_id_key" ON "EnterpriseRetailSaleLine"("organizationId", "id");
CREATE INDEX "EnterpriseRetailSaleLine_organizationId_saleId_idx" ON "EnterpriseRetailSaleLine"("organizationId", "saleId");
CREATE INDEX "EnterpriseRetailSaleLine_organizationId_catalogItemId_idx" ON "EnterpriseRetailSaleLine"("organizationId", "catalogItemId");
CREATE INDEX "EnterpriseRetailSaleLine_organizationId_inventoryItemId_idx" ON "EnterpriseRetailSaleLine"("organizationId", "inventoryItemId");

CREATE UNIQUE INDEX "EnterpriseRetailTender_organizationId_id_key" ON "EnterpriseRetailTender"("organizationId", "id");
CREATE INDEX "EnterpriseRetailTender_organizationId_saleId_idx" ON "EnterpriseRetailTender"("organizationId", "saleId");
CREATE INDEX "EnterpriseRetailTender_organizationId_financialAccountId_createdAt_idx" ON "EnterpriseRetailTender"("organizationId", "financialAccountId", "createdAt");

CREATE UNIQUE INDEX "EnterpriseMobileMoneyTransaction_organizationId_id_key" ON "EnterpriseMobileMoneyTransaction"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseMobileMoneyTransaction_organizationId_number_key" ON "EnterpriseMobileMoneyTransaction"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseMobileMoneyTransaction_organizationId_idempotencyKey_key" ON "EnterpriseMobileMoneyTransaction"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseMobileMoneyTransaction_organizationId_providerCode_occurredAt_idx" ON "EnterpriseMobileMoneyTransaction"("organizationId", "providerCode", "occurredAt");
CREATE INDEX "EnterpriseMobileMoneyTransaction_organizationId_transactionType_status_occurredAt_idx" ON "EnterpriseMobileMoneyTransaction"("organizationId", "transactionType", "status", "occurredAt");
CREATE INDEX "EnterpriseMobileMoneyTransaction_organizationId_agentUserId_occurredAt_idx" ON "EnterpriseMobileMoneyTransaction"("organizationId", "agentUserId", "occurredAt");

CREATE UNIQUE INDEX "EnterpriseTelcoTopup_organizationId_id_key" ON "EnterpriseTelcoTopup"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTelcoTopup_organizationId_number_key" ON "EnterpriseTelcoTopup"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseTelcoTopup_organizationId_idempotencyKey_key" ON "EnterpriseTelcoTopup"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseTelcoTopup_organizationId_providerCode_status_occurredAt_idx" ON "EnterpriseTelcoTopup"("organizationId", "providerCode", "status", "occurredAt");
CREATE INDEX "EnterpriseTelcoTopup_organizationId_agentUserId_occurredAt_idx" ON "EnterpriseTelcoTopup"("organizationId", "agentUserId", "occurredAt");
CREATE INDEX "EnterpriseTelcoTopup_organizationId_catalogItemId_idx" ON "EnterpriseTelcoTopup"("organizationId", "catalogItemId");

CREATE UNIQUE INDEX "EnterpriseRetailDailyClose_organizationId_id_key" ON "EnterpriseRetailDailyClose"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailDailyClose_organizationId_number_key" ON "EnterpriseRetailDailyClose"("organizationId", "number");
CREATE UNIQUE INDEX "EnterpriseRetailDailyClose_organizationId_idempotencyKey_key" ON "EnterpriseRetailDailyClose"("organizationId", "idempotencyKey");
CREATE INDEX "EnterpriseRetailDailyClose_organizationId_businessDate_status_idx" ON "EnterpriseRetailDailyClose"("organizationId", "businessDate", "status");
CREATE INDEX "EnterpriseRetailDailyClose_organizationId_submittedByUserId_businessDate_idx" ON "EnterpriseRetailDailyClose"("organizationId", "submittedByUserId", "businessDate");

CREATE UNIQUE INDEX "EnterpriseRetailDailyCloseLine_organizationId_id_key" ON "EnterpriseRetailDailyCloseLine"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseRetailDailyCloseLine_org_close_account_key" ON "EnterpriseRetailDailyCloseLine"("organizationId", "dailyCloseId", "financialAccountId");
CREATE INDEX "EnterpriseRetailDailyCloseLine_organizationId_dailyCloseId_idx" ON "EnterpriseRetailDailyCloseLine"("organizationId", "dailyCloseId");
CREATE INDEX "EnterpriseRetailDailyCloseLine_organizationId_financialAccountId_idx" ON "EnterpriseRetailDailyCloseLine"("organizationId", "financialAccountId");
CREATE INDEX "EnterpriseRetailDailyCloseLine_organizationId_cashSessionId_idx" ON "EnterpriseRetailDailyCloseLine"("organizationId", "cashSessionId");

ALTER TABLE "EnterpriseRetailSaleLine"
  ADD CONSTRAINT "EnterpriseRetailSaleLine_organizationId_saleId_fkey"
  FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailTender"
  ADD CONSTRAINT "EnterpriseRetailTender_organizationId_saleId_fkey"
  FOREIGN KEY ("organizationId", "saleId") REFERENCES "EnterpriseRetailSale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseRetailDailyCloseLine"
  ADD CONSTRAINT "EnterpriseRetailDailyCloseLine_org_dailyClose_fkey"
  FOREIGN KEY ("organizationId", "dailyCloseId") REFERENCES "EnterpriseRetailDailyClose"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Commerce template v2: ERP Core convergence + Retail Telco/Mobile Money
-- ---------------------------------------------------------------------------
UPDATE "SectorTemplate"
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "sectorId" IN (SELECT "id" FROM "BusinessSector" WHERE "code" = 'COMMERCE_RETAIL')
  AND "version" < 2;

INSERT INTO "SectorTemplate" ("id", "sectorId", "version", "label", "description", "isActive", "createdAt", "updatedAt")
SELECT
  'sector-template-commerce-retail-v2',
  s."id",
  2,
  'Commerce Retail — Télécom & Mobile Money',
  'Profil RETAIL_TELCO_MOBILE_MONEY convergé vers les modules ERP Core DTSC : catalogue, sites, stock, fournisseurs, trésorerie, POS, Mobile Money, recharges Télécom et clôture cash/float.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "BusinessSector" s
WHERE s."code" = 'COMMERCE_RETAIL'
ON CONFLICT ("sectorId", "version") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id" FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
), module_defs AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"CRM_CUSTOMERS","fr":"Clients professionnels","en":"Business customers","descriptionFr":"Clients, prospects et tiers depuis le référentiel ERP Core.","descriptionEn":"Customers, prospects and parties from the ERP Core master data.","category":"COMMERCIAL","icon":"users-round","sort":10,"plan":"STARTER"},
    {"code":"CATALOG","fr":"Catalogue produits & services","en":"Products & services catalog","descriptionFr":"Accessoires, services, forfaits et tarifs de référence.","descriptionEn":"Accessories, services, bundles and reference pricing.","category":"COMMERCIAL","icon":"package","sort":20,"plan":"STARTER"},
    {"code":"SITES_WAREHOUSES","fr":"Sites & dépôts","en":"Sites & warehouses","descriptionFr":"Boutique, réserve, dépôt et emplacements de stockage.","descriptionEn":"Shop, reserve, warehouse and storage locations.","category":"PROCUREMENT_INVENTORY","icon":"warehouse","sort":30,"plan":"BUSINESS"},
    {"code":"INVENTORY_LOGISTICS","fr":"Stock & logistique","en":"Inventory & logistics","descriptionFr":"Journal de stock, mouvements, lots, niveaux et inventaires.","descriptionEn":"Inventory journal, movements, lots, balances and counts.","category":"PROCUREMENT_INVENTORY","icon":"boxes","sort":40,"plan":"BUSINESS"},
    {"code":"SUPPLIERS_PURCHASES","fr":"Fournisseurs & achats","en":"Suppliers & purchases","descriptionFr":"Fournisseurs, commandes et réapprovisionnement de la boutique.","descriptionEn":"Suppliers, purchase orders and shop replenishment.","category":"PROCUREMENT_INVENTORY","icon":"package-check","sort":50,"plan":"BUSINESS"},
    {"code":"FINANCE_OVERVIEW","fr":"Vue Finance","en":"Finance overview","descriptionFr":"Synthèse financière opérationnelle du shop.","descriptionEn":"Operational finance summary for the shop.","category":"FINANCE","icon":"landmark","sort":60,"plan":"BUSINESS"},
    {"code":"FINANCE_ACCOUNTING","fr":"Comptabilité","en":"Accounting","descriptionFr":"Socle comptable pour les écritures et rapprochements professionnels.","descriptionEn":"Accounting foundation for professional postings and reconciliation.","category":"FINANCE","icon":"book-open-check","sort":70,"plan":"BUSINESS"},
    {"code":"FINANCE_TREASURY","fr":"Trésorerie","en":"Treasury","descriptionFr":"Comptes CASH, MOBILE_MONEY, BANK et CLEARING avec soldes opérationnels.","descriptionEn":"CASH, MOBILE_MONEY, BANK and CLEARING accounts with operational balances.","category":"FINANCE","icon":"wallet-cards","sort":80,"plan":"BUSINESS"},
    {"code":"FINANCE_CASH","fr":"Caisses","en":"Cash","descriptionFr":"Sessions de caisse, mouvements, comptages et écarts.","descriptionEn":"Cash sessions, movements, counts and variances.","category":"FINANCE","icon":"banknote","sort":90,"plan":"BUSINESS"},
    {"code":"RETAIL_POS","fr":"Point de vente","en":"Point of sale","descriptionFr":"Vente comptoir rapide, paiement fractionné et sortie de stock atomique.","descriptionEn":"Fast counter sales, split tenders and atomic stock issue.","category":"COMMERCIAL","icon":"shopping-cart","sort":100,"plan":"BUSINESS"},
    {"code":"MOBILE_MONEY_AGENCY","fr":"Agence Mobile Money","en":"Mobile Money agency","descriptionFr":"Dépôts, retraits, cash, float, frais et commissions par opérateur.","descriptionEn":"Deposits, withdrawals, cash, float, fees and commissions per provider.","category":"FINANCE","icon":"smartphone-nfc","sort":110,"plan":"BUSINESS"},
    {"code":"TELCO_TOPUPS","fr":"Télécom & forfaits","en":"Telco & top-ups","descriptionFr":"Crédit, forfaits internet et recharges avec coût et marge opérateur.","descriptionEn":"Airtime, internet bundles and top-ups with operator cost and margin.","category":"COMMERCIAL","icon":"radio-tower","sort":120,"plan":"BUSINESS"},
    {"code":"RETAIL_DAILY_CLOSE","fr":"Clôture cash & float","en":"Cash & float close","descriptionFr":"Clôture journalière, écarts et validation indépendante des caisses et floats.","descriptionEn":"Daily close, variances and independent validation of cash and provider floats.","category":"FINANCE","icon":"clipboard-check","sort":130,"plan":"BUSINESS"},
    {"code":"REPORTS","fr":"Rapports","en":"Reports","descriptionFr":"Rapports et indicateurs consolidés de l’entreprise.","descriptionEn":"Consolidated enterprise reports and indicators.","category":"ANALYTICS","icon":"file-bar-chart","sort":140,"plan":"BUSINESS"},
    {"code":"DOCUMENTS","fr":"Documents","en":"Documents","descriptionFr":"Pièces, justificatifs et documents opérationnels du shop.","descriptionEn":"Shop operational documents and supporting evidence.","category":"DOCUMENTS","icon":"folder","sort":150,"plan":"STARTER"}
  ]'::jsonb) AS m("code" TEXT, "fr" TEXT, "en" TEXT, "descriptionFr" TEXT, "descriptionEn" TEXT, "category" TEXT, "icon" TEXT, "sort" INTEGER, "plan" TEXT)
)
INSERT INTO "SectorTemplateModule" (
  "id", "templateId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "sortOrder", "defaultEnabled", "requiresPlanLevel", "createdAt", "updatedAt"
)
SELECT
  CONCAT('stm-retail-v2-', LOWER(REPLACE(m."code", '_', '-'))),
  t."id", m."code", m."fr", m."en", m."descriptionFr", m."descriptionEn", m."category", m."icon", m."sort", true, m."plan", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template t CROSS JOIN module_defs m
ON CONFLICT ("templateId", "moduleCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "moduleCategory" = EXCLUDED."moduleCategory",
  "icon" = EXCLUDED."icon",
  "sortOrder" = EXCLUDED."sortOrder",
  "defaultEnabled" = true,
  "requiresPlanLevel" = EXCLUDED."requiresPlanLevel",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id" FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
), department_defs AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"DIRECTION","fr":"Direction","en":"Management","descriptionFr":"Pilotage du shop, contrôle et supervision.","descriptionEn":"Shop leadership, control and supervision.","sort":10},
    {"code":"SALES_TELCO","fr":"Vente & Télécom","en":"Sales & Telco","descriptionFr":"Ventes d’accessoires, services, crédit et forfaits.","descriptionEn":"Accessories, services, airtime and bundle sales.","sort":20},
    {"code":"MOBILE_MONEY_CASH","fr":"Mobile Money & Caisse","en":"Mobile Money & Cash","descriptionFr":"Dépôts, retraits, encaissements, cash et floats opérateurs.","descriptionEn":"Deposits, withdrawals, tenders, cash and provider floats.","sort":30},
    {"code":"STOCK_PURCHASES","fr":"Stock & Achats","en":"Inventory & Procurement","descriptionFr":"Réserve, stock, inventaires, fournisseurs et réapprovisionnement.","descriptionEn":"Reserve, inventory, counts, suppliers and replenishment.","sort":40},
    {"code":"FINANCE_CONTROL","fr":"Finance & Contrôle","en":"Finance & Control","descriptionFr":"Rapprochements, clôtures, écarts, rapports et contrôle interne.","descriptionEn":"Reconciliation, closes, variances, reporting and internal control.","sort":50}
  ]'::jsonb) AS d("code" TEXT, "fr" TEXT, "en" TEXT, "descriptionFr" TEXT, "descriptionEn" TEXT, "sort" INTEGER)
)
INSERT INTO "SectorTemplateDepartment" (
  "id", "templateId", "departmentCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "sortOrder", "createdAt", "updatedAt"
)
SELECT CONCAT('std-retail-v2-', LOWER(REPLACE(d."code", '_', '-'))), t."id", d."code", d."fr", d."en", d."descriptionFr", d."descriptionEn", d."sort", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template t CROSS JOIN department_defs d
ON CONFLICT ("templateId", "departmentCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr", "descriptionEn" = EXCLUDED."descriptionEn", "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

WITH template AS (
  SELECT t."id" FROM "SectorTemplate" t
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
), position_defs AS (
  SELECT * FROM jsonb_to_recordset($json$
  [
    {"code":"STORE_MANAGER","fr":"Gérant","en":"Store manager","department":"DIRECTION","level":10,"key":true,"sort":10,"descriptionFr":"Supervise les ventes, la caisse, les floats, le stock et les clôtures.","permissions":["enterprise.admin.manage","enterprise.admin.members.manage","enterprise.activities.manage","enterprise.retail.pos.manage","enterprise.retail.mobile_money.manage","enterprise.retail.telco.manage","enterprise.retail.close.manage","enterprise.catalog.manage","enterprise.inventory.manage","enterprise.sites.manage","enterprise.crm.manage","enterprise.finance.treasury.manage","enterprise.finance.cash.manage"]},
    {"code":"SALES_MANAGER","fr":"Responsable ventes & Télécom","en":"Sales & Telco manager","department":"SALES_TELCO","level":20,"key":true,"sort":20,"descriptionFr":"Supervise le POS, le catalogue, les clients et les ventes Télécom.","permissions":["enterprise.retail.pos.manage","enterprise.retail.telco.manage","enterprise.retail.mobile_money.read","enterprise.retail.close.read","enterprise.catalog.update","enterprise.crm.update","enterprise.inventory.read"]},
    {"code":"SELLER","fr":"Vendeur","en":"Seller","department":"SALES_TELCO","level":50,"key":false,"sort":30,"descriptionFr":"Réalise les ventes comptoir et les recharges autorisées.","permissions":["enterprise.retail.pos.read","enterprise.retail.pos.create","enterprise.retail.telco.read","enterprise.retail.telco.create","enterprise.catalog.read","enterprise.crm.read","enterprise.inventory.read"]},
    {"code":"CASHIER","fr":"Caissier","en":"Cashier","department":"MOBILE_MONEY_CASH","level":40,"key":true,"sort":40,"descriptionFr":"Encaisse les ventes, tient sa session de caisse et soumet sa clôture.","permissions":["enterprise.retail.pos.read","enterprise.retail.pos.create","enterprise.retail.mobile_money.read","enterprise.retail.mobile_money.create","enterprise.retail.close.read","enterprise.retail.close.submit","enterprise.finance.cash.read"]},
    {"code":"MOBILE_MONEY_AGENT","fr":"Agent Mobile Money","en":"Mobile Money agent","department":"MOBILE_MONEY_CASH","level":45,"key":true,"sort":50,"descriptionFr":"Réalise les dépôts, retraits et recharges en tenant cash et floats séparés.","permissions":["enterprise.retail.mobile_money.read","enterprise.retail.mobile_money.create","enterprise.retail.telco.read","enterprise.retail.telco.create","enterprise.retail.close.read","enterprise.retail.close.submit","enterprise.finance.treasury.read"]},
    {"code":"STOCK_KEEPER","fr":"Magasinier","en":"Stock keeper","department":"STOCK_PURCHASES","level":50,"key":false,"sort":60,"descriptionFr":"Exécute les opérations de stock autorisées.","permissions":["enterprise.inventory.read","enterprise.inventory.create","enterprise.catalog.read","enterprise.sites.read"]},
    {"code":"STOCK_MANAGER","fr":"Responsable stock","en":"Stock manager","department":"STOCK_PURCHASES","level":30,"key":true,"sort":70,"descriptionFr":"Supervise les stocks, emplacements et articles.","permissions":["enterprise.inventory.manage","enterprise.catalog.update","enterprise.sites.update","enterprise.retail.pos.read"]},
    {"code":"PURCHASE_MANAGER","fr":"Responsable achats","en":"Purchase manager","department":"STOCK_PURCHASES","level":30,"key":true,"sort":80,"descriptionFr":"Pilote les fournisseurs, achats et besoins de réapprovisionnement.","permissions":["enterprise.inventory.read","enterprise.catalog.update","enterprise.sites.read"]},
    {"code":"RETAIL_CONTROLLER","fr":"Contrôleur Retail","en":"Retail controller","department":"FINANCE_CONTROL","level":20,"key":true,"sort":90,"descriptionFr":"Contrôle ventes, Mobile Money, Télécom et valide indépendamment les clôtures.","permissions":["enterprise.retail.pos.read","enterprise.retail.mobile_money.read","enterprise.retail.telco.read","enterprise.retail.close.read","enterprise.retail.close.validate","enterprise.finance.treasury.read","enterprise.finance.cash.read"]}
  ]
  $json$::jsonb) AS p("code" TEXT, "fr" TEXT, "en" TEXT, "department" TEXT, "level" INTEGER, "key" BOOLEAN, "sort" INTEGER, "descriptionFr" TEXT, "permissions" JSONB)
)
INSERT INTO "SectorTemplatePosition" (
  "id", "templateId", "positionCode", "labelFr", "labelEn", "departmentCode", "hierarchyLevel", "descriptionFr", "descriptionEn", "defaultPermissionsJson", "isKeyPosition", "sortOrder", "createdAt", "updatedAt"
)
SELECT CONCAT('stp-retail-v2-', LOWER(REPLACE(p."code", '_', '-'))), t."id", p."code", p."fr", p."en", p."department", p."level", p."descriptionFr", p."en", p."permissions", p."key", p."sort", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM template t CROSS JOIN position_defs p
ON CONFLICT ("templateId", "positionCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "departmentCode" = EXCLUDED."departmentCode", "hierarchyLevel" = EXCLUDED."hierarchyLevel", "descriptionFr" = EXCLUDED."descriptionFr", "defaultPermissionsJson" = EXCLUDED."defaultPermissionsJson", "isKeyPosition" = EXCLUDED."isKeyPosition", "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing Commerce tenants without changing existing position IDs
-- ---------------------------------------------------------------------------
WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL' AND o."deletedAt" IS NULL AND o."organizationType" = 'CLIENT'
), template_departments AS (
  SELECT d.*
  FROM "SectorTemplateDepartment" d
  JOIN "SectorTemplate" t ON t."id" = d."templateId"
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
)
INSERT INTO "EnterpriseDepartment" (
  "id", "organizationId", "departmentCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "isActive", "sortOrder", "sourceTemplateId", "createdAt", "updatedAt"
)
SELECT
  CONCAT('retail-dept-', SUBSTRING(md5(o."organizationId" || ':' || d."departmentCode") FROM 1 FOR 20)),
  o."organizationId", d."departmentCode", d."labelFr", d."labelEn", d."descriptionFr", d."descriptionEn", true, d."sortOrder", d."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM commerce_orgs o CROSS JOIN template_departments d
ON CONFLICT ("organizationId", "departmentCode") DO UPDATE SET
  "labelFr" = EXCLUDED."labelFr", "labelEn" = EXCLUDED."labelEn", "descriptionFr" = EXCLUDED."descriptionFr", "descriptionEn" = EXCLUDED."descriptionEn", "isActive" = true, "sortOrder" = EXCLUDED."sortOrder", "sourceTemplateId" = EXCLUDED."sourceTemplateId", "updatedAt" = CURRENT_TIMESTAMP;

WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId", o."sectorId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL' AND o."deletedAt" IS NULL AND o."organizationType" = 'CLIENT'
), template_positions AS (
  SELECT p.*
  FROM "SectorTemplatePosition" p
  JOIN "SectorTemplate" t ON t."id" = p."templateId"
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
)
INSERT INTO "EnterprisePosition" (
  "id", "organizationId", "sectorId", "positionCode", "labelFr", "labelEn", "departmentId", "hierarchyLevel", "descriptionFr", "descriptionEn", "permissionsJson", "isActive", "isKeyPosition", "sourceTemplateId", "createdAt", "updatedAt"
)
SELECT
  CONCAT('retail-pos-', SUBSTRING(md5(o."organizationId" || ':' || p."positionCode") FROM 1 FOR 20)),
  o."organizationId", o."sectorId", p."positionCode", p."labelFr", p."labelEn",
  d."id", p."hierarchyLevel", p."descriptionFr", p."descriptionEn", p."defaultPermissionsJson", true, p."isKeyPosition", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM commerce_orgs o
CROSS JOIN template_positions p
LEFT JOIN "EnterpriseDepartment" d ON d."organizationId" = o."organizationId" AND d."departmentCode" = p."departmentCode"
ON CONFLICT ("organizationId", "positionCode") DO UPDATE SET
  "sectorId" = EXCLUDED."sectorId",
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "departmentId" = EXCLUDED."departmentId",
  "hierarchyLevel" = EXCLUDED."hierarchyLevel",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "permissionsJson" = EXCLUDED."permissionsJson",
  "isActive" = true,
  "isKeyPosition" = EXCLUDED."isKeyPosition",
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Preserve legacy module rows for history, but never keep them enabled after convergence.
UPDATE "EnterpriseModule" em
SET "isEnabled" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE em."organizationId" IN (
  SELECT o."id" FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL' AND o."deletedAt" IS NULL AND o."organizationType" = 'CLIENT'
)
AND em."moduleCode" IN ('PRODUCTS','SALES','CASH_REGISTER','STOCK','CUSTOMERS','SUPPLIERS','PURCHASE_ORDERS','INVENTORY','PROMOTIONS','SALES_REPORTS');

WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId", o."sectorId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL' AND o."deletedAt" IS NULL AND o."organizationType" = 'CLIENT'
), template_modules AS (
  SELECT m.*
  FROM "SectorTemplateModule" m
  JOIN "SectorTemplate" t ON t."id" = m."templateId"
  JOIN "BusinessSector" s ON s."id" = t."sectorId"
  WHERE s."code" = 'COMMERCE_RETAIL' AND t."version" = 2
)
INSERT INTO "EnterpriseModule" (
  "id", "organizationId", "sectorId", "moduleCode", "labelFr", "labelEn", "descriptionFr", "descriptionEn", "moduleCategory", "icon", "isEnabled", "isCore", "sourceTemplateId", "requiresPlanLevel", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  CONCAT('retail-module-', SUBSTRING(md5(o."organizationId" || ':' || m."moduleCode") FROM 1 FOR 20)),
  o."organizationId", o."sectorId", m."moduleCode", m."labelFr", m."labelEn", m."descriptionFr", m."descriptionEn", m."moduleCategory", m."icon", true, true, m."id", m."requiresPlanLevel", m."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM commerce_orgs o CROSS JOIN template_modules m
ON CONFLICT ("organizationId", "moduleCode") DO UPDATE SET
  "sectorId" = EXCLUDED."sectorId",
  "labelFr" = EXCLUDED."labelFr",
  "labelEn" = EXCLUDED."labelEn",
  "descriptionFr" = EXCLUDED."descriptionFr",
  "descriptionEn" = EXCLUDED."descriptionEn",
  "moduleCategory" = EXCLUDED."moduleCategory",
  "icon" = EXCLUDED."icon",
  "isEnabled" = true,
  "isCore" = true,
  "sourceTemplateId" = EXCLUDED."sourceTemplateId",
  "requiresPlanLevel" = EXCLUDED."requiresPlanLevel",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Profile configuration: use an existing active tenant member as the migration actor.
WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL' AND o."deletedAt" IS NULL AND o."organizationType" = 'CLIENT'
), actors AS (
  SELECT o."organizationId",
    (
      SELECT om."userId"
      FROM "OrganizationMember" om
      WHERE om."organizationId" = o."organizationId" AND om."status" = 'ACTIVE' AND om."removedAt" IS NULL
      ORDER BY CASE om."role" WHEN 'OWNER' THEN 0 WHEN 'ADMIN_ENTREPRISE' THEN 1 WHEN 'ADMIN_ENTERPRISE' THEN 2 WHEN 'MANAGER' THEN 3 ELSE 4 END, om."createdAt" ASC
      LIMIT 1
    ) AS "actorUserId"
  FROM commerce_orgs o
)
INSERT INTO "EnterpriseRetailConfiguration" (
  "id", "organizationId", "profileCode", "baseCurrencyCode", "status", "createdByUserId", "revision", "createdAt", "updatedAt"
)
SELECT
  CONCAT('retail-config-', SUBSTRING(md5(a."organizationId") FROM 1 FOR 20)),
  a."organizationId", 'RETAIL_TELCO_MOBILE_MONEY', 'CDF', 'ACTIVE', a."actorUserId", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM actors a
WHERE a."actorUserId" IS NOT NULL
ON CONFLICT ("organizationId") DO UPDATE SET
  "profileCode" = 'RETAIL_TELCO_MOBILE_MONEY',
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP,
  "revision" = "EnterpriseRetailConfiguration"."revision" + 1;

-- Provider catalog is configurable. Accounts are intentionally left null until the tenant links real financial accounts.
WITH commerce_orgs AS (
  SELECT o."id" AS "organizationId"
  FROM "Organization" o
  WHERE o."sectorCode" = 'COMMERCE_RETAIL' AND o."deletedAt" IS NULL AND o."organizationType" = 'CLIENT'
), providers AS (
  SELECT * FROM jsonb_to_recordset('[
    {"code":"MPESA","label":"M-Pesa","type":"BOTH"},
    {"code":"ORANGE_MONEY","label":"Orange Money","type":"BOTH"},
    {"code":"AIRTEL_MONEY","label":"Airtel Money","type":"BOTH"},
    {"code":"AFRIMONEY","label":"Afrimoney","type":"BOTH"}
  ]'::jsonb) AS p("code" TEXT, "label" TEXT, "type" TEXT)
)
INSERT INTO "EnterpriseRetailProvider" (
  "id", "organizationId", "providerCode", "label", "providerType", "isActive", "revision", "createdAt", "updatedAt"
)
SELECT
  CONCAT('retail-provider-', SUBSTRING(md5(o."organizationId" || ':' || p."code") FROM 1 FOR 20)),
  o."organizationId", p."code", p."label", p."type", true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM commerce_orgs o CROSS JOIN providers p
ON CONFLICT ("organizationId", "providerCode") DO UPDATE SET
  "label" = EXCLUDED."label", "providerType" = EXCLUDED."providerType", "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;
