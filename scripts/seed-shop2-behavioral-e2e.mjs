import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = (process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test").toLowerCase();
const currencyCode = "USD";

async function upsertMapping(mappingKey, ledgerAccountId, actorUserId) {
  const existing = await prisma.enterpriseAccountMapping.findFirst({
    where: { organizationId, mappingKey, effectiveFrom: null },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return prisma.enterpriseAccountMapping.update({
      where: { id: existing.id },
      data: { ledgerAccountId, isActive: true, effectiveTo: null, sourceModule: "RETAIL_POS" },
    });
  }
  return prisma.enterpriseAccountMapping.create({
    data: {
      organizationId,
      mappingKey,
      ledgerAccountId,
      sourceModule: "RETAIL_POS",
      isActive: true,
      createdByUserId: actorUserId,
    },
  });
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error(`Shop 2 seed requires ${adminEmail}`);

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new Error(`Shop 2 seed requires organization ${organizationId}`);

  await prisma.organization.update({
    where: { id: organizationId },
    data: { sectorCode: "COMMERCE_RETAIL", sector: "COMMERCE_RETAIL", status: "ACTIVE", deletedAt: null },
  });

  for (const [index, moduleCode] of ["RETAIL_POS", "RETAIL_DAILY_CLOSE", "CATALOG", "SITES_WAREHOUSES", "INVENTORY_LOGISTICS", "FINANCE_ACCOUNTING", "FINANCE_INVENTORY", "FINANCE_CASH"].entries()) {
    await prisma.enterpriseModule.upsert({
      where: { organizationId_moduleCode: { organizationId, moduleCode } },
      update: { isEnabled: true },
      create: {
        organizationId,
        moduleCode,
        labelFr: moduleCode,
        labelEn: moduleCode,
        moduleCategory: "SHOP2_E2E",
        isEnabled: true,
        isCore: moduleCode === "RETAIL_POS",
        requiresPlanLevel: "STARTER",
        sortOrder: 900 + index,
      },
    });
  }

  const chart = await prisma.enterpriseChartOfAccounts.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-COA" } },
    update: { nameFr: "Plan comptable Shop 2 E2E", nameEn: "Shop 2 E2E chart of accounts", status: "ACTIVE" },
    create: {
      organizationId,
      code: "SHOP2-E2E-COA",
      nameFr: "Plan comptable Shop 2 E2E",
      nameEn: "Shop 2 E2E chart of accounts",
      status: "ACTIVE",
      createdByUserId: admin.id,
    },
  });

  const accountSpecs = [
    ["SHOP2-CASH", "Caisse Shop 2", "Shop 2 cash", "ASSET"],
    ["SHOP2-SALES", "Ventes Shop 2", "Shop 2 sales", "REVENUE"],
    ["SHOP2-TAX", "Taxes à payer Shop 2", "Shop 2 tax payable", "LIABILITY"],
    ["SHOP2-COGS", "Coût des ventes Shop 2", "Shop 2 cost of sales", "EXPENSE"],
    ["SHOP2-INVENTORY", "Stock Shop 2", "Shop 2 inventory", "ASSET"],
  ];
  const accounts = {};
  for (const [code, nameFr, nameEn, accountType] of accountSpecs) {
    accounts[code] = await prisma.enterpriseLedgerAccount.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: { chartId: chart.id, nameFr, nameEn, accountType, currencyCode, isActive: true, archivedAt: null, allowDirectPosting: true },
      create: {
        organizationId,
        chartId: chart.id,
        code,
        nameFr,
        nameEn,
        accountType,
        currencyCode,
        isActive: true,
        allowDirectPosting: true,
      },
    });
  }

  await upsertMapping("SALES_REVENUE", accounts["SHOP2-SALES"].id, admin.id);
  await upsertMapping("TAX_PAYABLE", accounts["SHOP2-TAX"].id, admin.id);
  await upsertMapping("COST_OF_SALES", accounts["SHOP2-COGS"].id, admin.id);
  await upsertMapping("INVENTORY", accounts["SHOP2-INVENTORY"].id, admin.id);

  await prisma.enterpriseJournal.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-SALES" } },
    update: { nameFr: "Journal ventes Shop 2", nameEn: "Shop 2 sales journal", journalType: "SALES", sequencePrefix: "S2S", isActive: true },
    create: {
      organizationId,
      code: "SHOP2-SALES",
      nameFr: "Journal ventes Shop 2",
      nameEn: "Shop 2 sales journal",
      journalType: "SALES",
      sequencePrefix: "S2S",
      isActive: true,
      createdByUserId: admin.id,
    },
  });
  await prisma.enterpriseJournal.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-INV" } },
    update: { nameFr: "Journal stock Shop 2", nameEn: "Shop 2 inventory journal", journalType: "INVENTORY", sequencePrefix: "S2I", isActive: true },
    create: {
      organizationId,
      code: "SHOP2-INV",
      nameFr: "Journal stock Shop 2",
      nameEn: "Shop 2 inventory journal",
      journalType: "INVENTORY",
      sequencePrefix: "S2I",
      isActive: true,
      createdByUserId: admin.id,
    },
  });

  const fiscalYear = await prisma.enterpriseFiscalYear.upsert({
    where: { organizationId_code: { organizationId, code: "FY2026-SHOP2" } },
    update: { startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-12-31T23:59:59.999Z"), status: "OPEN" },
    create: {
      organizationId,
      code: "FY2026-SHOP2",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
      status: "OPEN",
      createdByUserId: admin.id,
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  await prisma.enterpriseFiscalPeriod.upsert({
    where: { organizationId_code: { organizationId, code: "2026-08-SHOP2" } },
    update: { fiscalYearId: fiscalYear.id, startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-08-31T23:59:59.999Z"), status: "OPEN" },
    create: {
      organizationId,
      fiscalYearId: fiscalYear.id,
      code: "2026-08-SHOP2",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T23:59:59.999Z"),
      status: "OPEN",
      createdByUserId: admin.id,
    },
  });

  const site = await prisma.enterpriseSite.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-SITE" } },
    update: { name: "Shop 2 E2E Store", siteType: "STORE", countryCode: "US", timezone: "UTC", status: "ACTIVE", archivedAt: null },
    create: {
      organizationId,
      code: "SHOP2-E2E-SITE",
      name: "Shop 2 E2E Store",
      siteType: "STORE",
      countryCode: "US",
      timezone: "UTC",
      status: "ACTIVE",
      createdByUserId: admin.id,
    },
  });
  const warehouse = await prisma.enterpriseWarehouse.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-WH" } },
    update: { siteId: site.id, name: "Shop 2 E2E Warehouse", warehouseType: "STORE", status: "ACTIVE", archivedAt: null },
    create: {
      organizationId,
      siteId: site.id,
      code: "SHOP2-E2E-WH",
      name: "Shop 2 E2E Warehouse",
      warehouseType: "STORE",
      status: "ACTIVE",
      createdByUserId: admin.id,
    },
  });

  const uom = await prisma.enterpriseUnitOfMeasure.upsert({
    where: { organizationId_code: { organizationId, code: "EA" } },
    update: { name: "Each", symbol: "ea", category: "COUNT", status: "ACTIVE", archivedAt: null },
    create: { organizationId, code: "EA", name: "Each", symbol: "ea", category: "COUNT", status: "ACTIVE", isSystem: true, createdByUserId: admin.id },
  });
  const catalogItem = await prisma.enterpriseCatalogItem.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-SKU" } },
    update: {
      sku: "SHOP2-E2E-SKU",
      name: "Shop 2 E2E Product",
      normalizedName: "shop 2 e2e product",
      itemType: "PRODUCT",
      unitOfMeasureId: uom.id,
      indicativeSalePrice: 10,
      indicativeCost: 4,
      currency: currencyCode,
      status: "ACTIVE",
      taxable: true,
      trackInventory: true,
      archivedAt: null,
    },
    create: {
      organizationId,
      code: "SHOP2-E2E-SKU",
      sku: "SHOP2-E2E-SKU",
      name: "Shop 2 E2E Product",
      normalizedName: "shop 2 e2e product",
      itemType: "PRODUCT",
      unitOfMeasureId: uom.id,
      indicativeSalePrice: 10,
      indicativeCost: 4,
      currency: currencyCode,
      status: "ACTIVE",
      taxable: true,
      trackInventory: true,
      createdByUserId: admin.id,
    },
  });
  const inventoryItem = await prisma.enterpriseInventoryItem.upsert({
    where: { organizationId_catalogItemId: { organizationId, catalogItemId: catalogItem.id } },
    update: { status: "ACTIVE", allowNegativeStock: false, archivedAt: null },
    create: { organizationId, catalogItemId: catalogItem.id, status: "ACTIVE", allowNegativeStock: false, createdByUserId: admin.id },
  });

  const existingBalance = await prisma.enterpriseInventoryBalance.findFirst({
    where: {
      organizationId,
      inventoryItemId: inventoryItem.id,
      warehouseId: warehouse.id,
      storageLocationId: null,
      stockLotId: null,
    },
  });
  if (existingBalance) {
    await prisma.enterpriseInventoryBalance.update({
      where: { id: existingBalance.id },
      data: { quantityOnHand: 50, quantityReserved: 0 },
    });
  } else {
    await prisma.enterpriseInventoryBalance.create({
      data: {
        organizationId,
        inventoryItemId: inventoryItem.id,
        warehouseId: warehouse.id,
        quantityOnHand: 50,
        quantityReserved: 0,
      },
    });
  }

  const cashAccount = await prisma.enterpriseFinancialAccount.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-CASH" } },
    update: {
      name: "Shop 2 E2E Cash",
      accountType: "CASH",
      currencyCode,
      ledgerAccountId: accounts["SHOP2-CASH"].id,
      siteId: site.id,
      status: "ACTIVE",
      archivedAt: null,
      openingBalance: 1000,
      operationalBalance: 1000,
      reconciledBalance: 1000,
      availableBalance: 1000,
    },
    create: {
      organizationId,
      code: "SHOP2-E2E-CASH",
      name: "Shop 2 E2E Cash",
      accountType: "CASH",
      currencyCode,
      openingBalance: 1000,
      operationalBalance: 1000,
      reconciledBalance: 1000,
      availableBalance: 1000,
      ledgerAccountId: accounts["SHOP2-CASH"].id,
      siteId: site.id,
      responsibleUserId: admin.id,
      status: "ACTIVE",
    },
  });

  await prisma.enterpriseFinanceConfiguration.upsert({
    where: { organizationId },
    update: {
      functionalCurrencyCode: currencyCode,
      presentationCurrencyCode: currencyCode,
      inventoryValuationMethod: "WEIGHTED_AVERAGE",
      defaultAccountsJson: {
        SALES_REVENUE: accounts["SHOP2-SALES"].id,
        TAX_PAYABLE: accounts["SHOP2-TAX"].id,
        COST_OF_SALES: accounts["SHOP2-COGS"].id,
        INVENTORY: accounts["SHOP2-INVENTORY"].id,
        CASH: accounts["SHOP2-CASH"].id,
      },
      readinessStatus: "READY",
      automaticPostingEnabled: true,
      lockedFunctionalCurrencyAt: new Date(),
      updatedByUserId: admin.id,
    },
    create: {
      organizationId,
      functionalCurrencyCode: currencyCode,
      presentationCurrencyCode: currencyCode,
      inventoryValuationMethod: "WEIGHTED_AVERAGE",
      defaultAccountsJson: {
        SALES_REVENUE: accounts["SHOP2-SALES"].id,
        TAX_PAYABLE: accounts["SHOP2-TAX"].id,
        COST_OF_SALES: accounts["SHOP2-COGS"].id,
        INVENTORY: accounts["SHOP2-INVENTORY"].id,
        CASH: accounts["SHOP2-CASH"].id,
      },
      readinessStatus: "READY",
      automaticPostingEnabled: true,
      lockedFunctionalCurrencyAt: new Date(),
      createdByUserId: admin.id,
    },
  });

  console.log(JSON.stringify({
    organizationId,
    adminUserId: admin.id,
    currencyCode,
    siteId: site.id,
    warehouseId: warehouse.id,
    catalogItemId: catalogItem.id,
    catalogItemCode: catalogItem.code,
    inventoryItemId: inventoryItem.id,
    cashAccountId: cashAccount.id,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
