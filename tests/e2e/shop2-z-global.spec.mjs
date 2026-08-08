import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

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

async function signIn(page) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent("/enterprise-modules/RETAIL_POS")}`);
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  const loadContextButton = page.getByRole("button", { name: /^Charger$/i });
  await emailInput.fill(adminEmail);
  await passwordInput.fill(adminPassword);
  const lookupPromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/organizations") && response.request().method() === "POST");
  await loadContextButton.click();
  expect((await lookupPromise).ok()).toBeTruthy();
  const organizationSelect = page.locator('select[name="organizationId"]');
  await organizationSelect.selectOption(organizationId);
  await page.getByRole("button", { name: /^Se connecter$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/sign-in"), { timeout: 30_000 });
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
    const operationUuid = `offline-${crypto.randomUUID()}`;
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
      operationUuid: `offline-card-${crypto.randomUUID()}`,
      payload: { ...offlinePayload, idempotencyKey: `offline-card-local:${crypto.randomUUID()}`, tenders: [{ methodType: "CARD", financialAccountId: fixture.cashAccountId, amount: asNumber(offlineItem.unitLineTotal), reference: null }] },
    });
    expect(rejectedTender.response.status(), JSON.stringify(rejectedTender.body)).toBe(422);
    expect(rejectedTender.body?.operation?.conflictCode).toBe("OFFLINE_TENDER_NOT_ALLOWED");

    const expired = await apiPost(page, `/api/enterprise/${organizationId}/retail/offline/sync`, {
      ...syncBody,
      operationUuid: `offline-expired-${crypto.randomUUID()}`,
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
});
