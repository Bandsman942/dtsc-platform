import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const staffEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const staffPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";

const fixture = {
  userId: "",
  currencyCode: "",
  warehouseId: "",
  catalogItemId: "",
  catalogItemCode: "",
  inventoryItemId: "",
  cashAccountId: "",
  unitPrice: 10,
};

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
}

function expectBalanced(entry, label) {
  const debit = entry.lines.reduce((sum, line) => sum + asNumber(line.debit), 0);
  const credit = entry.lines.reduce((sum, line) => sum + asNumber(line.credit), 0);
  expect(Math.abs(debit - credit), `${label}: debits and credits must balance`).toBeLessThan(0.00001);
  expect(debit, `${label}: journal entry must contain value`).toBeGreaterThan(0);
  expect(asNumber(entry.totalDebit), `${label}: entry total debit`).toBeCloseTo(debit, 5);
  expect(asNumber(entry.totalCredit), `${label}: entry total credit`).toBeCloseTo(credit, 5);
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
        data: {
          remainingQuantity: new Prisma.Decimal(50),
          quantity: new Prisma.Decimal(50),
          unitCost: new Prisma.Decimal(5),
          totalCost: new Prisma.Decimal(250),
          currencyCode,
        },
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
  if (!organization || organization.sectorCode !== "COMMERCE_RETAIL") {
    throw new Error(`Shop 2 E2E requires canonical COMMERCE_RETAIL organization ${organizationId}`);
  }

  const finance = await prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!finance?.functionalCurrencyCode || finance.readinessStatus !== "READY") {
    throw new Error("Shop 2 E2E requires READY Finance configuration with functional currency");
  }
  fixture.currencyCode = finance.functionalCurrencyCode;

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
  if (!journalTypes.has("SALES") || !journalTypes.has("INVENTORY")) {
    throw new Error("Shop 2 E2E requires active SALES and INVENTORY journals");
  }

  const now = new Date();
  const period = await prisma.enterpriseFiscalPeriod.findFirst({
    where: {
      organizationId,
      startDate: { lte: now },
      endDate: { gte: now },
      status: { in: ["OPEN", "SOFT_CLOSED"] },
    },
  });
  if (!period) throw new Error("Shop 2 E2E requires an open or soft-closed fiscal period");

  await prisma.enterpriseRetailConfiguration.upsert({
    where: { organizationId },
    update: {
      profileCode: "RETAIL_CORE",
      baseCurrencyCode: fixture.currencyCode,
      status: "ACTIVE",
      updatedByUserId: user.id,
      revision: { increment: 1 },
    },
    create: {
      organizationId,
      profileCode: "RETAIL_CORE",
      baseCurrencyCode: fixture.currencyCode,
      status: "ACTIVE",
      createdByUserId: user.id,
    },
  });

  const warehouse = await prisma.enterpriseWarehouse.findFirst({
    where: { organizationId, code: "SHOP2-E2E-WH", status: "ACTIVE", archivedAt: null },
  });
  if (!warehouse) throw new Error("Shop 2 E2E requires seeded Shop warehouse");
  fixture.warehouseId = warehouse.id;

  const catalogItem = await prisma.enterpriseCatalogItem.findFirst({
    where: { organizationId, code: "SHOP2-E2E-SKU", status: "ACTIVE", archivedAt: null },
  });
  if (!catalogItem) throw new Error("Shop 2 E2E requires seeded Shop catalog item");
  fixture.catalogItemId = catalogItem.id;
  fixture.catalogItemCode = catalogItem.code;

  const inventoryItem = await prisma.enterpriseInventoryItem.findFirst({
    where: { organizationId, catalogItemId: catalogItem.id, status: "ACTIVE", archivedAt: null },
  });
  if (!inventoryItem) throw new Error("Shop 2 E2E requires seeded Shop inventory item");
  fixture.inventoryItemId = inventoryItem.id;

  await prisma.enterpriseCatalogItem.update({
    where: { id: catalogItem.id },
    data: {
      status: "ACTIVE",
      trackInventory: true,
      currency: fixture.currencyCode,
      indicativeSalePrice: new Prisma.Decimal(fixture.unitPrice),
    },
  });

  const balance = await prisma.enterpriseInventoryBalance.findFirst({
    where: {
      organizationId,
      inventoryItemId: inventoryItem.id,
      warehouseId: warehouse.id,
      storageLocationId: null,
      stockLotId: null,
    },
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
  await ensureInventoryCostLayer({
    inventoryItemId: inventoryItem.id,
    warehouseId: warehouse.id,
    currencyCode: fixture.currencyCode,
    userId: user.id,
  });

  const cashAccount = await prisma.enterpriseFinancialAccount.findFirst({
    where: {
      organizationId,
      code: "SHOP2-E2E-CASH",
      accountType: "CASH",
      currencyCode: fixture.currencyCode,
      status: "ACTIVE",
      archivedAt: null,
    },
  });
  if (!cashAccount) throw new Error(`Shop 2 E2E requires seeded CASH account in ${fixture.currencyCode}`);
  fixture.cashAccountId = cashAccount.id;
}

async function signIn(page, email = adminEmail, password = adminPassword) {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email,
      password,
      organizationId,
      next: "/enterprise-modules/RETAIL_POS",
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Direct Shop 2 E2E sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  await page.goto("/enterprise-modules/RETAIL_POS");
  await page.waitForURL((url) => url.pathname.includes("/enterprise-modules/RETAIL_POS"), { timeout: 30_000 });
}

async function apiJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function apiGet(page, path) {
  return apiJson(await page.context().request.get(path));
}

async function apiPost(page, path, data) {
  return apiJson(await page.context().request.post(path, {
    data,
    headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
  }));
}

async function ensureOpenTill(page) {
  const dashboard = await apiGet(page, `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`);
  expect(dashboard.response.ok(), JSON.stringify(dashboard.body)).toBeTruthy();
  if (dashboard.body?.cashSession?.status === "OPEN") return dashboard.body.cashSession;

  const opened = await apiPost(page, `/api/enterprise/${organizationId}/retail/cash-sessions`, {
    financialAccountId: fixture.cashAccountId,
    openingAmount: 100,
  });
  expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();

  const refreshed = await apiGet(page, `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`);
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

    const search = await apiGet(
      page,
      `/api/enterprise/${organizationId}/retail/products/search?q=${encodeURIComponent(fixture.catalogItemCode)}&warehouseId=${encodeURIComponent(fixture.warehouseId)}&page=1&pageSize=30`,
    );
    expect(search.response.ok(), JSON.stringify(search.body)).toBeTruthy();
    const product = (search.body?.items || []).find((item) => item.id === fixture.catalogItemId);
    expect(product, "Seeded inventory product must be discoverable through the POS server search by code").toBeTruthy();
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
      where: {
        organizationId,
        inventoryItemId: fixture.inventoryItemId,
        warehouseId: fixture.warehouseId,
        storageLocationId: null,
        stockLotId: null,
      },
    });

    const created = await apiPost(page, `/api/enterprise/${organizationId}/retail/sales`, salePayload);
    expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
    expect(created.body?.sale?.id).toBeTruthy();
    expect(created.body?.accounting?.saleJournalEntryId).toBeTruthy();
    expect(created.body?.accounting?.inventoryPostings?.length).toBeGreaterThan(0);

    const saleId = created.body.sale.id;
    const saleEntry = await getJournalEntry(created.body.accounting.saleJournalEntryId);
    expect(saleEntry).toBeTruthy();
    expectBalanced(saleEntry, "Retail POS sale");
    expect(saleEntry.lines.some((line) => asNumber(line.credit) > 0 && (line.description || "").includes("Retail revenue"))).toBeTruthy();
    expect(saleEntry.lines.some((line) => asNumber(line.credit) > 0 && (line.description || "").includes("Retail output tax"))).toBeTruthy();

    for (const inventoryPosting of created.body.accounting.inventoryPostings) {
      const inventoryEntry = await getJournalEntry(inventoryPosting.journalEntryId);
      expect(inventoryEntry).toBeTruthy();
      expectBalanced(inventoryEntry, "Retail inventory issue");
    }

    const afterSaleBalance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: {
        organizationId,
        inventoryItemId: fixture.inventoryItemId,
        warehouseId: fixture.warehouseId,
        storageLocationId: null,
        stockLotId: null,
      },
    });
    expect(asNumber(afterSaleBalance.quantityOnHand)).toBeCloseTo(asNumber(beforeBalance.quantityOnHand) - 1, 5);

    const retry = await apiPost(page, `/api/enterprise/${organizationId}/retail/sales`, salePayload);
    expect(retry.response.status(), JSON.stringify(retry.body)).toBe(200);
    expect(retry.body?.sale?.id).toBe(saleId);
    expect(retry.body?.idempotent).toBe(true);
    expect(await prisma.enterpriseRetailSale.count({ where: { organizationId, idempotencyKey } })).toBe(1);
    expect(await prisma.enterpriseJournalEntry.count({
      where: {
        organizationId,
        sourceModule: "RETAIL_POS",
        sourceEntityType: "EnterpriseRetailSale",
        sourceEntityId: saleId,
      },
    })).toBe(1);

    const reversed = await apiPost(page, `/api/enterprise/${organizationId}/retail/sales/${saleId}/reverse`, {
      revision: created.body.sale.revision,
      reason: "Shop 2.0 E2E full reversal",
    });
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
      where: {
        organizationId,
        inventoryItemId: fixture.inventoryItemId,
        warehouseId: fixture.warehouseId,
        storageLocationId: null,
        stockLotId: null,
      },
    });
    expect(asNumber(afterReverseBalance.quantityOnHand)).toBeCloseTo(asNumber(beforeBalance.quantityOnHand), 5);

    expect(await prisma.enterpriseStockMovement.count({
      where: {
        organizationId,
        sourceEntityType: "EnterpriseRetailSale",
        sourceEntityId: saleId,
        movementType: "SALE_FULFILLMENT",
        direction: "OUT",
      },
    })).toBe(1);
    expect(await prisma.enterpriseStockMovement.count({
      where: {
        organizationId,
        sourceEntityType: "EnterpriseRetailSale",
        sourceEntityId: saleId,
        movementType: "RETURN_IN",
        direction: "IN",
      },
    })).toBe(1);

    const balanceForRace = await prisma.enterpriseInventoryBalance.findFirstOrThrow({
      where: {
        organizationId,
        inventoryItemId: fixture.inventoryItemId,
        warehouseId: fixture.warehouseId,
        storageLocationId: null,
        stockLotId: null,
      },
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
    const raceResponses = await Promise.all(raceKeys.map((raceKey) => apiPost(
      page,
      `/api/enterprise/${organizationId}/retail/sales`,
      { ...raceBase, idempotencyKey: raceKey },
    )));
    const successfulRaceResponses = raceResponses.filter(({ response }) => response.ok());
    expect(successfulRaceResponses.length, "Exactly one concurrent sale may consume the last stock unit").toBe(1);
    expect(await prisma.enterpriseRetailSale.count({ where: { organizationId, idempotencyKey: { in: raceKeys } } })).toBe(1);

    const afterRaceBalance = await prisma.enterpriseInventoryBalance.findFirstOrThrow({ where: { id: balanceForRace.id } });
    expect(asNumber(afterRaceBalance.quantityOnHand)).toBeCloseTo(0, 5);

    const invalidTenantReference = await apiPost(page, `/api/enterprise/${organizationId}/retail/sales`, {
      ...raceBase,
      warehouseId: `other-tenant-warehouse-${Date.now()}`,
      idempotencyKey: `shop2-cross-tenant-${Date.now()}`,
    });
    expect(invalidTenantReference.response.ok()).toBeFalsy();
    expect([403, 409]).toContain(invalidTenantReference.response.status());

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/enterprise-modules/RETAIL_POS");
    await expect(page).toHaveURL(/\/enterprise-modules\/RETAIL_POS/);
    await expect(page.locator("body")).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasHorizontalOverflow, "Retail POS must not overflow horizontally at 390px").toBe(false);
  });

  test("#1042 Finance invoice checkout stays an unpaid stock promise and cancels idempotently", async ({ page }) => {
    // The live two-step checkout remains OFF. Exercise it only in GitHub's
    // disposable PostgreSQL tenant, never against a live organization's data.
    if (process.env.CI !== "true" || !/\/dtsc_shop2_behavioral(?:\?|$)/.test(process.env.DATABASE_URL || "")) {
      throw new Error("RETAIL_1042_CHECKOUT_E2E_REQUIRES_EPHEMERAL_CI_DATABASE");
    }
    const config = await prisma.enterpriseRetailConfiguration.findUniqueOrThrow({ where: { organizationId } });
    const originalSettings = config.settingsJson;
    const settings = originalSettings && typeof originalSettings === "object" && !Array.isArray(originalSettings)
      ? { ...originalSettings } : {};
    let invoiceId = null;
    try {
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { settingsJson: { ...settings, invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: false }, revision: { increment: 1 } },
      });
      await signIn(page);
      const site = await prisma.enterpriseWarehouse.findUniqueOrThrow({ where: { id: fixture.warehouseId }, select: { siteId: true } });
      // A dedicated SKU prevents this checkout scenario from resetting or
      // borrowing the balances used by concurrently running Shop 2 tests.
      const baseCatalog = await prisma.enterpriseCatalogItem.findUniqueOrThrow({ where: { id: fixture.catalogItemId } });
      const invoiceCatalog = await prisma.enterpriseCatalogItem.upsert({
        where: { organizationId_code: { organizationId, code: "SHOP2-E2E-INVOICE-SKU" } },
        update: { status: "ACTIVE", archivedAt: null, currency: fixture.currencyCode,
          trackInventory: true, taxable: false, indicativeSalePrice: 10 },
        create: {
          organizationId, code: "SHOP2-E2E-INVOICE-SKU", sku: "SHOP2-E2E-INVOICE-SKU",
          name: "Invoice checkout isolated QA article", normalizedName: "invoice checkout isolated qa article",
          itemType: "PRODUCT", unitOfMeasureId: baseCatalog.unitOfMeasureId,
          indicativeSalePrice: 10, indicativeCost: 4, currency: fixture.currencyCode,
          status: "ACTIVE", taxable: false, trackInventory: true, createdByUserId: fixture.userId,
        },
      });
      const invoiceInventory = await prisma.enterpriseInventoryItem.upsert({
        where: { organizationId_catalogItemId: { organizationId, catalogItemId: invoiceCatalog.id } },
        update: { status: "ACTIVE", allowNegativeStock: false, archivedAt: null },
        create: { organizationId, catalogItemId: invoiceCatalog.id, status: "ACTIVE",
          allowNegativeStock: false, createdByUserId: fixture.userId },
      });
      const previousStock = await prisma.enterpriseInventoryBalance.findFirst({
        where: { organizationId, inventoryItemId: invoiceInventory.id, warehouseId: fixture.warehouseId,
          storageLocationId: null, stockLotId: null },
      });
      const originalStock = previousStock
        ? await prisma.enterpriseInventoryBalance.update({ where: { id: previousStock.id },
          data: { quantityOnHand: new Prisma.Decimal(10), quantityReserved: new Prisma.Decimal(0) } })
        : await prisma.enterpriseInventoryBalance.create({ data: {
          organizationId, inventoryItemId: invoiceInventory.id, warehouseId: fixture.warehouseId,
          quantityOnHand: new Prisma.Decimal(10), quantityReserved: new Prisma.Decimal(0),
        } });
      const payload = {
        idempotencyKey: `retail-1042-browser-${Date.now()}`,
        siteId: site.siteId, warehouseId: fixture.warehouseId,
        currencyCode: fixture.currencyCode,
        lines: [{ catalogItemId: invoiceCatalog.id, quantity: 1 }],
      };
      const created = await apiPost(page, `/api/enterprise/${organizationId}/retail/invoices`, payload);
      expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
      invoiceId = created.body.invoice.id;
      expect(created.body.invoice.status).toBe("DRAFT");
      expect(created.body.checkout.siteId).toBe(site.siteId);
      expect(created.body.checkout.stockPostedAt).toBeNull();

      const replay = await apiPost(page, `/api/enterprise/${organizationId}/retail/invoices`, payload);
      expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
      expect(replay.body.idempotent).toBe(true);
      expect(replay.body.invoice.id).toBe(invoiceId);
      const collision = await apiPost(page, `/api/enterprise/${organizationId}/retail/invoices`, {
        ...payload, lines: [{ ...payload.lines[0], quantity: 2 }],
      });
      expect(collision.response.status()).toBe(409);
      expect(collision.body.error).toBe("RETAIL_INVOICE_IDEMPOTENCY_COLLISION");
      const afterDraftStock = await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: originalStock.id } });
      expect(afterDraftStock.quantityOnHand.equals(originalStock.quantityOnHand), "Draft may reserve but must not debit physical stock").toBe(true);
      expect(await prisma.enterpriseStockMovement.count({
        where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId },
      })).toBe(0);

      const cancel = await apiPost(page, `/api/enterprise/${organizationId}/retail/invoices/${invoiceId}/transition`, {
        action: "CANCEL", revision: created.body.invoice.revision, reason: "Annulation de la facture de recette",
      });
      expect(cancel.response.ok(), JSON.stringify(cancel.body)).toBe(true);
      expect(cancel.body.invoice.status).toBe("CANCELLED");
      const afterCancel = await prisma.enterpriseRetailInvoiceCheckout.findFirstOrThrow({ where: { organizationId, salesInvoiceId: invoiceId } });
      expect(afterCancel.stockPostedAt).toBeNull();
      expect(await prisma.enterpriseStockMovement.count({
        where: { organizationId, sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: invoiceId },
      })).toBe(0);
    } finally {
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { settingsJson: originalSettings === null ? Prisma.DbNull : originalSettings, revision: { increment: 1 } },
      });
    }
  });
  test("#1042 two-store authenticated invoice isolation and immediate revocation", async ({ page, browser }) => {
    if (process.env.CI !== "true" || !/\/dtsc_shop2_behavioral(?:\?|$)/.test(process.env.DATABASE_URL || "")) {
      throw new Error("RETAIL_1042_MULTISTORE_E2E_REQUIRES_EPHEMERAL_CI_DATABASE");
    }
    const staff = await prisma.user.findUniqueOrThrow({ where: { email: staffEmail } });
    const config = await prisma.enterpriseRetailConfiguration.findUniqueOrThrow({ where: { organizationId } });
    const originalSettings = config.settingsJson;
    const existingMembership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: staff.id } },
    });
    let ownerContext;
    try {
      const secondarySite = await prisma.enterpriseSite.upsert({
        where: { organizationId_code: { organizationId, code: "SHOP2-E2E-SITE-B" } },
        update: { name: "Shop 2 E2E Store B", status: "ACTIVE", archivedAt: null },
        create: { organizationId, code: "SHOP2-E2E-SITE-B", name: "Shop 2 E2E Store B",
          siteType: "STORE", countryCode: "US", timezone: "UTC", status: "ACTIVE", createdByUserId: fixture.userId },
      });
      const secondaryWarehouse = await prisma.enterpriseWarehouse.upsert({
        where: { organizationId_code: { organizationId, code: "SHOP2-E2E-WH-B" } },
        update: { siteId: secondarySite.id, status: "ACTIVE", archivedAt: null },
        create: { organizationId, siteId: secondarySite.id, code: "SHOP2-E2E-WH-B", name: "Shop 2 E2E Warehouse B",
          warehouseType: "STORE", status: "ACTIVE", createdByUserId: fixture.userId },
      });
      const position = await prisma.enterprisePosition.upsert({
        where: { organizationId_positionCode: { organizationId, positionCode: "SHOP2-E2E-INVOICER" } },
        update: { permissionsJson: ["enterprise.retail.pos.view", "enterprise.retail.pos.create", "enterprise.sites.view", "enterprise.sites.create", "enterprise.sites.update", "enterprise.inventory.view", "enterprise.inventory.create", "enterprise.inventory.update", "enterprise.inventory.manage"], isActive: true },
        create: { organizationId, positionCode: "SHOP2-E2E-INVOICER",
          labelFr: "Facturier de recette B", labelEn: "B test invoicer",
          permissionsJson: ["enterprise.retail.pos.view", "enterprise.retail.pos.create", "enterprise.sites.view", "enterprise.sites.create", "enterprise.sites.update", "enterprise.inventory.view", "enterprise.inventory.create", "enterprise.inventory.update", "enterprise.inventory.manage"], isActive: true },
      });
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: staff.id } },
        update: { role: "MANAGER", status: "ACTIVE", removedAt: null,
          positionId: position.id, positionCode: position.positionCode },
        create: { organizationId, userId: staff.id, role: "MANAGER", status: "ACTIVE",
          positionId: position.id, positionCode: position.positionCode, joinedAt: new Date() },
      });
      const assignmentKey = { organizationId, siteId: secondarySite.id, userId: staff.id };
      await prisma.enterpriseRetailSiteAssignment.upsert({
        where: { organizationId_siteId_userId: assignmentKey },
        update: { roleCode: "MANAGER", permissionsJson: ["VIEW_SALES", "PREPARE_INVOICE", "VIEW_STOCK", "MANAGE_STOCK"], isActive: true },
        create: { ...assignmentKey, roleCode: "MANAGER", permissionsJson: ["VIEW_SALES", "PREPARE_INVOICE", "VIEW_STOCK", "MANAGE_STOCK"],
          isActive: true, createdByUserId: fixture.userId },
      });
      const product = await prisma.enterpriseCatalogItem.findFirstOrThrow({
        where: { organizationId, code: "SHOP2-E2E-INVOICE-SKU" },
      });
      const inventory = await prisma.enterpriseInventoryItem.findFirstOrThrow({
        where: { organizationId, catalogItemId: product.id },
      });
      const balance = await prisma.enterpriseInventoryBalance.findFirst({
        where: { organizationId, warehouseId: secondaryWarehouse.id, inventoryItemId: inventory.id,
          storageLocationId: null, stockLotId: null },
      });
      if (balance) {
        await prisma.enterpriseInventoryBalance.update({
          where: { id: balance.id }, data: { quantityOnHand: new Prisma.Decimal(10), quantityReserved: new Prisma.Decimal(0) },
        });
      } else {
        await prisma.enterpriseInventoryBalance.create({ data: {
          organizationId, warehouseId: secondaryWarehouse.id, inventoryItemId: inventory.id,
          quantityOnHand: new Prisma.Decimal(10), quantityReserved: new Prisma.Decimal(0),
        } });
      }
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { settingsJson: {
          ...(originalSettings && typeof originalSettings === "object" && !Array.isArray(originalSettings) ? originalSettings : {}),
          invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: true,
        }, revision: { increment: 1 } },
      });
      ownerContext = await browser.newContext({ baseURL: baseUrl });
      const ownerPage = await ownerContext.newPage();
      await signIn(ownerPage);
      const primarySite = await prisma.enterpriseWarehouse.findUniqueOrThrow({
        where: { id: fixture.warehouseId }, select: { siteId: true },
      });
      const primaryPayload = {
        idempotencyKey: "shop2-e2e-a-" + Date.now(), siteId: primarySite.siteId,
        warehouseId: fixture.warehouseId, currencyCode: fixture.currencyCode,
        lines: [{ catalogItemId: product.id, quantity: 1 }],
      };
      const endpoint = "/api/enterprise/" + organizationId + "/retail/invoices";
      const primaryInvoice = await apiPost(ownerPage, endpoint, primaryPayload);
      expect(primaryInvoice.response.status(), JSON.stringify(primaryInvoice.body)).toBe(201);

      await signIn(page, staffEmail, staffPassword);
      const scoped = await apiGet(page, endpoint);
      expect(scoped.response.status(), JSON.stringify(scoped.body)).toBe(200);
      expect(scoped.body.items.every((row) => row.siteId === secondarySite.id)).toBe(true);
      expect(scoped.body.items.some((row) => row.invoice.id === primaryInvoice.body.invoice.id)).toBe(false);
      const forbiddenFilteredList = await apiGet(page, endpoint + "?siteId=" + primarySite.siteId);
      expect(forbiddenFilteredList.response.status()).toBe(403);
      const forbiddenPaymentRead = await apiGet(page, endpoint + "/" + primaryInvoice.body.invoice.id + "/payments");
      expect(forbiddenPaymentRead.response.status()).toBe(403);
      const forbiddenReturnRead = await apiGet(page, endpoint + "/" + primaryInvoice.body.invoice.id + "/returns");
      expect(forbiddenReturnRead.response.status()).toBe(403);
      const forbiddenPrint = await page.context().request.get(
        endpoint + "/" + primaryInvoice.body.invoice.id + "/print?paper=a4&lang=fr",
      );
      expect(forbiddenPrint.status()).toBe(404);
      const forbiddenCreate = await apiPost(page, endpoint, {
        ...primaryPayload, idempotencyKey: "shop2-e2e-forbidden-" + Date.now(),
      });
      expect(forbiddenCreate.response.status()).toBe(403);
      expect(forbiddenCreate.body.error).toBe("RETAIL_SITE_ACCESS_DENIED");

      // A staff member deliberately has the common Sites/Inventory module
      // permissions here. Their store assignment still restricts legacy
      // endpoints, including aggregate counts and mutation routes.
      const siteList = await apiGet(page, `/api/enterprise/${organizationId}/sites`);
      expect(siteList.response.status(), JSON.stringify(siteList.body)).toBe(200);
      expect(siteList.body.items.map((item) => item.id)).toEqual([secondarySite.id]);
      expect(siteList.body.metrics.active).toBe(1);
      expect(siteList.body.canManage).toBe(false);
      const forbiddenSiteCreate = await apiPost(page, `/api/enterprise/${organizationId}/sites`, {
        name: "Forbidden extra shop", siteType: "STORE",
      });
      expect(forbiddenSiteCreate.response.status(), JSON.stringify(forbiddenSiteCreate.body)).toBe(403);
      const primarySiteRecord = await prisma.enterpriseSite.findUniqueOrThrow({ where: { id: primarySite.siteId } });
      const forbiddenSiteEdit = await apiJson(await page.context().request.patch(
        `/api/enterprise/${organizationId}/sites`, {
          data: { siteId: primarySite.siteId, revision: primarySiteRecord.revision, name: "Forbidden shop edit" },
          headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
        },
      ));
      expect(forbiddenSiteEdit.response.status(), JSON.stringify(forbiddenSiteEdit.body)).toBe(403);

      const warehouseList = await apiGet(page, `/api/enterprise/${organizationId}/warehouses`);
      expect(warehouseList.response.status(), JSON.stringify(warehouseList.body)).toBe(200);
      expect(warehouseList.body.items.every((item) => item.siteId === secondarySite.id)).toBe(true);
      expect(warehouseList.body.items.some((item) => item.id === fixture.warehouseId)).toBe(false);
      const sourceWarehouse = await prisma.enterpriseWarehouse.findUniqueOrThrow({ where: { id: fixture.warehouseId } });

      const forbiddenWarehouseCreate = await apiPost(page, `/api/enterprise/${organizationId}/warehouses`, {
        siteId: primarySite.siteId, name: "Forbidden cross-store depot",
      });
      expect(forbiddenWarehouseCreate.response.status(), JSON.stringify(forbiddenWarehouseCreate.body)).toBe(403);
      const forbiddenWarehouseEdit = await apiJson(await page.context().request.patch(
        `/api/enterprise/${organizationId}/warehouses`, {
          data: { warehouseId: fixture.warehouseId, revision: sourceWarehouse.revision, name: "Forbidden cross-store edit" },
          headers: { origin: baseUrl, referer: `${baseUrl}/enterprise-modules/RETAIL_POS` },
        },
      ));
      expect(forbiddenWarehouseEdit.response.status(), JSON.stringify(forbiddenWarehouseEdit.body)).toBe(403);
      const forbiddenLocationCreate = await apiPost(page, `/api/enterprise/${organizationId}/storage-locations`, {
        warehouseId: fixture.warehouseId, name: "Forbidden cross-store shelf",
      });
      expect(forbiddenLocationCreate.response.status(), JSON.stringify(forbiddenLocationCreate.body)).toBe(403);

      const forbiddenStockCreate = await apiPost(page, `/api/enterprise/${organizationId}/stock-movements`, {
        inventoryItemId: inventory.id, warehouseId: fixture.warehouseId,
        movementType: "OPENING_BALANCE", direction: "IN", quantity: 1,
        idempotencyKey: `shop2-1042-forbidden-opening-${Date.now()}`,
      });
      expect(forbiddenStockCreate.response.status(), JSON.stringify(forbiddenStockCreate.body)).toBe(403);
      const forbiddenTransfer = await apiPost(page, `/api/enterprise/${organizationId}/stock-transfers`, {
        sourceWarehouseId: fixture.warehouseId, destinationWarehouseId: secondaryWarehouse.id,
        approverUserId: fixture.userId, lines: [{ inventoryItemId: inventory.id, quantity: 1 }],
      });
      expect(forbiddenTransfer.response.status(), JSON.stringify(forbiddenTransfer.body)).toBe(403);

      const forbiddenAdjustment = await apiPost(page, `/api/enterprise/${organizationId}/stock-adjustments`, {
        inventoryItemId: inventory.id, warehouseId: fixture.warehouseId,
        adjustmentType: "OUT", quantity: 1, reason: "Forbidden cross-store correction",
        approverUserId: fixture.userId,
      });
      expect(forbiddenAdjustment.response.status(), JSON.stringify(forbiddenAdjustment.body)).toBe(403);
      const forbiddenCount = await apiPost(page, `/api/enterprise/${organizationId}/inventory-counts`, {
        warehouseId: fixture.warehouseId, countType: "SPOT", approverUserId: fixture.userId,
        lines: [{ inventoryItemId: inventory.id, countedQuantity: 1 }],
      });
      expect(forbiddenCount.response.status(), JSON.stringify(forbiddenCount.body)).toBe(403);

      // Decision endpoints are independently checked: an authorized ERP
      // manager B must not approve corrections or counts belonging to A.
      const crossStoreAdjustment = await prisma.enterpriseStockAdjustment.create({ data: {
        organizationId, reference: `SHOP2-E2E-ADJUST-${Date.now()}`,
        inventoryItemId: inventory.id, warehouseId: fixture.warehouseId,
        adjustmentType: "OUT", quantity: new Prisma.Decimal(1), reason: "Cross-store decision guard",
        status: "PENDING_APPROVAL", requestedByUserId: fixture.userId,
      } });
      const crossStoreCount = await prisma.enterpriseInventoryCount.create({ data: {
        organizationId, reference: `SHOP2-E2E-COUNT-${Date.now()}`,
        warehouseId: fixture.warehouseId, status: "SUBMITTED", requestedByUserId: fixture.userId,
      } });
      try {
        const deniedAdjustmentDecision = await apiPost(page,
          `/api/enterprise/${organizationId}/stock-adjustments/${crossStoreAdjustment.id}/decision`,
          { decision: "APPROVE", revision: crossStoreAdjustment.revision });
        expect(deniedAdjustmentDecision.response.status(), JSON.stringify(deniedAdjustmentDecision.body)).toBe(403);
        const deniedCountDecision = await apiPost(page,
          `/api/enterprise/${organizationId}/inventory-counts/${crossStoreCount.id}/decision`,
          { decision: "APPROVE", revision: crossStoreCount.revision });
        expect(deniedCountDecision.response.status(), JSON.stringify(deniedCountDecision.body)).toBe(403);
      } finally {
        await prisma.enterpriseStockAdjustment.delete({ where: { id: crossStoreAdjustment.id } });
        await prisma.enterpriseInventoryCount.delete({ where: { id: crossStoreCount.id } });
      }

      const ownerSiteList = await apiGet(ownerPage, `/api/enterprise/${organizationId}/sites`);
      expect(ownerSiteList.response.status()).toBe(200);
      expect(ownerSiteList.body.items.some((item) => item.id === primarySite.siteId)).toBe(true);
      expect(ownerSiteList.body.items.some((item) => item.id === secondarySite.id)).toBe(true);

      const secondaryPayload = {
        ...primaryPayload, idempotencyKey: "shop2-e2e-b-" + Date.now(),
        siteId: secondarySite.id, warehouseId: secondaryWarehouse.id,
      };
      const secondaryInvoice = await apiPost(page, endpoint, secondaryPayload);
      expect(secondaryInvoice.response.status(), JSON.stringify(secondaryInvoice.body)).toBe(201);
      const secondaryPrint = await page.context().request.get(
        endpoint + "/" + secondaryInvoice.body.invoice.id + "/print?paper=a4&lang=fr");
      expect(secondaryPrint.status()).toBe(200);
      const secondaryHtml = await secondaryPrint.text();
      expect(secondaryHtml).toContain(secondarySite.name);
      expect(secondaryHtml).toContain("BROUILLON");
      const thermalPrint = await page.context().request.get(
        endpoint + "/" + secondaryInvoice.body.invoice.id + "/print?paper=thermal&lang=en");
      expect(thermalPrint.status()).toBe(200);
      const thermalHtml = await thermalPrint.text();
      expect(thermalHtml).toContain(secondarySite.name);
      expect(thermalHtml).toContain("DRAFT");
      expect(thermalHtml).toContain("80mm auto");
      const afterInvoice = await apiGet(page, endpoint);
      expect(afterInvoice.response.ok()).toBe(true);
      expect(afterInvoice.body.items.some((row) => row.invoice.id === secondaryInvoice.body.invoice.id)).toBe(true);
      expect(afterInvoice.body.items.some((row) => row.invoice.id === primaryInvoice.body.invoice.id)).toBe(false);
      const ownerList = await apiGet(ownerPage, endpoint);
      expect(ownerList.response.ok()).toBe(true);
      expect(ownerList.body.items.some((row) => row.invoice.id === primaryInvoice.body.invoice.id)).toBe(true);
      expect(ownerList.body.items.some((row) => row.invoice.id === secondaryInvoice.body.invoice.id)).toBe(true);

      await prisma.enterpriseRetailSiteAssignment.update({
        where: { organizationId_siteId_userId: assignmentKey },
        data: { isActive: false, revision: { increment: 1 } },
      });
      const revokedList = await apiGet(page, endpoint);
      expect(revokedList.response.status(), JSON.stringify(revokedList.body)).toBe(403);
      const revokedReplay = await apiPost(page, endpoint, secondaryPayload);
      expect(revokedReplay.response.status(), "Revoked staff must not replay an earlier valid invoice key").toBe(403);
      const revokedCreate = await apiPost(page, endpoint, {
        ...primaryPayload, idempotencyKey: "shop2-e2e-revoked-" + Date.now(),
        siteId: secondarySite.id, warehouseId: secondaryWarehouse.id,
      });
      expect(revokedCreate.response.status()).toBe(403);
    } finally {
      await ownerContext?.close();
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { settingsJson: originalSettings === null ? Prisma.DbNull : originalSettings, revision: { increment: 1 } },
      });
      if (existingMembership) {
        await prisma.organizationMember.update({
          where: { id: existingMembership.id },
          data: { role: existingMembership.role, status: existingMembership.status,
            removedAt: existingMembership.removedAt, positionId: existingMembership.positionId,
            positionCode: existingMembership.positionCode },
        });
      }
    }
  });

  test("#1042 concurrent last-unit invoice promises serialize and cancellation releases capacity", async ({ page }) => {
    if (process.env.CI !== "true" || !/\/dtsc_shop2_behavioral(?:\?|$)/.test(process.env.DATABASE_URL || "")) {
      throw new Error("RETAIL_1042_LAST_UNIT_E2E_REQUIRES_EPHEMERAL_CI_DATABASE");
    }
    const config = await prisma.enterpriseRetailConfiguration.findUniqueOrThrow({ where: { organizationId } });
    const originalSettings = config.settingsJson;
    try {
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { settingsJson: {
          ...(originalSettings && typeof originalSettings === "object" && !Array.isArray(originalSettings) ? originalSettings : {}),
          invoiceCheckoutEnabled: true, siteStaffIsolationEnabled: false,
        }, revision: { increment: 1 } },
      });
      await signIn(page);
      const baseCatalog = await prisma.enterpriseCatalogItem.findUniqueOrThrow({ where: { id: fixture.catalogItemId } });
      const catalog = await prisma.enterpriseCatalogItem.upsert({
        where: { organizationId_code: { organizationId, code: "SHOP2-E2E-LAST-UNIT" } },
        update: { status: "ACTIVE", archivedAt: null, currency: fixture.currencyCode,
          trackInventory: true, taxable: false, indicativeSalePrice: 10 },
        create: { organizationId, code: "SHOP2-E2E-LAST-UNIT", sku: "SHOP2-E2E-LAST-UNIT",
          name: "Shop 2 isolated last unit", normalizedName: "shop 2 isolated last unit",
          itemType: "PRODUCT", unitOfMeasureId: baseCatalog.unitOfMeasureId,
          indicativeSalePrice: 10, indicativeCost: 4, currency: fixture.currencyCode,
          status: "ACTIVE", taxable: false, trackInventory: true, createdByUserId: fixture.userId },
      });
      const inventory = await prisma.enterpriseInventoryItem.upsert({
        where: { organizationId_catalogItemId: { organizationId, catalogItemId: catalog.id } },
        update: { status: "ACTIVE", archivedAt: null, allowNegativeStock: false },
        create: { organizationId, catalogItemId: catalog.id, status: "ACTIVE",
          allowNegativeStock: false, createdByUserId: fixture.userId },
      });
      const existingBalance = await prisma.enterpriseInventoryBalance.findFirst({
        where: { organizationId, warehouseId: fixture.warehouseId, inventoryItemId: inventory.id,
          storageLocationId: null, stockLotId: null },
      });
      const balance = existingBalance
        ? await prisma.enterpriseInventoryBalance.update({ where: { id: existingBalance.id },
          data: { quantityOnHand: new Prisma.Decimal(1), quantityReserved: new Prisma.Decimal(0) } })
        : await prisma.enterpriseInventoryBalance.create({ data: {
          organizationId, warehouseId: fixture.warehouseId, inventoryItemId: inventory.id,
          quantityOnHand: new Prisma.Decimal(1), quantityReserved: new Prisma.Decimal(0),
        } });
      const site = await prisma.enterpriseWarehouse.findUniqueOrThrow({
        where: { id: fixture.warehouseId }, select: { siteId: true },
      });
      const payload = (key) => ({
        idempotencyKey: key, siteId: site.siteId, warehouseId: fixture.warehouseId,
        currencyCode: fixture.currencyCode, lines: [{ catalogItemId: catalog.id, quantity: 1 }],
      });
      const first = payload(`retail-1042-last-unit-a-${Date.now()}`);
      const second = payload(`retail-1042-last-unit-b-${Date.now()}`);
      const endpoint = `/api/enterprise/${organizationId}/retail/invoices`;
      const results = await Promise.all([apiPost(page, endpoint, first), apiPost(page, endpoint, second)]);
      expect(results.map((result) => result.response.status()).sort((a, b) => a - b)).toEqual([201, 409]);
      const accepted = results.find((result) => result.response.status() === 201);
      const rejected = results.find((result) => result.response.status() === 409);
      expect(rejected.body.error).toBe("NEGATIVE_STOCK_FORBIDDEN");
      const afterHolds = await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
      expect(afterHolds.quantityOnHand.equals(1)).toBe(true);
      expect(await prisma.enterpriseStockMovement.count({ where: { organizationId,
        sourceEntityType: "EnterpriseSalesInvoice", sourceEntityId: accepted.body.invoice.id } })).toBe(0);
      const cancelled = await apiPost(page, endpoint + "/" + accepted.body.invoice.id + "/transition", {
        action: "CANCEL", revision: accepted.body.invoice.revision, reason: "Libération test de promesse concurrente",
      });
      expect(cancelled.response.status(), JSON.stringify(cancelled.body)).toBe(200);
      expect(cancelled.body.invoice.status).toBe("CANCELLED");
      const nowAvailable = await apiPost(page, endpoint, results[0] === rejected ? first : second);
      expect(nowAvailable.response.status(), JSON.stringify(nowAvailable.body)).toBe(201);
      const afterRetry = await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
      expect(afterRetry.quantityOnHand.equals(1), "A stock promise never reduces physical stock before payment").toBe(true);
    } finally {
      await prisma.enterpriseRetailConfiguration.update({
        where: { organizationId },
        data: { settingsJson: originalSettings === null ? Prisma.DbNull : originalSettings, revision: { increment: 1 } },
      });
    }
  });

});
