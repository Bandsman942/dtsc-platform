import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const organizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";

const fixture = {
  userId: "",
  currencyCode: "USD",
  siteId: "",
  warehouseId: "",
  secondSiteId: "",
  secondWarehouseId: "",
  catalogItemId: "",
  inventoryItemId: "",
  customerId: "",
  cashAccountId: "",
  foreignWarehouseId: "",
};

function asNumber(value) {
  return Number(value?.toString?.() ?? value ?? 0);
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

let authenticatedCookies = null;
async function signIn(page) {
  if (authenticatedCookies) {
    await page.context().addCookies(authenticatedCookies);
  } else {
  const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in`, {
    data: {
      email: adminEmail,
      password: adminPassword,
      organizationId,
      next: "/enterprise-modules/RETAIL_POS",
    },
    headers: { origin: baseUrl, referer: `${baseUrl}/auth/sign-in` },
  });
  const body = await response.json().catch(() => null);
  expect(response.ok(), `Direct Shop 2 E2E sign-in failed: ${JSON.stringify(body)}`).toBeTruthy();
  authenticatedCookies = await page.context().cookies();
  }
  await page.goto("/enterprise-modules/RETAIL_POS");
  await page.waitForURL((url) => url.pathname.includes("/enterprise-modules/RETAIL_POS"), { timeout: 30_000 });
}

async function prepareGlobalFixture() {
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error(`Global Shop 2 E2E requires ${adminEmail}`);
  fixture.userId = user.id;

  const finance = await prisma.enterpriseFinanceConfiguration.findUnique({ where: { organizationId } });
  if (!finance?.functionalCurrencyCode) throw new Error("Global Shop 2 E2E requires Finance functional currency");
  fixture.currencyCode = finance.functionalCurrencyCode;

  await prisma.enterpriseRetailPromotion.updateMany({ where: { organizationId }, data: { status: "INACTIVE" } });
  await prisma.enterpriseRetailPriceCondition.updateMany({ where: { organizationId }, data: { isActive: false } });

  await prisma.enterpriseModule.upsert({
    where: { organizationId_moduleCode: { organizationId, moduleCode: "SALES_QUOTES_ORDERS" } },
    update: { isEnabled: true },
    create: {
      organizationId,
      moduleCode: "SALES_QUOTES_ORDERS",
      labelFr: "Commandes clients E2E",
      labelEn: "E2E customer orders",
      moduleCategory: "SHOP2_E2E",
      isEnabled: true,
      isCore: false,
      requiresPlanLevel: "BUSINESS",
      sortOrder: 930,
    },
  });

  const site = await prisma.enterpriseSite.findFirst({ where: { organizationId, code: "SHOP2-E2E-SITE", status: "ACTIVE", archivedAt: null } });
  const warehouse = await prisma.enterpriseWarehouse.findFirst({ where: { organizationId, code: "SHOP2-E2E-WH", status: "ACTIVE", archivedAt: null } });
  if (!site || !warehouse) throw new Error("Global Shop 2 E2E requires first store/warehouse");
  fixture.siteId = site.id;
  fixture.warehouseId = warehouse.id;
  await prisma.enterpriseSite.update({ where: { id: site.id }, data: { countryCode: "CD" } });

  const secondSite = await prisma.enterpriseSite.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-SITE-2" } },
    update: { name: "Shop 2 E2E Store 2", siteType: "STORE", countryCode: "CD", timezone: "Africa/Kinshasa", status: "ACTIVE", archivedAt: null },
    create: { organizationId, code: "SHOP2-E2E-SITE-2", name: "Shop 2 E2E Store 2", siteType: "STORE", countryCode: "CD", timezone: "Africa/Kinshasa", status: "ACTIVE", createdByUserId: user.id },
  });
  const secondWarehouse = await prisma.enterpriseWarehouse.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-E2E-WH-2" } },
    update: { siteId: secondSite.id, name: "Shop 2 E2E Warehouse 2", warehouseType: "STORE", status: "ACTIVE", archivedAt: null },
    create: { organizationId, siteId: secondSite.id, code: "SHOP2-E2E-WH-2", name: "Shop 2 E2E Warehouse 2", warehouseType: "STORE", status: "ACTIVE", createdByUserId: user.id },
  });
  fixture.secondSiteId = secondSite.id;
  fixture.secondWarehouseId = secondWarehouse.id;

  const product = await prisma.enterpriseCatalogItem.findFirst({ where: { organizationId, code: "SHOP2-COMMERCIAL-SKU", status: "ACTIVE", archivedAt: null } });
  if (!product) throw new Error("Global Shop 2 E2E requires commercial SKU");
  fixture.catalogItemId = product.id;
  const inventoryItem = await prisma.enterpriseInventoryItem.findFirst({ where: { organizationId, catalogItemId: product.id, status: "ACTIVE", archivedAt: null } });
  if (!inventoryItem) throw new Error("Global Shop 2 E2E requires commercial Inventory item");
  fixture.inventoryItemId = inventoryItem.id;

  const secondBalance = await prisma.enterpriseInventoryBalance.findFirst({
    where: { organizationId, inventoryItemId: inventoryItem.id, warehouseId: secondWarehouse.id, storageLocationId: null, stockLotId: null },
  });
  if (secondBalance) {
    await prisma.enterpriseInventoryBalance.update({ where: { id: secondBalance.id }, data: { quantityOnHand: new Prisma.Decimal(3), quantityReserved: new Prisma.Decimal(0) } });
  } else {
    await prisma.enterpriseInventoryBalance.create({ data: { organizationId, inventoryItemId: inventoryItem.id, warehouseId: secondWarehouse.id, quantityOnHand: new Prisma.Decimal(3), quantityReserved: new Prisma.Decimal(0) } });
  }

  const customer = await prisma.enterpriseBusinessParty.upsert({
    where: { organizationId_code: { organizationId, code: "SHOP2-GLOBAL-CUSTOMER" } },
    update: { legalName: "Client Omnicanal E2E", displayName: "Client Omnicanal E2E", normalizedName: "client omnicanal e2e", status: "ACTIVE", archivedAt: null },
    create: { organizationId, partyType: "PERSON", legalName: "Client Omnicanal E2E", displayName: "Client Omnicanal E2E", normalizedName: "client omnicanal e2e", code: "SHOP2-GLOBAL-CUSTOMER", status: "ACTIVE", createdByUserId: user.id, roles: { create: { roleCode: "CUSTOMER", status: "ACTIVE", createdByUserId: user.id } } },
  });
  fixture.customerId = customer.id;

  const cash = await prisma.enterpriseFinancialAccount.findFirst({ where: { organizationId, code: "SHOP2-E2E-CASH", accountType: "CASH", currencyCode: fixture.currencyCode, status: "ACTIVE", archivedAt: null } });
  if (!cash) throw new Error("Global Shop 2 E2E requires cash account");
  fixture.cashAccountId = cash.id;

  const foreignOrganization = await prisma.organization.upsert({
    where: { id: "shop2-e2e-foreign-org" },
    update: { name: "Foreign Retail E2E", slug: "shop2-e2e-foreign", organizationType: "CLIENT", status: "ACTIVE", sectorCode: "COMMERCE_RETAIL", deletedAt: null },
    create: { id: "shop2-e2e-foreign-org", name: "Foreign Retail E2E", slug: "shop2-e2e-foreign", organizationType: "CLIENT", status: "ACTIVE", sectorCode: "COMMERCE_RETAIL", timezone: "Africa/Kinshasa", createdByDtscUserId: user.id },
  });
  const foreignSite = await prisma.enterpriseSite.upsert({
    where: { organizationId_code: { organizationId: foreignOrganization.id, code: "FOREIGN-SITE" } },
    update: { name: "Foreign Store", siteType: "STORE", countryCode: "CD", timezone: "Africa/Kinshasa", status: "ACTIVE", archivedAt: null },
    create: { organizationId: foreignOrganization.id, code: "FOREIGN-SITE", name: "Foreign Store", siteType: "STORE", countryCode: "CD", timezone: "Africa/Kinshasa", status: "ACTIVE", createdByUserId: user.id },
  });
  const foreignWarehouse = await prisma.enterpriseWarehouse.upsert({
    where: { organizationId_code: { organizationId: foreignOrganization.id, code: "FOREIGN-WH" } },
    update: { siteId: foreignSite.id, name: "Foreign Warehouse", warehouseType: "STORE", status: "ACTIVE", archivedAt: null },
    create: { organizationId: foreignOrganization.id, siteId: foreignSite.id, code: "FOREIGN-WH", name: "Foreign Warehouse", warehouseType: "STORE", status: "ACTIVE", createdByUserId: user.id },
  });
  fixture.foreignWarehouseId = foreignWarehouse.id;
}

async function ensureOpenTill(page) {
  const dashboard = await apiGet(page, `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`);
  expect(dashboard.response.ok(), JSON.stringify(dashboard.body)).toBeTruthy();
  if (dashboard.body?.cashSession?.status === "OPEN") return dashboard.body.cashSession;
  const opened = await apiPost(page, `/api/enterprise/${organizationId}/retail/cash-sessions`, { financialAccountId: fixture.cashAccountId, openingAmount: 100 });
  expect(opened.response.ok(), JSON.stringify(opened.body)).toBeTruthy();
  const refreshed = await apiGet(page, `/api/enterprise/${organizationId}/retail/dashboard?moduleCode=RETAIL_POS`);
  expect(refreshed.body?.cashSession?.status).toBe("OPEN");
  return refreshed.body.cashSession;
}

function buildOmnichannelPayload(overrides = {}) {
  return {
    idempotencyKey: `shop2-global-${crypto.randomUUID()}`,
    customerBusinessPartyId: fixture.customerId,
    sourceSiteId: fixture.siteId,
    fulfillmentWarehouseId: fixture.warehouseId,
    pickupSiteId: fixture.siteId,
    fulfillmentMode: "CLICK_COLLECT",
    currencyCode: fixture.currencyCode,
    expectedFulfillmentAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    reservationExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }],
    ...overrides,
  };
}

test.describe.serial("Shop 2.0 Iteration 4 global behavioral acceptance", () => {
  test.beforeAll(async () => {
    await prepareGlobalFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("offline replay, country readiness, multi-store reservation and omnichannel fulfillment", async ({ page }) => {
    await signIn(page);
    await ensureOpenTill(page);

    const pack = await apiPost(page, `/api/enterprise/${organizationId}/retail/country-packs`, {
      packCode: "CD_RETAIL_CORE_V1",
      countryCode: "CD",
      configuration: { currencyCode: fixture.currencyCode },
    });
    expect(pack.response.status(), JSON.stringify(pack.body)).toBe(200);
    expect(pack.body?.activation?.status).toBe("ACTIVE_CORE");

    const onboarding = await apiPost(page, `/api/enterprise/${organizationId}/retail/onboarding`, {
      countryCode: "CD",
      currencyCode: fixture.currencyCode,
      siteId: fixture.siteId,
      warehouseId: fixture.warehouseId,
      cashFinancialAccountId: fixture.cashAccountId,
    });
    expect(onboarding.response.ok(), JSON.stringify(onboarding.body)).toBeTruthy();
    expect(onboarding.body?.readiness?.items?.find((item) => item.code === "COUNTRY_PACK")?.complete).toBe(true);
    expect(onboarding.body?.readiness?.items?.find((item) => item.code === "SITE")?.complete).toBe(true);
    expect(onboarding.body?.readiness?.items?.find((item) => item.code === "WAREHOUSE")?.complete).toBe(true);

    const snapshot = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/snapshot`, {
      siteId: fixture.siteId,
      warehouseId: fixture.warehouseId,
      currencyCode: fixture.currencyCode,
      maxItems: 100,
    });
    expect(snapshot.response.status(), JSON.stringify(snapshot.body)).toBe(201);
    expect(snapshot.body?.policy?.saleEnabled).toBe(true);
    expect(JSON.stringify(snapshot.body)).not.toContain("primaryEmail");
    expect(JSON.stringify(snapshot.body)).not.toContain("primaryPhone");
    expect(JSON.stringify(snapshot.body)).not.toContain("credentialReference");
    const offlineItem = snapshot.body?.catalog?.items?.find((item) => item.catalogItemId === fixture.catalogItemId);
    expect(offlineItem?.offlineEligible).toBe(true);
    expect(offlineItem?.taxIncluded).toBe(true);
    expect(asNumber(offlineItem?.serviceUnitPrice)).toBeCloseTo(100, 4);
    expect(asNumber(offlineItem?.unitTaxAmount)).toBeCloseTo(16, 4);
    expect(asNumber(offlineItem?.unitLineTotal)).toBeCloseTo(116, 4);

    const beforeOffline = await prisma.enterpriseInventoryBalance.findFirstOrThrow({ where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, storageLocationId: null, stockLotId: null } });
    const operationUuid = crypto.randomUUID();
    const offlinePayload = {
      warehouseId: fixture.warehouseId,
      siteId: fixture.siteId,
      storageLocationId: null,
      customerBusinessPartyId: null,
      currencyCode: fixture.currencyCode,
      soldAt: new Date().toISOString(),
      idempotencyKey: `offline-local:${operationUuid}`,
      couponCode: null,
      customerSegmentCode: null,
      channelCode: "POS",
      overrideReason: null,
      lines: [{
        catalogItemId: fixture.catalogItemId,
        inventoryItemId: fixture.inventoryItemId,
        quantity: 1,
        unitPrice: asNumber(offlineItem.serviceUnitPrice),
        discountAmount: asNumber(offlineItem.serviceUnitDiscountAmount || 0),
        taxAmount: asNumber(offlineItem.unitTaxAmount),
      }],
      tenders: [{ methodType: "CASH", financialAccountId: fixture.cashAccountId, amount: asNumber(offlineItem.unitLineTotal), reference: null }],
    };
    const syncBody = { operationUuid, snapshotVersion: snapshot.body.version, siteId: fixture.siteId, warehouseId: fixture.warehouseId, payload: offlinePayload };
    const synced = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/sync`, syncBody);
    expect(synced.response.status(), JSON.stringify(synced.body)).toBe(200);
    expect(synced.body?.operation?.status).toBe("SYNCED");
    expect(synced.body?.sale?.id).toBeTruthy();
    const afterOffline = await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: beforeOffline.id } });
    expect(asNumber(beforeOffline.quantityOnHand) - asNumber(afterOffline.quantityOnHand)).toBeCloseTo(1, 5);

    const retried = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/sync`, syncBody);
    expect(retried.response.status(), JSON.stringify(retried.body)).toBe(200);
    expect(retried.body?.operation?.serverEntityId).toBe(synced.body?.operation?.serverEntityId);
    const afterRetry = await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: beforeOffline.id } });
    expect(asNumber(afterRetry.quantityOnHand)).toBeCloseTo(asNumber(afterOffline.quantityOnHand), 5);

    const mismatch = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/sync`, { ...syncBody, payload: { ...offlinePayload, tenders: [{ ...offlinePayload.tenders[0], amount: 117 }] } });
    expect(mismatch.response.status()).toBe(409);

    const rejectedTender = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/sync`, {
      ...syncBody,
      operationUuid: crypto.randomUUID(),
      payload: { ...offlinePayload, idempotencyKey: `offline-card-local:${crypto.randomUUID()}`, tenders: [{ methodType: "CARD", financialAccountId: fixture.cashAccountId, amount: asNumber(offlineItem.unitLineTotal), reference: null }] },
    });
    expect(rejectedTender.response.status(), JSON.stringify(rejectedTender.body)).toBe(422);
    expect(rejectedTender.body?.operation?.conflictCode).toBe("OFFLINE_TENDER_NOT_ALLOWED");

    const expired = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/sync`, {
      ...syncBody,
      operationUuid: crypto.randomUUID(),
      payload: { ...offlinePayload, idempotencyKey: `offline-expired-local:${crypto.randomUUID()}`, soldAt: new Date(new Date(snapshot.body.validUntil).getTime() + 1000).toISOString() },
    });
    expect(expired.response.status(), JSON.stringify(expired.body)).toBe(409);
    expect(expired.body?.operation?.conflictCode).toBe("OFFLINE_SNAPSHOT_EXPIRED");

    const foreignWarehouse = await apiPost(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, buildOmnichannelPayload({ fulfillmentWarehouseId: fixture.foreignWarehouseId }));
    expect(foreignWarehouse.response.status()).toBe(409);

    const clickPayload = buildOmnichannelPayload({ idempotencyKey: `click-${crypto.randomUUID()}` });
    const clickCollect = await apiPost(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, clickPayload);
    expect(clickCollect.response.status(), JSON.stringify(clickCollect.body)).toBe(201);
    expect(clickCollect.body?.order?.status).toBe("CONFIRMED");
    expect(clickCollect.body?.orchestration?.status).toBe("RESERVED");
    expect(clickCollect.body?.reservations?.length).toBe(1);
    const clickOrderId = clickCollect.body.order.id;
    const canonicalOrder = await prisma.enterpriseSalesOrder.findFirst({ where: { id: clickOrderId, organizationId }, include: { items: true } });
    expect(canonicalOrder).toBeTruthy();

    const clickDuplicate = await apiPost(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, clickPayload);
    expect(clickDuplicate.response.status(), JSON.stringify(clickDuplicate.body)).toBe(200);
    expect(clickDuplicate.body?.order?.id).toBe(clickOrderId);

    const otherStore = await apiPost(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, buildOmnichannelPayload({
      idempotencyKey: `other-store-${crypto.randomUUID()}`,
      fulfillmentMode: "PICKUP_OTHER_STORE",
      fulfillmentWarehouseId: fixture.secondWarehouseId,
      pickupSiteId: fixture.secondSiteId,
      lines: [{ catalogItemId: fixture.catalogItemId, quantity: 1 }],
    }));
    expect(otherStore.response.status(), JSON.stringify(otherStore.body)).toBe(201);
    expect(otherStore.body?.orchestration?.fulfillmentWarehouseId).toBe(fixture.secondWarehouseId);
    expect(otherStore.body?.orchestration?.pickupSiteId).toBe(fixture.secondSiteId);

    const concurrentPayloadA = buildOmnichannelPayload({ idempotencyKey: `concurrent-a-${crypto.randomUUID()}`, fulfillmentMode: "SHIP_FROM_STORE", fulfillmentWarehouseId: fixture.secondWarehouseId, pickupSiteId: null, lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }] });
    const concurrentPayloadB = buildOmnichannelPayload({ idempotencyKey: `concurrent-b-${crypto.randomUUID()}`, fulfillmentMode: "CUSTOMER_DELIVERY", fulfillmentWarehouseId: fixture.secondWarehouseId, pickupSiteId: null, lines: [{ catalogItemId: fixture.catalogItemId, quantity: 2 }] });
    const [concurrentA, concurrentB] = await Promise.all([
      apiPost(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, concurrentPayloadA),
      apiPost(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders`, concurrentPayloadB),
    ]);
    const statuses = [concurrentA.response.status(), concurrentB.response.status()].sort((a, b) => a - b);
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);

    const orderBeforeFulfillment = await prisma.enterpriseSalesOrder.findFirstOrThrow({ where: { id: clickOrderId, organizationId }, include: { items: true } });
    const reservationBefore = await prisma.enterpriseInventoryReservation.findFirstOrThrow({ where: { organizationId, salesOrderId: clickOrderId, status: "ACTIVE" } });
    const stockBeforeFulfillment = await prisma.enterpriseInventoryBalance.findFirstOrThrow({ where: { organizationId, inventoryItemId: fixture.inventoryItemId, warehouseId: fixture.warehouseId, storageLocationId: null, stockLotId: null } });
    const fulfillment = await apiPost(page, `/api/enterprise/${organizationId}/sales-orders/${clickOrderId}/fulfill`, {
      fulfillmentType: "PRODUCT_DELIVERY",
      warehouseId: fixture.warehouseId,
      acceptedByCustomer: true,
      idempotencyKey: `fulfill-${crypto.randomUUID()}`,
      revision: orderBeforeFulfillment.revision,
      items: orderBeforeFulfillment.items.map((item) => ({ salesOrderItemId: item.id, quantityFulfilled: asNumber(item.quantityOrdered) })),
    });
    expect(fulfillment.response.status(), JSON.stringify(fulfillment.body)).toBe(201);
    expect(fulfillment.body?.fulfillment?.status).toBe("COMPLETED");

    const [orderAfter, reservationAfter, stockAfterFulfillment, contextAfter] = await Promise.all([
      prisma.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: clickOrderId } }),
      prisma.enterpriseInventoryReservation.findUniqueOrThrow({ where: { id: reservationBefore.id } }),
      prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: stockBeforeFulfillment.id } }),
      prisma.enterpriseRetailOrderOrchestration.findFirstOrThrow({ where: { organizationId, salesOrderId: clickOrderId } }),
    ]);
    expect(orderAfter.status).toBe("FULFILLED");
    expect(reservationAfter.status).toBe("FULFILLED");
    expect(asNumber(reservationAfter.fulfilledQuantity)).toBeCloseTo(asNumber(reservationAfter.quantity), 5);
    expect(asNumber(stockBeforeFulfillment.quantityOnHand) - asNumber(stockAfterFulfillment.quantityOnHand)).toBeCloseTo(asNumber(reservationBefore.quantity), 5);
    expect(contextAfter.status).toBe("FULFILLED");

    const crossChannel = await apiGet(page, `/api/enterprise/${organizationId}/retail/omnichannel/orders?page=1&pageSize=50`);
    expect(crossChannel.response.ok(), JSON.stringify(crossChannel.body)).toBeTruthy();
    const fulfilledRow = crossChannel.body?.items?.find((row) => row.order?.id === clickOrderId);
    expect(fulfilledRow?.order?.fulfillments?.[0]?.status).toBe("COMPLETED");
  });

  test("Retail five-lot filters, equipment exports and public navigation hover", async ({ browser }) => {
    const authenticated = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await authenticated.newPage();
    try {
      await signIn(page);
      const base = `/api/enterprise/${organizationId}/retail`;
      for (const endpoint of [
        "devices?page=1&pageSize=12&search=SHOP",
        "pricing/conditions?page=1&pageSize=20&from=2026-01-01&to=2026-12-31",
        "promotions?page=1&pageSize=20&from=2026-01-01&to=2026-12-31",
        "returns?page=1&pageSize=20&from=2026-01-01&to=2026-12-31",
        "omnichannel/orders?page=1&pageSize=20&channel=POS",
        "inventory-alerts?page=1&pageSize=20&lowStockPage=1&lowStockPageSize=12",
      ]) {
        const result = await apiGet(page, `${base}/${endpoint}`);
        expect(result.response.ok(), `${endpoint}: ${JSON.stringify(result.body)}`).toBeTruthy();
        expect(result.body).toBeTruthy();
        if (result.body.pagination) {
          expect(result.body.pagination.page).toBe(1);
          expect(result.body.pagination.pageCount).toBeGreaterThanOrEqual(1);
        }
      }
      await page.goto("/enterprise-modules/RETAIL_POS?section=equipment");
      const equipment = page.locator('section[aria-label="Équipements d\'encaissement"]');
      await expect(equipment).toBeVisible();
      await expect(equipment.getByRole("heading", { name: /Équipements du commerce de détail|Retail equipment/i })).toBeVisible();
      await expect(equipment.getByRole("button", { name: /CSV/i })).toBeVisible();
      await expect(equipment.getByRole("button", { name: /XLSX/i })).toBeVisible();
      await expect(equipment.getByRole("button", { name: /PDF/i })).toBeVisible();
    } finally {
      await authenticated.close();
    }

    const publicContext = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 }, hasTouch: false });
    const publicPage = await publicContext.newPage();
    try {
      await publicPage.goto("/");
      const firstGroup = publicPage.locator('button[aria-controls^="public-navigation-group-"]').first();
      await expect(firstGroup).toBeVisible();
      await firstGroup.hover();
      await expect(firstGroup).toHaveAttribute("aria-expanded", "true");
      await expect(publicPage.locator("#public-navigation-group-0 a").first()).toBeVisible();
    } finally {
      await publicContext.close();
    }
  });


  test("pricing conditions keep separate store and channel rules under revision-safe writes", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    const createdRuleIds = [];
    try {
      await signIn(page);
      const price = await prisma.enterpriseCatalogPrice.findFirst({
        where: { organizationId, catalogItemId: fixture.catalogItemId, status: "ACTIVE", archivedAt: null },
        select: { id: true },
      });
      expect(price, "E2E catalogue price required for pricing rules").toBeTruthy();
      const base = `/api/enterprise/${organizationId}/retail/pricing/conditions`;
      const data = { catalogPriceId: price.id, siteId: fixture.siteId, minQuantity: 987654,
        maxQuantity: 987655, priority: 33, isActive: false };
      const counter = await apiPost(page, base, { ...data, channelCode: "POS" });
      expect(counter.response.status(), JSON.stringify(counter.body)).toBe(200);
      createdRuleIds.push(counter.body.condition.id);
      const online = await apiPost(page, base, { ...data, channelCode: "ONLINE" });
      expect(online.response.status(), JSON.stringify(online.body)).toBe(200);
      createdRuleIds.push(online.body.condition.id);
      expect(createdRuleIds[0]).not.toBe(createdRuleIds[1]);

      const edit = await apiPost(page, base, { ...data, id: createdRuleIds[0],
        revision: counter.body.condition.revision, channelCode: "POS", priority: 34 });
      expect(edit.response.status(), JSON.stringify(edit.body)).toBe(200);
      expect(edit.body.condition.revision).toBe(counter.body.condition.revision + 1);
      const second = await prisma.enterpriseRetailPriceCondition.findUniqueOrThrow({ where: { id: createdRuleIds[1] } });
      expect(second.priority).toBe(33);
      expect(second.channelCode).toBe("ONLINE");

      const stale = await apiPost(page, base, { ...data, id: createdRuleIds[0],
        revision: counter.body.condition.revision, channelCode: "POS", priority: 35 });
      expect(stale.response.status(), JSON.stringify(stale.body)).toBe(409);
      const refreshed = await apiGet(page, `${base}?page=1&pageSize=20&active=false`);
      expect(refreshed.response.ok(), JSON.stringify(refreshed.body)).toBeTruthy();
      expect(refreshed.body.pagination.page).toBe(1);
    } finally {
      if (createdRuleIds.length) await prisma.enterpriseRetailPriceCondition.deleteMany({
        where: { organizationId, id: { in: createdRuleIds } },
      });
      await context.close();
    }
  });

  test("HOTFIX #1212 common ERP reserves real FEFO lots and values partial deliveries exactly once", async ({ page }) => {
    await signIn(page);
    const key = "LOT1212-" + crypto.randomUUID().slice(0, 12);
    const baseProduct = await prisma.enterpriseCatalogItem.findUniqueOrThrow({ where: { id: fixture.catalogItemId } });
    const product = await prisma.enterpriseCatalogItem.create({ data: { organizationId, code: key, sku: key, name: "E2E Batch product " + key, normalizedName: ("E2E Batch product " + key).toLowerCase(), itemType: "PRODUCT", unitOfMeasureId: baseProduct.unitOfMeasureId, indicativeSalePrice: 10, indicativeCost: 4, currency: fixture.currencyCode, trackInventory: true, taxable: false, createdByUserId: fixture.userId } });
    const inventory = await prisma.enterpriseInventoryItem.create({ data: { organizationId, catalogItemId: product.id, lotTracking: true, expiryTracking: true, allowNegativeStock: false, createdByUserId: fixture.userId } });
    const date = (offset) => { const value = new Date(Date.now() + offset * 86400000); value.setUTCHours(0, 0, 0, 0); return value; };
    const lots = {};
    for (const [name, amount, days, status] of [["EARLY", 30, 60, "AVAILABLE"], ["LATE", 70, 120, "AVAILABLE"], ["EXPIRED", 100, -10, "AVAILABLE"], ["QUARANTINE", 100, 30, "QUARANTINED"]]) {
      const lot = await prisma.enterpriseStockLot.create({ data: { organizationId, inventoryItemId: inventory.id, warehouseId: fixture.warehouseId, lotNumber: name, expiryDate: date(days), status, createdByUserId: fixture.userId } });
      const balance = await prisma.enterpriseInventoryBalance.create({ data: { organizationId, inventoryItemId: inventory.id, warehouseId: fixture.warehouseId, stockLotId: lot.id, quantityOnHand: amount } });
      const movement = await prisma.enterpriseStockMovement.create({ data: { organizationId, inventoryItemId: inventory.id, warehouseId: fixture.warehouseId, stockLotId: lot.id, movementType: "OPENING_BALANCE", direction: "IN", quantity: amount, balanceAfter: amount, idempotencyKey: key + ":" + name, createdByUserId: fixture.userId } });
      await prisma.enterpriseInventoryCostLayer.create({ data: { organizationId, inventoryItemId: inventory.id, warehouseId: fixture.warehouseId, sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: amount, remainingQuantity: amount, unitCost: 4, totalCost: amount * 4, currencyCode: fixture.currencyCode, effectiveAt: new Date() } });
      lots[name] = { lot, balance };
    }
    async function createOrder(suffix, quantity) {
      return prisma.enterpriseSalesOrder.create({ data: { organizationId, reference: key + "-" + suffix, businessPartyId: fixture.customerId, title: "Batch preparation E2E", status: "CONFIRMED", currency: fixture.currencyCode, subtotalAmount: quantity * 10, totalAmount: quantity * 10, createdByUserId: fixture.userId, items: { create: { catalogItemId: product.id, description: product.name, quantityOrdered: quantity, unitOfMeasureId: product.unitOfMeasureId, unitPrice: 10, lineSubtotal: quantity * 10, lineTotal: quantity * 10 } } }, include: { items: true } });
    }
    const order = await createOrder("A", 50);
    const second = await createOrder("B", 60);
    const endpoint = `/api/enterprise/${organizationId}/sales-orders/${order.id}/fulfill`;
    const available = () => apiGet(page, `/api/enterprise/${organizationId}/retail/inventory/availability?catalogItemId=${product.id}`);
    const before = await available();
    expect(before.response.status(), JSON.stringify(before.body)).toBe(200);
    expect(before.body.totalAvailable).toBe("100");
    const stockList = () => apiGet(page, `/api/enterprise/${organizationId}/inventory?search=${encodeURIComponent(key)}&warehouseId=${fixture.warehouseId}`);
    const initialStock = await stockList();
    expect(initialStock.response.status(),JSON.stringify(initialStock.body)).toBe(200);
    expect(initialStock.body.items).toHaveLength(1);
    expect(initialStock.body.items[0].quantityOnHand).toBe(300);
    expect(initialStock.body.items[0].quantityAvailable).toBe(100);
    expect(initialStock.body.items[0].quantityReserved).toBe(0);
    const request = { action: "RESERVE", salesOrderItemId: order.items[0].id, warehouseId: fixture.warehouseId, quantity: 50, idempotencyKey: key + "-reserve" };
    const reserved = await apiPost(page, endpoint, request);
    expect(reserved.response.status(), JSON.stringify(reserved.body)).toBe(201);
    const reservationId = reserved.body.reservation.id;
    expect(reserved.body.reservation.lotAllocations.map((row) => [row.stockLotId, row.quantity])).toEqual([[lots.EARLY.lot.id, "30"], [lots.LATE.lot.id, "20"]]);
    const replay = await apiPost(page, endpoint, request);
    expect(replay.response.status(), JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.reservation.id).toBe(reservationId);
    const list = await apiGet(page, endpoint);
    expect(list.response.status(), JSON.stringify(list.body)).toBe(200);
    expect(list.body.items[0].allocations.map((row) => row.lotNumber)).toEqual(["EARLY", "LATE"]);
    const denied = await apiPost(page, `/api/enterprise/${organizationId}/sales-orders/${second.id}/fulfill`, { ...request, salesOrderItemId: second.items[0].id, quantity: 60, idempotencyKey: key + "-overbook" });
    expect(denied.response.status(), JSON.stringify(denied.body)).toBe(409);
    expect((await available()).body.totalAvailable).toBe("50");
    const promisedStock=await stockList();
    expect(promisedStock.response.status(),JSON.stringify(promisedStock.body)).toBe(200);
    expect(promisedStock.body.items[0].quantityAvailable).toBe(50);
    expect(promisedStock.body.items[0].orderReservedQuantity).toBe(50);
    expect(asNumber((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: lots.EARLY.balance.id } })).quantityOnHand)).toBe(30);
    const firstDeliveryInput = { fulfillmentType: "PRODUCT_DELIVERY", warehouseId: fixture.warehouseId, acceptedByCustomer: true, idempotencyKey: key + "-delivery1", revision: order.revision, items: [{ salesOrderItemId: order.items[0].id, quantityFulfilled: 40 }] };
    const firstDelivery = await apiPost(page, endpoint, firstDeliveryInput);
    expect(firstDelivery.response.status(), JSON.stringify(firstDelivery.body)).toBe(201);
    const movementWhere = { organizationId, inventoryItemId: inventory.id, sourceEntityType: "EnterpriseFulfillment", sourceEntityId: firstDelivery.body.fulfillment.id };
    const issues = await prisma.enterpriseStockMovement.findMany({ where: movementWhere });
    expect(issues.map((issue) => [issue.stockLotId, asNumber(issue.quantity)]).sort()).toEqual([[lots.EARLY.lot.id, 30], [lots.LATE.lot.id, 10]].sort());
    const valuations = await prisma.enterpriseInventoryAccountingEvent.findMany({ where: { organizationId, stockMovementId: { in: issues.map((issue) => issue.id) }, eventType: "ISSUE" } });
    expect(valuations.length).toBe(2);
    expect(valuations.reduce((sum, valuation) => sum + asNumber(valuation.totalCost), 0)).toBe(160);
    expect(valuations.every((valuation) => Boolean(valuation.journalEntryId))).toBe(true);
    // #1228: the persisted narrative is a business snapshot, not an inventory ID.
    const stockJournals = await prisma.enterpriseJournalEntry.findMany({ where: { organizationId, id: { in: valuations.map(row => row.journalEntryId) } }, include: { lines: true } });
    expect(stockJournals).toHaveLength(2);
    for (const journal of stockJournals) {
      expect(journal.description).toBe(`ISSUE catalog ${product.name} · ${product.code}`);
      expect(journal.lines.every(line => line.description === journal.description)).toBe(true);
    }
    const replayDelivery = await apiPost(page, endpoint, firstDeliveryInput);
    expect(replayDelivery.response.ok(), JSON.stringify(replayDelivery.body)).toBeTruthy();
    expect(replayDelivery.body.fulfillment.id).toBe(firstDelivery.body.fulfillment.id);
    expect(await prisma.enterpriseStockMovement.count({ where: movementWhere })).toBe(2);
    const partial = await prisma.enterpriseInventoryReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(partial.status).toBe("ACTIVE");
    expect(asNumber(partial.fulfilledQuantity)).toBe(40);
    expect(partial.lotAllocations.map((row) => row.fulfilledQuantity)).toEqual(["30", "10"]);
    expect((await available()).body.totalAvailable).toBe("50");
    const current = await prisma.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(current.status).toBe("PARTIALLY_FULFILLED");
    await prisma.enterpriseStockLot.update({ where: { id: lots.LATE.lot.id }, data: { status: "QUARANTINED" } });
    const finalDeliveryInput = { ...firstDeliveryInput, revision: current.revision, idempotencyKey: key + "-delivery2", items: [{ salesOrderItemId: order.items[0].id, quantityFulfilled: 10 }] };
    const blocked = await apiPost(page, endpoint, finalDeliveryInput);
    expect(blocked.response.status(), JSON.stringify(blocked.body)).toBe(409);
    expect(asNumber((await prisma.enterpriseInventoryReservation.findUniqueOrThrow({ where: { id: reservationId } })).fulfilledQuantity)).toBe(40);
    expect(await prisma.enterpriseFulfillment.count({ where: { organizationId, salesOrderId: order.id } })).toBe(1);
    await prisma.enterpriseStockLot.update({ where: { id: lots.LATE.lot.id }, data: { status: "AVAILABLE" } });
    const finalDelivery = await apiPost(page, endpoint, finalDeliveryInput);
    expect(finalDelivery.response.status(), JSON.stringify(finalDelivery.body)).toBe(201);
    const completed = await prisma.enterpriseInventoryReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(completed.status).toBe("FULFILLED");
    expect(asNumber(completed.fulfilledQuantity)).toBe(50);
    expect((await prisma.enterpriseSalesOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("FULFILLED");
    expect(asNumber((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: lots.LATE.balance.id } })).quantityOnHand)).toBe(50);
    expect(asNumber((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: lots.EXPIRED.balance.id } })).quantityOnHand)).toBe(100);
    expect(asNumber((await prisma.enterpriseInventoryBalance.findUniqueOrThrow({ where: { id: lots.QUARANTINE.balance.id } })).quantityOnHand)).toBe(100);
    const secondEndpoint = `/api/enterprise/${organizationId}/sales-orders/${second.id}/fulfill`;
    const newReservation = await apiPost(page, secondEndpoint, { ...request, salesOrderItemId: second.items[0].id, quantity: 20, idempotencyKey: key + "-reserveB" });
    expect(newReservation.response.status(), JSON.stringify(newReservation.body)).toBe(201);
    expect((await available()).body.totalAvailable).toBe("30");
    const released = await apiPost(page, secondEndpoint, { action: "RELEASE", reservationId: newReservation.body.reservation.id, reason: "E2E release remaining order promise" });
    expect(released.response.status(), JSON.stringify(released.body)).toBe(200);
    expect((await available()).body.totalAvailable).toBe("50");
    const finalStock=await stockList();
    expect(finalStock.response.status(),JSON.stringify(finalStock.body)).toBe(200);
    expect(finalStock.body.items[0].quantityAvailable).toBe(50);
    expect(finalStock.body.items[0].quantityOnHand).toBe(250);
    await prisma.enterpriseInventoryItem.update({where:{id:inventory.id},data:{minimumQuantity:250}});
    const low=await apiGet(page,`/api/enterprise/${organizationId}/inventory?search=${encodeURIComponent(key)}&warehouseId=${fixture.warehouseId}&lowStock=true&pageSize=5`);
    expect(low.response.status(),JSON.stringify(low.body)).toBe(200);
    expect(low.body.pagination.total).toBe(1);
    expect(low.body.metrics.lowStockCount).toBe(1);
    expect(low.body.items[0].isLowStock).toBe(true);
    expect(low.body.physicalTotals).toHaveLength(1);
    expect(low.body.physicalTotals[0].unitId).toBe(product.unitOfMeasureId);
    expect(Number(low.body.physicalTotals[0].value)).toBe(250);
    expect(low.body.items[0].quantityOnHandExact).toBe("250");
    const beyond=await apiGet(page,`/api/enterprise/${organizationId}/inventory?search=${encodeURIComponent(key)}&warehouseId=${fixture.warehouseId}&lowStock=true&pageSize=5&page=2`);
    expect(beyond.response.status(),JSON.stringify(beyond.body)).toBe(200);
    expect(beyond.body.items).toHaveLength(0);
    expect(beyond.body.pagination.total).toBe(1);
    expect(beyond.body.physicalTotals).toEqual(low.body.physicalTotals);
  });

  test("HOTFIX #1212 first tracked batch is selectable without a stock balance on real FR/EN mobile and desktop", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);
    const key = "UI1212-" + crypto.randomUUID().slice(0, 12);
    const baseProduct = await prisma.enterpriseCatalogItem.findUniqueOrThrow({ where: { id: fixture.catalogItemId } });
    const unit = await prisma.enterpriseUnitOfMeasure.findUniqueOrThrow({ where: { id: baseProduct.unitOfMeasureId } });
    const name = "E2E first tracked batch with an intentionally long catalogue description " + key;
    const product = await prisma.enterpriseCatalogItem.create({
      data: { organizationId, code: key, sku: key, name, normalizedName: name.toLowerCase(),
        itemType: "PRODUCT", unitOfMeasureId: baseProduct.unitOfMeasureId, indicativeSalePrice: 10, indicativeCost: 4,
        currency: fixture.currencyCode, trackInventory: true, taxable: false, createdByUserId: fixture.userId },
    });
    const inventory = await prisma.enterpriseInventoryItem.create({
      data: { organizationId, catalogItemId: product.id, lotTracking: true, expiryTracking: true, allowNegativeStock: false, createdByUserId: fixture.userId },
    });
    const stockScope = { organizationId, inventoryItemId: inventory.id };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: fixture.userId }, select: { locale: true } });
    const expiry = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    try {
      expect(await prisma.enterpriseInventoryBalance.count({ where: stockScope })).toBe(0);
      for (const { locale, theme, widths } of [
        { locale: "fr", theme: "dark", widths: [320, 360, 375, 390, 414] },
        { locale: "en", theme: "light", widths: [1440, 1024, 768, 320] },
      ]) {
        await prisma.user.update({ where: { id: fixture.userId }, data: { locale } });
        await page.setViewportSize({ width: widths[0], height: 844 });
        await page.evaluate(value => localStorage.setItem("theme", value), theme);
        await page.goto("/enterprise-modules/INVENTORY_LOGISTICS");
        await page.waitForURL(/\/enterprise-modules\/INVENTORY_LOGISTICS/);
        await expect(page.locator("html")).toHaveClass(new RegExp("\\b" + theme + "\\b"));
        const stockRegister = page.locator("#inventory-operation-register");
        const registerQuery = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/enterprise/" + organizationId + "/inventory" && url.searchParams.get("search") === key && !url.searchParams.get("view");
        });
        await page.locator("[data-workspace-toolbar]").getByRole("textbox").fill(key);
        const registerResponse=await registerQuery;
        expect(registerResponse.ok()).toBeTruthy();
        const registerBody=await registerResponse.json();
        await expect(stockRegister.getByText(locale === "fr" ? "Aucun stock vendable" : "No sellable stock", { exact: true })).toBeVisible();
        async function downloadRegister(format) {
          const downloaded = page.waitForEvent("download");
          await stockRegister.getByRole("button", { name: format, exact: true }).click();
          const file = await downloaded;
          expect(await file.failure()).toBeNull();
          return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
        }
        const csv = await downloadRegister("CSV");
        expect(csv.name).toMatch(/\.csv$/i);
        const rows = csv.bytes.toString("utf8").trim().split(/\r?\n/);
        // #1228 analytical CSV keeps the same one data row, followed by the
        // complete summary and filters. Verify both sections explicitly.
        expect(rows).toHaveLength(8+registerBody.quantityTotals.length+registerBody.generalQuantityTotals.length);
        expect(rows[0]).toContain(locale === "fr" ? '"Stock vendable"' : '"Sellable stock"');
        expect(rows[1]).toContain(key);
        expect(rows[1]).toContain(locale === "fr" ? '"Aucun stock vendable"' : '"No sellable stock"');
        expect(rows[1]).toMatch(/,"0","0","0"$/);
        expect(rows[2]).toBe(Array(8).fill('""').join(","));
        expect(rows[5].startsWith(locale === "fr" ? '"Enregistrements","1"' : '"Records","1"')).toBe(true);
        const metricLabels=locale==="fr"?{onHand:"Stock physique",reserved:"Réservations et retenues",sellable:"Stock vendable"}:{onHand:"On-hand stock",reserved:"Reservations and holds",sellable:"Sellable stock"};
        for(const row of registerBody.quantityTotals)expect(rows.some(line=>line.startsWith(`"${locale==="fr"?"Sous-total filtré":"Filtered subtotal"} · ${metricLabels[row.metric]} · ${row.unit}","${row.value} ${row.unit}"`))).toBe(true);
        for(const row of registerBody.generalQuantityTotals)expect(rows.some(line=>line.startsWith(`"${locale==="fr"?"Total général autorisé sans filtres":"Authorized general total without filters"} · ${metricLabels[row.metric]} · ${row.unit}","${row.value} ${row.unit}${row.precisionMismatch?(locale==="fr"?" · Précision à vérifier":" · Precision needs review"):""}"`))).toBe(true);
        expect(rows.at(-2).startsWith(`"${locale === "fr" ? "Recherche" : "Search"}","${key}"`)).toBe(true);
        expect(rows.at(-1).startsWith(locale === "fr" ? '"Dépôt","Tous les dépôts autorisés"' : '"Warehouse","All authorized warehouses"')).toBe(true);
        const quantityCards=page.locator("[data-inventory-quantity-totals]").getByRole("region",{name:locale==="fr"?"Quantités filtrées, toutes pages":"Filtered quantities, all pages",exact:true});
        for(const metric of Object.values(metricLabels))await expect(quantityCards.getByText(`${metric} · ${unit.symbol||unit.name}`,{exact:true})).toBeVisible();
        await page.screenshot({path:test.info().outputPath(`1228-stock-${locale}-${theme}-${widths[0]}.png`),fullPage:true});
        if (locale === "en") {
          const xlsx = await downloadRegister("Excel");
          expect(xlsx.name).toMatch(/\.xlsx$/i);
          expect(xlsx.bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
          expect(xlsx.bytes.includes(Buffer.from(key))).toBeTruthy();
          const pdf = await downloadRegister("PDF");
          expect(pdf.name).toMatch(/\.pdf$/i);
          expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
        }
        const warehouseFilter = stockRegister.getByTestId("inventory-register-warehouse");
        const scopedQuery = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/enterprise/" + organizationId + "/inventory" &&
            url.searchParams.get("warehouseId") === fixture.warehouseId && url.searchParams.get("search") === key;
        });
        await warehouseFilter.selectOption(fixture.warehouseId);
        const scopedStock = await scopedQuery;
        expect(scopedStock.ok()).toBeTruthy();
        const scopedBody=await scopedStock.json();
        expect(scopedBody.items).toEqual([]);
        expect(scopedBody.quantityTotals).toEqual([]);
        expect(scopedBody.generalQuantityTotals).toEqual(registerBody.generalQuantityTotals);
        const scopedCsv = await downloadRegister("CSV");
        const scopedRows=scopedCsv.bytes.toString("utf8").trim().split(/\r?\n/);
        expect(scopedRows).toHaveLength(7+scopedBody.generalQuantityTotals.length);
        expect(scopedRows[1]).toBe(Array(8).fill('""').join(","));
        expect(scopedRows[4].startsWith(locale==="fr"?'"Enregistrements","0"':'"Records","0"')).toBe(true);
        expect(scopedRows.some(line=>line.startsWith(locale==="fr"?'"Sous-total filtré':'"Filtered subtotal'))).toBe(false);
        await warehouseFilter.selectOption("");
        const governance = page.getByTestId("inventory-stock-governance");
        await expect(governance.getByRole("heading", { name: locale === "fr" ? "Règles de stock, lots et péremptions" : "Stock rules, batches and expiry", exact: true })).toBeVisible();
        await governance.getByRole("button", { name: locale === "fr" ? "Gérer" : "Manage", exact: true }).click();
        const rulesQuery = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/enterprise/" + organizationId + "/inventory" && url.searchParams.get("search") === key + "-no-match";
        });
        await governance.getByRole("textbox", { name: locale === "fr" ? "Rechercher les articles" : "Search items", exact: true }).fill(key + "-no-match");
        const rules = await rulesQuery;
        expect(rules.ok()).toBeTruthy();
        expect((await rules.json()).items).toEqual([]);
        for (const width of widths) {
          await page.setViewportSize({ width, height: 844 });
          await expect(governance).toBeVisible();
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: "Inventory page overflow at " + width + "px (" + locale + ", " + theme + ")" }).toBeLessThanOrEqual(2);
        }
        await page.setViewportSize({ width: 320, height: 844 });
        await governance.getByRole("button", { name: locale === "fr" ? "Enregistrer un lot" : "Register batch", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: locale === "fr" ? "Enregistrer un lot" : "Register a batch" });
        await expect(dialog).toBeVisible();
        const itemSelect = dialog.locator('select[name="inventoryItemId"]');
        await expect(itemSelect).toBeDisabled();
        await dialog.locator('select[name="warehouseId"]').selectOption(fixture.warehouseId);
        const optionResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/enterprise/" + organizationId + "/inventory" && url.searchParams.get("view") === "lot-options" &&
            url.searchParams.get("warehouseId") === fixture.warehouseId && url.searchParams.get("search") === key;
        });
        await dialog.getByPlaceholder(locale === "fr" ? "Nom, code ou SKU" : "Name, code or SKU", { exact: true }).fill(key);
        const response = await optionResponse;
        expect(response.ok()).toBeTruthy();
        const options = await response.json();
        expect(options.items.map(item => item.id)).toEqual([inventory.id]);
        expect(options.items[0]).not.toHaveProperty("balances");
        await expect(itemSelect).toBeEnabled();
        await itemSelect.selectOption(inventory.id);
        const expiryInput = dialog.locator('input[name="expiryDate"]');
        await expect(expiryInput).toHaveAttribute("required", "");
        await expect.poll(() => dialog.locator("[data-dtsc-dialog-scroll]").evaluate(el => el.scrollWidth - el.clientWidth), { message: "Batch editor must fit mobile viewport" }).toBeLessThanOrEqual(2);
        const lotNumber = key + "-" + locale;
        await dialog.locator('input[name="lotNumber"]').fill(lotNumber);
        await expiryInput.fill(expiry);
        const createResponse = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/enterprise/" + organizationId + "/inventory/lots");
        await dialog.getByRole("button", { name: locale === "fr" ? "Enregistrer le lot" : "Save batch", exact: true }).click();
        expect((await createResponse).status()).toBe(201);
        await expect(dialog).not.toBeVisible();
        const lot = await prisma.enterpriseStockLot.findFirstOrThrow({ where: { ...stockScope, warehouseId: fixture.warehouseId, lotNumber } });
        expect(lot.expiryDate.toISOString().slice(0, 10)).toBe(expiry);
        expect(await prisma.enterpriseStockMovement.count({ where: stockScope })).toBe(0);
        expect(await prisma.enterpriseInventoryCostLayer.count({ where: stockScope })).toBe(0);
        const physical = await prisma.enterpriseInventoryBalance.aggregate({ where: stockScope, _sum: { quantityOnHand: true } });
        expect(asNumber(physical._sum.quantityOnHand)).toBe(0);
      }
    } finally {
      await prisma.user.update({ where: { id: fixture.userId }, data: { locale: user.locale } });
    }
  });

  test("#1228 commercial totals keep filtered, general and page scopes across currencies", async ({ page }, testInfo) => {
    await signIn(page);
    test.setTimeout(180_000);
    const key=`E2E-1228-COMM-${Date.now()}`;
    const user=await prisma.user.findUniqueOrThrow({where:{id:fixture.userId},select:{locale:true}});
    const models=[["quotes","enterpriseQuote"],["sales-orders","enterpriseSalesOrder"],["purchases","enterprisePurchase"]];
    try {
      for(const [,model] of models) await prisma[model].createMany({data:Array.from({length:36},(_,i)=>({organizationId,reference:`${key}-${i}`,title:key,status:"DRAFT",currency:i%2?"USD":"CDF",subtotalAmount:"1.23",taxAmount:0,totalAmount:"1.23",createdByUserId:fixture.userId,...(model==="enterprisePurchase"?{requestedByUserId:fixture.userId}:{businessPartyId:fixture.customerId,discountAmount:0})}))});
      for(const [endpoint] of models){
        const query=`/api/enterprise/${organizationId}/${endpoint}?search=${key}&status=DRAFT&pageSize=5`;
        const first=await apiGet(page,query+"&page=1"),second=await apiGet(page,query+"&page=2"),beyond=await apiGet(page,query+"&page=99");
        expect(first.response.status(),JSON.stringify(first.body)).toBe(200);expect(first.body.pagination.total).toBe(36);
        expect(first.body.items).toHaveLength(5);expect(second.body.items).toHaveLength(5);expect(beyond.body.items).toHaveLength(0);
        expect(second.body.filteredTotals).toEqual(first.body.filteredTotals);expect(beyond.body.filteredTotals).toEqual(first.body.filteredTotals);
        expect(second.body.generalTotals).toEqual(first.body.generalTotals);expect(beyond.body.pageTotals).toEqual([]);
        for(const currencyCode of ["USD","CDF"])expect(first.body.filteredTotals.find(row=>row.currencyCode===currencyCode&&row.metric==="total"&&row.status==="DRAFT").amount).toBe("22.14");
        expect(first.body.pageTotals.filter(row=>row.metric==="total").reduce((sum,row)=>sum.plus(row.amount),new Prisma.Decimal(0)).toFixed(2)).toBe("6.15");
      }
      for(const {locale,theme,width} of [{locale:"fr",theme:"dark",width:320},{locale:"en",theme:"light",width:1440},{locale:"fr",theme:"light",width:1440},{locale:"en",theme:"dark",width:320}]){
        await prisma.user.update({where:{id:fixture.userId},data:{locale}});await page.setViewportSize({width,height:900});
        await page.evaluate(value=>localStorage.setItem("theme",value),theme);
        for(const moduleCode of ["SALES_QUOTES_ORDERS","SUPPLIERS_PURCHASES"]){
          await page.goto(`/enterprise-modules/${moduleCode}`);
          await expect(page.locator("html")).toHaveClass(new RegExp("\\b"+theme+"\\b"));
          await expect(page.locator("html")).toHaveAttribute("lang",locale);
          if(moduleCode==="SUPPLIERS_PURCHASES"){
            const heading=page.locator("[data-erp-design2-register]").getByRole("heading",{name:locale==="fr"?"Achats":"Purchases",exact:true});
            await expect(heading).toBeVisible();expect((await heading.boundingBox()).width).toBeGreaterThan(180);
          }
          const search=moduleCode==="SALES_QUOTES_ORDERS"?page.locator("[data-workspace-toolbar]").getByRole("textbox"):page.locator("[data-purchase-design2]").getByRole("textbox");
          await search.fill(key);
          const scopes=page.locator("[data-commercial-amount-scopes]");await expect(scopes).toBeVisible();
          await expect(scopes).toContainText(locale==="fr"?"22,14":"22.14");
          await scopes.locator("summary").click();await expect(scopes).toContainText(locale==="fr"?"sans filtres":"without filters");await expect(scopes).toContainText(locale==="fr"?"page affichée":"Displayed page");
          const download=page.waitForEvent("download");const exportRoot=moduleCode==="SALES_QUOTES_ORDERS"?page.locator("[data-workspace-toolbar]"):page.locator("[data-purchase-design2]");await exportRoot.getByRole("button",{name:"CSV",exact:true}).click();const file=await download;expect(await file.failure()).toBeNull();
          const exportNotice=page.getByRole("status").filter({hasText:locale==="fr"?"téléchargées en CSV":"downloaded as CSV"});
          await expect(exportNotice.getByText(locale==="fr"?"Succès":"Success",{exact:true})).toBeVisible();
          await expect(exportNotice.getByRole("button",{name:locale==="fr"?"Fermer la notification":"Dismiss notification",exact:true})).toBeVisible();
          await expect(page.locator("footer")).toContainText(locale==="fr"?"Tous droits réservés":"All rights reserved");
          const csv=(await readFile(await file.path())).toString("utf8");expect(csv).toContain(locale==="fr"?"Sous-total filtré":"Filtered subtotal");expect(csv).toContain(locale==="fr"?"Total général autorisé sans filtres":"Authorized general total without filters");expect(csv).toContain(key);
          if(moduleCode==="SALES_QUOTES_ORDERS"){await page.locator("[data-professional-tabs]").getByRole("button").nth(1).click();await expect(scopes).toContainText(locale==="fr"?"22,14":"22.14");}
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
          await page.evaluate(()=>window.scrollTo(0,0));
          await page.screenshot({path:testInfo.outputPath(`1228-${moduleCode}-${locale}-${theme}-${width}.png`),fullPage:true});
        }
      }
    } finally {
      await prisma.user.update({where:{id:fixture.userId},data:{locale:user.locale}});
      for(const [,model] of models)await prisma[model].deleteMany({where:{organizationId,reference:{startsWith:key},status:"DRAFT"}});
    }
  });

  test("#1228 quote API validates all seven effective catalog unit precisions", async ({page})=>{
    await signIn(page);const key=`E2E-1228-UNIT-${Date.now()}`;const quoteIds=[],catalogIds=[],unitIds=[];
    try{
      for(let scale=0;scale<=6;scale++){
        const unit=await prisma.enterpriseUnitOfMeasure.create({data:{organizationId,code:`${key}-${scale}`,name:`Precision ${scale}`,decimalScale:scale,createdByUserId:fixture.userId}});unitIds.push(unit.id);
        const product=await prisma.enterpriseCatalogItem.create({data:{organizationId,code:`${key}-${scale}`,name:`Unit product ${scale}`,normalizedName:`${key}-${scale}`.toLowerCase(),itemType:"PRODUCT",unitOfMeasureId:unit.id,currency:"USD",createdByUserId:fixture.userId}});catalogIds.push(product.id);
        const quantity=scale?`1.${"0".repeat(scale-1)}1`:"1";
        const payload={businessPartyId:fixture.customerId,title:`${key}-${scale}`,currency:"USD",items:[{catalogItemId:product.id,description:product.name,quantity:Number(quantity),unitPrice:10,discountRate:0,taxRate:0}]};
        const accepted=await apiPost(page,`/api/enterprise/${organizationId}/quotes`,payload);expect(accepted.response.status(),JSON.stringify(accepted.body)).toBe(201);quoteIds.push(accepted.body.quote.id);
        const saved=await prisma.enterpriseQuoteItem.findFirstOrThrow({where:{organizationId,quoteId:accepted.body.quote.id}});expect(saved.quantity.toFixed()).toBe(quantity);expect(saved.unitOfMeasureId).toBe(unit.id);
        const rejected=await apiPost(page,`/api/enterprise/${organizationId}/quotes`,{...payload,items:[{...payload.items[0],quantity:Number(`1.${"0".repeat(scale)}1`)}]});
        expect(rejected.response.status(),JSON.stringify(rejected.body)).toBe(400);expect(rejected.body.error).toBe(scale===6?"INVENTORY_PHYSICAL_QUANTITY_PRECISION":"INVENTORY_UNIT_QUANTITY_PRECISION");
        expect(await prisma.enterpriseQuote.count({where:{organizationId,title:payload.title}})).toBe(1);
      }
    }finally{
      await prisma.enterpriseQuote.deleteMany({where:{organizationId,id:{in:quoteIds},status:"DRAFT"}});
      await prisma.enterpriseCatalogItem.deleteMany({where:{organizationId,id:{in:catalogIds}}});await prisma.enterpriseUnitOfMeasure.deleteMany({where:{organizationId,id:{in:unitIds}}});
    }
  });

  test("#1228 purchase receipt API preserves micro-units and rejects an unproven unit change", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page);
    const key = `E2E-1228-RECEIPT-${Date.now()}`;
    const endpoint = `/api/enterprise/${organizationId}/purchases`;
    const units = [];
    let catalogItem, purchase;
    try {
      for (const suffix of ["ORDER", "OTHER"]) {
        const unit = await prisma.enterpriseUnitOfMeasure.create({ data: {
          organizationId, code: `${key}-${suffix}`, name: `Precision ${suffix}`, symbol: "u", decimalScale: 6, createdByUserId: fixture.userId,
        } });
        units.push(unit);
      }
      catalogItem = await prisma.enterpriseCatalogItem.create({ data: {
        organizationId, code: key, name: key, normalizedName: key.toLowerCase(), itemType: "SERVICE", unitOfMeasureId: units[0].id, currency: fixture.currencyCode, createdByUserId: fixture.userId,
      } });
      const created = await apiPost(page, endpoint, {
        title: key, currency: fixture.currencyCode, buyerUserId: fixture.userId,
        items: [{ catalogItemId: catalogItem.id, description: catalogItem.name, quantity: "0.000007", unit: "u", unitPrice: 100000, taxRate: 0 }],
      });
      expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
      purchase = created.body.purchase;
      const line = purchase.items[0];
      expect(String(line.quantity)).toBe("0.000007");
      await prisma.enterprisePurchase.update({ where: { id: purchase.id }, data: { status: "ORDERED", orderedAt: new Date() } });
      const detailPath = `${endpoint}/${purchase.id}`;
      const readRemaining = async () => {
        const detail = await apiGet(page, detailPath);
        expect(detail.response.status(), JSON.stringify(detail.body)).toBe(200);
        return detail.body.receiptQuantities.find((quantity) => quantity.purchaseItemId === line.id);
      };
      expect(await readRemaining()).toMatchObject({ remaining: "0.000007", decimalScale: 6 });
      const receive = (quantityReceived, revision = purchase.revision) => apiPost(page, `${detailPath}/receive`, {
        revision, receivedAt: new Date().toISOString(), items: [{ purchaseItemId: line.id, quantityReceived }],
      });
      await prisma.enterpriseCatalogItem.update({ where: { id: catalogItem.id }, data: { unitOfMeasureId: units[1].id } });
      expect(await readRemaining()).toMatchObject({ remaining: "0.000007", decimalScale: null });
      const refused = await receive("0.000003");
      expect(refused.response.status(), JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.error).toBe("INVENTORY_UNIT_CONVERSION_REQUIRED");
      expect(await prisma.enterprisePurchaseReceipt.count({ where: { organizationId, purchaseId: purchase.id } })).toBe(0);

      await prisma.enterpriseCatalogItem.update({ where: { id: catalogItem.id }, data: { unitOfMeasureId: units[0].id } });
      const partial = await receive("0.000003");
      expect(partial.response.status(), JSON.stringify(partial.body)).toBe(201);
      expect(partial.body.purchase.status).toBe("PARTIALLY_RECEIVED");
      expect(await readRemaining()).toMatchObject({ remaining: "0.000004", decimalScale: 6 });
      const complete = await receive("0.000004", partial.body.purchase.revision);
      expect(complete.response.status(), JSON.stringify(complete.body)).toBe(201);
      expect(complete.body.purchase.status).toBe("RECEIVED");
      expect(await readRemaining()).toMatchObject({ remaining: "0", decimalScale: 6 });
      const printable = await page.context().request.get(`${detailPath}/print?lang=en`);
      expect(printable.status(), await printable.text()).toBe(200);
      expect(await printable.text()).toContain("0.000007");
    } finally {
      if (purchase) {
        const receipts = await prisma.enterprisePurchaseReceipt.findMany({ where: { organizationId, purchaseId: purchase.id }, include: { items: true } });
        await prisma.enterprisePurchaseReceiptItemStockLink.deleteMany({ where: { organizationId, purchaseReceiptItemId: { in: receipts.flatMap((receipt) => receipt.items.map((item) => item.id)) } } });
        await prisma.enterprisePurchaseReceiptOperationalLink.deleteMany({ where: { organizationId, purchaseReceiptId: { in: receipts.map((receipt) => receipt.id) } } });
        await prisma.enterprisePurchaseReceipt.deleteMany({ where: { organizationId, purchaseId: purchase.id } });
        await prisma.enterprisePurchaseItemCatalogLink.deleteMany({ where: { organizationId, purchaseItemId: { in: purchase.items.map((item) => item.id) } } });
        await prisma.enterprisePurchase.delete({ where: { id: purchase.id } });
      }
      if (catalogItem) await prisma.enterpriseCatalogItem.delete({ where: { id: catalogItem.id } });
      await prisma.enterpriseUnitOfMeasure.deleteMany({ where: { organizationId, id: { in: units.map((unit) => unit.id) } } });
    }
  });

  test("#1228 full-capacity stock stays exact and keyboard-readable in every viewport",async({page},testInfo)=>{
    test.setTimeout(180_000);await signIn(page);const key=`E2E-1228-CAP-${Date.now()}`;
    const user=await prisma.user.findUniqueOrThrow({where:{id:fixture.userId},select:{locale:true}});
    let unit,product,inventory;
    try{
      unit=await prisma.enterpriseUnitOfMeasure.create({data:{organizationId,code:key,name:"Micro-unit",symbol:"q",decimalScale:6,createdByUserId:fixture.userId}});
      product=await prisma.enterpriseCatalogItem.create({data:{organizationId,code:key,name:key,normalizedName:key.toLowerCase(),itemType:"PRODUCT",trackInventory:true,unitOfMeasureId:unit.id,createdByUserId:fixture.userId}});
      inventory=await prisma.enterpriseInventoryItem.create({data:{organizationId,catalogItemId:product.id,createdByUserId:fixture.userId}});
      await prisma.enterpriseInventoryBalance.create({data:{organizationId,inventoryItemId:inventory.id,warehouseId:fixture.warehouseId,quantityOnHand:"999999999999999.999999",quantityReserved:"0.000001"}});
      for(const locale of ["fr","en"])for(const theme of ["light","dark"]){
        await prisma.user.update({where:{id:fixture.userId},data:{locale}});await page.evaluate(value=>localStorage.setItem("theme",value),theme);
        await page.goto("/enterprise-modules/INVENTORY_LOGISTICS");await expect(page.locator("html")).toHaveAttribute("lang",locale);
        const query=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===`/api/enterprise/${organizationId}/inventory`&&url.searchParams.get("search")===key;});
        await page.locator("[data-workspace-toolbar]").getByRole("textbox").fill(key);const response=await query;expect(response.ok(),await response.text()).toBe(true);
        const body=await response.json();expect(body.items[0].quantityOnHandExact).toBe("999999999999999.999999");expect(body.items[0].quantityReservedExact).toBe("0.000001");expect(body.items[0].quantityAvailableExact).toBe("999999999999999.999998");
        const totals=page.locator("[data-inventory-quantity-totals]").getByRole("region",{name:locale==="fr"?"Quantités filtrées, toutes pages":"Filtered quantities, all pages",exact:true});
        await expect(totals).toContainText(locale==="fr"?"999 999 999 999 999,999999 q":"999,999,999,999,999.999999 q");
        await expect(totals).toContainText(locale==="fr"?"0,000001 q":"0.000001 q");
        await expect(totals).toContainText(locale==="fr"?"999 999 999 999 999,999998 q":"999,999,999,999,999.999998 q");
        for(const width of [320,360,375,390,414,768,1024,1440]){
          await page.setViewportSize({width,height:900});await expect(page.locator("html")).toHaveClass(new RegExp("\\b"+theme+"\\b"));
          const rail=totals.getByRole("group");
          if(await rail.evaluate(element=>element.scrollWidth>element.clientWidth)){
            const atEnd=()=>rail.evaluate(element=>element.scrollLeft+element.clientWidth>=element.scrollWidth-2);
            const atStart=()=>rail.evaluate(element=>element.scrollLeft<=2);
            await rail.focus();
            await page.keyboard.press("Home");
            await expect.poll(atStart).toBe(true);
            for(let i=0;i<14;i++)await page.keyboard.press("ArrowRight");
            await expect.poll(atEnd).toBe(true);
            for(let i=0;i<14;i++)await page.keyboard.press("ArrowLeft");
            await expect.poll(atStart).toBe(true);
            await page.keyboard.press("End");
            await expect.poll(atEnd).toBe(true);
            await page.keyboard.press("Home");
            await expect.poll(atStart).toBe(true);
          }
          expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
          await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:testInfo.outputPath(`1228-stock-capacity-${locale}-${theme}-${width}.png`),fullPage:true});
        }
      }
    }finally{
      await prisma.user.update({where:{id:fixture.userId},data:{locale:user.locale}});
      if(inventory){await prisma.enterpriseInventoryBalance.deleteMany({where:{organizationId,inventoryItemId:inventory.id}});await prisma.enterpriseInventoryItem.deleteMany({where:{organizationId,id:inventory.id}});}
      if(product)await prisma.enterpriseCatalogItem.deleteMany({where:{organizationId,id:product.id}});if(unit)await prisma.enterpriseUnitOfMeasure.deleteMany({where:{organizationId,id:unit.id}});
    }
  });

});
