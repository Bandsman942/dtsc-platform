import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

const fixture = {
  userId: "",
  currencyCode: "",
  warehouseId: "",
  catalogItemId: "",
  inventoryItemId: "",
  cashAccountId: "",
  unitPrice: 10,
};

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

function expectBalanced(entry, label) {
  const debit = entry.lines.reduce((sum, line) => sum + asNumber(line.debitBase), 0);
  const credit = entry.lines.reduce((sum, line) => sum + asNumber(line.creditBase), 0);
  expect(Math.abs(debit - credit), `${label}: debits and credits must balance`).toBeLessThan(0.00001);
  expect(debit, `${label}: journal entry must contain value`).toBeGreaterThan(0);
}

async function ensureInventoryCostLayer({ inventoryItemId, warehouseId, currencyCode, userId }) {
  const existingLayer = await prisma.enterpriseInventoryCostLayer.findFirst({
    where: {
      organizationId,
      inventoryItemId,
      warehouseId,
      currencyCode,
      remainingQuantity: { gt: 5 },
    },
    orderBy: { effectiveAt: "desc" },
  });
  if (existingLayer) return existingLayer;

  const movementKey = `shop2-e2e-opening:${inventoryItemId}:${warehouseId}:${currencyCode}`;
  let movement = await prisma.enterpriseStockMovement.findFirst({
    where: { organizationId, idempotencyKey: movementKey },
  });
  if (!movement) {
    movement = await prisma.enterpriseStockMovement.create({
      data: {
        organizationId,
        inventoryItemId,
        warehouseId,
        movementType: "OPENING_BALANCE",
        direction: "IN",
        quantity: new Prisma.Decimal(50),
        balanceAfter: new Prisma.Decimal(50),
        idempotencyKey: movementKey,
        reason: "Shop 2.0 behavioral acceptance opening stock",
        createdByUserId: userId,
      },
    });
  }

  const existingForMovement = await prisma.enterpriseInventoryCostLayer.findFirst({
    where: { organizationId, sourceMovementId: movement.id },
  });
  if (existingForMovement) {
    if (existingForMovement.remainingQuantity.lte(5)) {
      await prisma.enterpriseInventoryCostLayer.update({
        where: { id: existingForMovement.id },
        data: { remainingQuantity: new Prisma.Decimal(50), quantity: new Prisma.Decimal(50), totalCost: new Prisma.Decimal(250) },
      });
    }
    return existingForMovement;
  }

  return prisma.enterpriseInventoryCostLayer.create({
    data: {
      organizationId,
      inventoryItemId,
      warehouseId,
      sourceMovementId: movement.id,
      valuationMethod: "WEIGHTED_AVERAGE",
      quantity: new Prisma.Decimal(50),
      remainingQuantity: new Prisma.Decimal(50),
      unitCost: new Prisma.Decimal(5),
      totalCost: new Prisma.Decimal(250),
      currencyCode,
      effectiveAt: new Date(),
    },
  });
}

async function prepareRetailFixture() {
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error(`Shop 2 E2E requires seeded admin ${adminEmail}`);
  fixture.userId = user.id;

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new Error(`Shop 2 E2E requires seeded organization ${organizationId}`);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { sectorCode: "COMMERCE_RETAIL", status: "ACTIVE" },
  });

  const finance = await prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!finance?.functionalCurrencyCode) throw new Error("Shop 2 E2E requires Finance functional currency");
  fixture.currencyCode = finance.functionalCurrencyCode;
  if (finance.readinessStatus !== "READY") {
    await prisma.enterpriseFinanceConfiguration.update({
      where: { organizationId },
      data: { readinessStatus: "READY" },
    });
  }

  const requiredMappings = ["SALES_REVENUE", "TAX_PAYABLE", "COST_OF_SALES", "INVENTORY"];
  const mappings = await prisma.enterpriseAccountMapping.findMany({
    where: { organizationId, mappingKey: { in: requiredMappings }, isActive: true },
    select: { mappingKey: true },
  });
  const mappingSet = new Set(mappings.map((mapping) => mapping.mappingKey));
  const missingMappings = requiredMappings.filter((mapping) => !mappingSet.has(mapping));
  if (missingMappings.length) throw new Error(`Shop 2 E2E missing Finance mappings: ${missingMappings.join(", ")}`);

  const journals = await prisma.enterpriseJournal.findMany({
    where: { organizationId, journalType: { in: ["SALES", "INVENTORY"] }, isActive: true },
    select: { journalType: true },
  });
  const journalTypes = new Set(journals.map((journal) => journal.journalType));
  if (!journalTypes.has("SALES") || !journalTypes.has("INVENTORY")) throw new Error("Shop 2 E2E requires active SALES and INVENTORY journals");

  const now = new Date();
  const period = await prisma.enterpriseFiscalPeriod.findFirst({
    where: { organizationId, startDate: { lte: now }, endDate: { gte: now }, status: { in: ["OPEN", "SOFT_CLOSED"] } },
  });
  if (!period) throw new Error("Shop 2 E2E requires an open or soft-closed fiscal period");

  await prisma.enterpriseRetailConfiguration.upsert({
    where: { organizationId },
    update: { profileCode: "RETAIL_CORE", baseCurrencyCode: fixture.currencyCode, status: "ACTIVE", updatedByUserId: user.id, revision: { increment: 1 } },
    create: { organizationId, profileCode: "RETAIL_CORE", baseCurrencyCode: fixture.currencyCode, status: "ACTIVE", createdByUserId: user.id },
  });

  const warehouse = await prisma.enterpriseWarehouse.findFirst({
    where: { organizationId, status: "ACTIVE", archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!warehouse) throw new Error("Shop 2 E2E requires an active warehouse from the ERP seed");
  fixture.warehouseId = warehouse.id;

  let inventoryItem = await prisma.enterpriseInventoryItem.findFirst({
    where: { organizationId, status: "ACTIVE", archivedAt: null },
    include: { catalogItem: true },
    orderBy: { createdAt: "asc" },
  });
  if (!inventoryItem) throw new Error("Shop 2 E2E requires an active inventory item from the ERP seed");
  fixture.inventoryItemId = inventoryItem.id;
  fixture.catalogItemId = inventoryItem.catalogItemId;

  await prisma.enterpriseCatalogItem.update({
    where: { id: inventoryItem.catalogItemId },
    data: {
      status: "ACTIVE",
      trackInventory: true,
      currency: fixture.currencyCode,
      indicativeSalePrice: new Prisma.Decimal(fixture.unitPrice),
    },
  });

  const balance = await prisma.enterpriseInventoryBalance.findFirst({
    where: { organizationId, inventoryItemId: inventoryItem.id, warehouseId: warehouse.id, stockLotId: null },
  });
  if (balance) {
    await prisma.enterpriseInventoryBalance.update({
      where: { id: balance.id },
      data: { quantityOnHand: new Prisma.Decimal(50), quantityReserved: new Prisma.Decimal(0) },
    });
  } else {
    await prisma.enterpriseInventoryBalance.create({
      data: {
        organizationId,
        inventoryItemId: inventoryItem.id,
        warehouseId: warehouse.id,
        quantityOnHand: new Prisma.Decimal(50),
        quantityReserved: new Prisma.Decimal(0),
      },
    });
  }
  await ensureInventoryCostLayer({ inventoryItemId: inventoryItem.id, warehouseId: warehouse.id, currencyCode: fixture.currencyCode, userId: user.id });

  const cashAccount = await prisma.enterpriseFinancialAccount.findFirst({
    where: { organizationId, accountType: "CASH", currencyCode: fixture.currencyCode, status: "ACTIVE", archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!cashAccount) throw new Error(`Shop 2 E2E requires an active CASH account in ${fixture.currencyCode}`);
  fixture.cashAccountId = cashAccount.id;
}

async function signIn(page) {
  await page.goto("/auth/sign-in");
  await page.locator('input[type="email"], input[name="email"]').first().fill(adminEmail);
  await page.locator('input[type="password"], input[name="password"]').first().fill(adminPassword);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/sign-in"), { timeout: 30_000 });
}

async function apiJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function ensureOpenTill(page) {
  const dashboard = await apiJson(await page.context().request.get(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`));
  expect(dashboard.response.ok(), JSON.stringify(dashboard.body)).toBeTruthy();
  if (dashboard.body?.cashSession?.status === "OPEN") return dashboard.body.cashSession;
  const opened = await apiJson(await page.context().request.post(`/api/enterprise/${organizationId}/retail/cash-sessions`, {
    data: { financialAccountId: fixture.cashAccountId, openingAmount: 100 },
  }));
  expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();
  const refreshed = await apiJson(await page.context().request.get(`/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`));
  expect(refreshed.body?.cashSession?.status).toBe("OPEN");
  return refreshed.body.cashSession;
}

async function getJournalEntry(entryId) {
  return prisma.enterpriseJournalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
}

test.describe.serial("Shop 2.0 Retail behavioral acceptance", () => {
  test.beforeAll(async () => {
    await prepareRetailFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("POS sale, accounting, idempotency, reversal and last-stock concurrency", async ({ page }) => {
    await signIn(page);
    await ensureOpenTill(page);

    const search = await apiJson(await page.context().request.get(`/api/enterprise/${organizationId}/retail/products/search?q=${encodeURIComponent(fixture.catalogItemId)}&warehouseId=${encodeURIComponent(fixture.warehouseId)}&page=1&pageSize=30`));
    expect(search.response.ok(), JSON.stringify(search.body)).toBeTruthy();
    const product = (search.body?.items || []).find((item) => item.id === fixture.catalogItemId);
    expect(product, "Seeded inventory product must be discoverable through the POS server search").toBeTruthy();
    expect(product.inventoryItemId).toBe(fixture.inventoryItemId);

    const idempotencyKey = `shop2-e2e-sale-${Date.now()}`;
    const salePayload = {
      warehouseId: fixture.warehouseId,
      siteId: null,
      storageLocationId: null,
      currencyCode: fixture.currencyCode,
      idempotencyKey,
      overrideReason: "Shop 2.0 E2E tax posting proof",
      lines: [{
        catalogItemId: fixture.catalogItemId,
        inventoryItemId: fixture.inventoryItemId,
        quantity: 1,
        unitPrice: fixture.unitPrice,
        discountAmount: 0,
        taxAmount: 1,
      }],
      tenders: [{
        methodType: "CASH",
        financialAccountId: fixture.cashAccountId,
        amount: fixture.unitPrice + 1,
        reference: "SHOP2-E2E",
      }],
    };

    const beforeBalance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, stockLotId: null },
    });

    const created = await apiJson(await page.context().request.post(`/api/enterprise/${organizationId}/retail/sales`, { data: salePayload }));
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    expect(created.body?.sale?.id).toBeTruthy();
    expect(created.body?.accounting?.saleJournalEntryId).toBeTruthy();
    expect(created.body?.accounting?.inventoryPostings?.length).toBeGreaterThan(0);

    const saleId = created.body.sale.id;
    const saleEntry = await getJournalEntry(created.body.accounting.saleJournalEntryId);
    expect(saleEntry).toBeTruthy();
    expectBalanced(saleEntry, "Retail POS sale");
    expect(saleEntry.lines.some((line) => asNumber(line.creditBase) > 0 && line.description.includes("Retail revenue"))).toBeTruthy();
    expect(saleEntry.lines.some((line) => asNumber(line.creditBase) > 0 && line.description.includes("Retail output tax"))).toBeTruthy();

    for (const inventoryPosting of created.body.accounting.inventoryPostings) {
      const inventoryEntry = await getJournalEntry(inventoryPosting.journalEntryId);
      expect(inventoryEntry).toBeTruthy();
      expectBalanced(inventoryEntry, "Retail inventory issue");
    }

    const afterSaleBalance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, stockLotId: null },
    });
    expect(asNumber(afterSaleBalance.quantityOnHand)).toBeCloseTo(asNumber(beforeBalance.quantityOnHand) - 1, 5);

    const retry = await apiJson(await page.context().request.post(`/api/enterprise/${organizationId}/retail/sales`, { data: salePayload }));
    expect(retry.response.status(), JSON.stringify(retry.body)).toBe(200);
    expect(retry.body?.sale?.id).toBe(saleId);
    expect(retry.body?.idempotent).toBe(true);
    expect(await prisma.enterpriseRetailSale.count({ where: { organizationId, idempotencyKey } })).toBe(1);
    expect(await prisma.enterpriseJournalEntry.count({ where: { organizationId, sourceModule: "RETAIL_POS", sourceEntityType: "EnterpriseRetailSale", sourceEntityId: saleId } })).toBe(1);

    const reversed = await apiJson(await page.context().request.post(`/api/enterprise/${organizationId}/retail/sales/${saleId}/reverse`, {
      data: { revision: created.body.sale.revision, reason: "Shop 2.0 E2E full reversal" },
    }));
    expect(reversed.response.ok(), JSON.stringify(reversed.body)).toBeTruthy();
    expect(reversed.body?.sale?.status).toBe("REVERSED");
    const reversalEntry = await getJournalEntry(reversed.body.accounting.reversalJournalEntryId);
    expect(reversalEntry).toBeTruthy();
    expectBalanced(reversalEntry, "Retail POS reversal");
    for (const inventoryPosting of reversed.body.accounting.inventoryReturnPostings || []) {
      const returnEntry = await getJournalEntry(inventoryPosting.journalEntryId);
      expect(returnEntry).toBeTruthy();
      expectBalanced(returnEntry, "Retail inventory return");
    }

    const afterReverseBalance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, stockLotId: null },
    });
    expect(asNumber(afterReverseBalance.quantityOnHand)).toBeCloseTo(asNumber(beforeBalance.quantityOnHand), 5);
    expect(await prisma.enterpriseStockMovement.count({ where: { organizationId, sourceEntityType: "EnterpriseRetailSale", sourceEntityId: saleId, movementType: "SALE_FULFILLMENT", direction: "OUT" } })).toBe(1);
    expect(await prisma.enterpriseStockMovement.count({ where: { organizationId, sourceEntityType: "EnterpriseRetailSale", sourceEntityId: saleId, movementType: "RETURN_IN", direction: "IN" } })).toBe(1);

    const balanceForRace = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, stockLotId: null },
    });
    await prisma.enterpriseInventoryBalance.update({
      where: { id: balanceForRace.id },
      data: { quantityOnHand: new Prisma.Decimal(1), quantityReserved: new Prisma.Decimal(0) },
    });

    const raceBase = {
      ...salePayload,
      overrideReason: null,
      lines: [{ ...salePayload.lines[0], taxAmount: 0 }],
      tenders: [{ ...salePayload.tenders[0], amount: fixture.unitPrice }],
    };
    const raceKeys = [`shop2-race-a-${Date.now()}`, `shop2-race-b-${Date.now()}`];
    const raceResponses = await Promise.all(raceKeys.map((raceKey) => page.context().request.post(`/api/enterprise/${organizationId}/retail/sales`, { data: { ...raceBase, idempotencyKey: raceKey } })));
    const successfulRaceResponses = raceResponses.filter((response) => response.ok());
    expect(successfulRaceResponses.length, "Exactly one concurrent sale may consume the last stock unit").toBe(1);
    expect(await prisma.enterpriseRetailSale.count({ where: { organizationId, idempotencyKey: { in: raceKeys } } })).toBe(1);
    const afterRaceBalance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({ where: { id: balanceForRace.id } });
    expect(asNumber(afterRaceBalance.quantityOnHand)).toBeCloseTo(0, 5);

    const invalidTenantReference = await page.context().request.post(`/api/enterprise/${organizationId}/retail/sales`, {
      data: { ...raceBase, warehouseId: `other-tenant-warehouse-${Date.now()}`, idempotencyKey: `shop2-cross-tenant-${Date.now()}` },
    });
    expect(invalidTenantReference.ok()).toBeFalsy();
    expect([403, 409]).toContain(invalidTenantReference.status());

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/enterprise-modules/RETAIL_POS");
    await expect(page.locator("body")).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasHorizontalOverflow, "Retail POS must not overflow horizontally at 390px").toBe(false);
  });
});
