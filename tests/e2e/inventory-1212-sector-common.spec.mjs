import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Explicitly restricted to the disposable Shop 2 CI DB. This suite creates
// synthetic tenants and opening balance fixtures, never real tenant data.
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const database = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
function assertIsolatedFixtureEnvironment() {
  if (process.env.E2E_INVENTORY_SECTOR_ISOLATED !== "true" ||
      !["localhost", "127.0.0.1"].includes(database.hostname) ||
      database.pathname !== "/dtsc_shop2_behavioral" ||
      !["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) {
    throw new Error("#1212 sector fixtures require isolated Shop 2 database/LAN application");
  }
}
const prisma = new PrismaClient();
const seedOrganizationId = process.env.E2E_ORGANIZATION_ID || "e2e-erp-professional-org";
const adminEmail = process.env.E2E_ADMIN_EMAIL || "erp-admin@example.test";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin2026!";
const readerEmail = process.env.E2E_USER_EMAIL || "erp-user@example.test";
const readerPassword = process.env.E2E_USER_PASSWORD || "E2eUser2026!";
const runKey = "E2E-1212-" + randomUUID().slice(0, 12);
const sectors = ["COMMERCE_RETAIL", "PHARMACY", "HEALTH_CARE", "MANUFACTURING"];
const d = value => new Prisma.Decimal(value);
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const iso = value => new Date(value + "T00:00:00.000Z");
const fixtureBySector = new Map();

async function read(response) {
  return { status: response.status(), body: await response.json().catch(() => null), headers: response.headers() };
}
async function signIn(context, organizationId, email, password) {
  const res = await read(await context.request.post(baseUrl + "/api/auth/sign-in", {
    data: { email, password, organizationId, next: "/enterprise-modules/INVENTORY_LOGISTICS" },
    headers: { origin: baseUrl, referer: baseUrl + "/auth/sign-in" },
  }));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

test.describe.serial("#1212 common inventory contract in independent sector tenants", () => {
  test.beforeAll(async () => {
    assertIsolatedFixtureEnvironment();
    const [user, subscription] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: adminEmail } }),
      prisma.organizationSubscription.findFirstOrThrow({ where: { organizationId: seedOrganizationId, status: "ACTIVE" } }),
    ]);
    for (const sectorCode of sectors) {
      const key = runKey + "-" + sectorCode;
      const org = await prisma.organization.create({ data: {
        name: key, slug: key.toLowerCase(), sectorCode, sector: sectorCode,
        status: "ACTIVE", organizationType: "CLIENT", country: "CD",
        timezone: "Africa/Kinshasa", createdByDtscUserId: user.id,
      } });
      const organizationId = org.id;
      await prisma.organizationMember.create({ data: {
        organizationId, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date(),
      } });
      await prisma.organizationSubscription.create({ data: {
        organizationId, planId: subscription.planId, status: "ACTIVE",
        startedAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() + 30 * 86400000),
        createdByDtscUserId: user.id, updatedByDtscUserId: user.id,
      } });
      for (const [index, moduleCode] of ["CATALOG", "SITES_WAREHOUSES", "INVENTORY_LOGISTICS"].entries()) {
        await prisma.enterpriseModule.create({ data: {
          organizationId, moduleCode, labelFr: moduleCode, labelEn: moduleCode,
          moduleCategory: "E2E", isEnabled: true, isCore: false, requiresPlanLevel: "BUSINESS", sortOrder: index,
        } });
      }
      await prisma.enterpriseCurrency.create({ data: { organizationId, code: "USD", name: "US Dollar", symbol: "USD", precision: 2, isActive: true } });
      const site = await prisma.enterpriseSite.create({ data: {
        organizationId, code: "E2E-SITE", name: "E2E site", siteType: "STORE", countryCode: "CD",
        timezone: "Africa/Kinshasa", status: "ACTIVE", createdByUserId: user.id,
      } });
      const warehouse = await prisma.enterpriseWarehouse.create({ data: {
        organizationId, siteId: site.id, code: "E2E-WH", name: "E2E warehouse", warehouseType: "STORE",
        status: "ACTIVE", createdByUserId: user.id,
      } });
      const unit = await prisma.enterpriseUnitOfMeasure.create({ data: {
        organizationId, code: "EA", name: "Each", symbol: "ea", category: "COUNT",
        status: "ACTIVE", isSystem: true, createdByUserId: user.id,
      } });
      // Same searchable SKU across organizations on purpose; identity, not
      // text matching, must determine which tenant's product is returned.
      const product = await prisma.enterpriseCatalogItem.create({ data: {
        organizationId, code: runKey, sku: runKey, name: runKey,
        normalizedName: runKey.toLowerCase(), itemType: "PRODUCT", unitOfMeasureId: unit.id,
        indicativeSalePrice: 10, indicativeCost: 4, currency: "USD",
        trackInventory: true, taxable: false, createdByUserId: user.id,
      } });
      const inventory = await prisma.enterpriseInventoryItem.create({ data: {
        organizationId, catalogItemId: product.id, lotTracking: true, expiryTracking: true,
        allowNegativeStock: false, createdByUserId: user.id,
      } });
      fixtureBySector.set(sectorCode, { organizationId, warehouseId: warehouse.id, inventoryItemId: inventory.id, actor: user.id });
    }
  });

  test.afterAll(async () => {
    // Retain isolated fixtures as diagnostic evidence; the CI Postgres service
    // is destroyed with the job. Never delete real stock or audit rows.
    await prisma.$disconnect();
  });

  for (const sectorCode of sectors) {
    test(sectorCode + " — first lot, strict expiry, available quantity and no cross-tenant references", async ({ browser }) => {
      const fixture = fixtureBySector.get(sectorCode);
      const { organizationId, warehouseId, inventoryItemId, actor } = fixture;
      const foreign = fixtureBySector.get(sectors.find(value => value !== sectorCode));
      const scope = { organizationId, inventoryItemId };
      const path = "/api/enterprise/" + organizationId + "/inventory";
      const context = await browser.newContext();
      try {
        await signIn(context, organizationId, adminEmail, adminPassword);
        const get = async url => read(await context.request.get(baseUrl + url));
        const post = async data => read(await context.request.post(baseUrl + path + "/lots", {
          data, headers: { origin: baseUrl, referer: baseUrl + "/enterprise-modules/INVENTORY_LOGISTICS" },
        }));
        const snapshot = async () => ({
          balances: await prisma.enterpriseInventoryBalance.findMany({ where: scope, orderBy: { id: "asc" } }),
          movements: await prisma.enterpriseStockMovement.findMany({ where: scope, orderBy: { id: "asc" } }),
          layers: await prisma.enterpriseInventoryCostLayer.findMany({ where: scope, orderBy: { id: "asc" } }),
          sectorEvents: await prisma.enterpriseSectorInventoryEvent.count({ where: { organizationId } }),
          pharmacyExtensions: await prisma.pharmacyProductExtension.count({ where: { organizationId } }),
        });
        const before = await snapshot();
        expect(before.balances).toEqual([]);
        expect(before.movements).toEqual([]);
        expect(before.layers).toEqual([]);

        const options = await get(path + "?view=lot-options&warehouseId=" + warehouseId + "&search=" + runKey);
        expect(options.status, JSON.stringify(options.body)).toBe(200);
        expect(options.body.items.map(item => item.id)).toEqual([inventoryItemId]);
        expect(options.body.items[0].expiryTracking).toBe(true);
        expect(options.body.items[0]).not.toHaveProperty("balances");
        expect(options.headers["cache-control"]).toContain("no-store");
        const foreignWarehouse = await get(path + "?view=lot-options&warehouseId=" + foreign.warehouseId + "&search=" + runKey);
        expect(foreignWarehouse.status).toBe(404);
        const input = { inventoryItemId, warehouseId, lotNumber: "BATCH-" + runKey, productionDate: null, expiryDate: day(60), notes: null };
        const missingExpiry = await post({ ...input, expiryDate: null });
        expect(missingExpiry.status).toBe(400);
        expect(missingExpiry.body.error).toBe("INVENTORY_LOT_EXPIRY_REQUIRED");
        const foreignItem = await post({ ...input, inventoryItemId: foreign.inventoryItemId });
        expect(foreignItem.status).toBe(404);
        const foreignDepot = await post({ ...input, warehouseId: foreign.warehouseId });
        expect(foreignDepot.status).toBe(404);
        expect(await prisma.enterpriseStockLot.count({ where: scope })).toBe(0);

        const created = await post(input);
        expect(created.status, JSON.stringify(created.body)).toBe(201);
        const lot = await prisma.enterpriseStockLot.findFirstOrThrow({ where: { ...scope, warehouseId, lotNumber: input.lotNumber } });
        expect(lot.id).toBe(created.body.lot.id);
        expect(lot.expiryDate.toISOString().slice(0, 10)).toBe(input.expiryDate);
        const duplicate = await post(input);
        expect(duplicate.status).toBe(409);
        expect(await prisma.enterpriseStockLot.count({ where: scope })).toBe(1);
        expect(await snapshot()).toEqual(before);

        // Opening balances below are explicit isolated fixtures, not receipt
        // or regulated-sector workflows claimed as executed. The authenticated
        // availability read must exclude expired and quarantined units without
        // mutating any physical or accounting row.
        for (const [suffix, expiry, status, amount] of [
          ["USABLE", day(30), "AVAILABLE", 30],
          ["EXPIRED", day(-30), "AVAILABLE", 40],
          ["QUARANTINE", day(90), "QUARANTINED", 30],
        ]) {
          const batch = await prisma.enterpriseStockLot.create({ data: {
            ...scope, warehouseId, lotNumber: runKey + "-" + suffix, expiryDate: iso(expiry),
            status, ...(status === "QUARANTINED" ? { qualityReason: "Synthetic quarantine fixture", qualityChangedByUserId: actor, qualityChangedAt: new Date() } : {}),
            createdByUserId: actor,
          } });
          await prisma.enterpriseInventoryBalance.create({ data: { ...scope, warehouseId, stockLotId: batch.id, quantityOnHand: amount } });
          const movement = await prisma.enterpriseStockMovement.create({ data: {
            ...scope, warehouseId, stockLotId: batch.id, movementType: "OPENING_BALANCE", direction: "IN",
            quantity: amount, balanceAfter: amount, idempotencyKey: runKey + "-" + suffix, createdByUserId: actor,
          } });
          await prisma.enterpriseInventoryCostLayer.create({ data: {
            ...scope, warehouseId, sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE",
            quantity: amount, remainingQuantity: amount, unitCost: 4, totalCost: amount * 4, currencyCode: "USD", effectiveAt: new Date(),
          } });
        }
        const seeded = await snapshot();
        const list = await get(path + "?warehouseId=" + warehouseId + "&search=" + runKey);
        expect(list.status, JSON.stringify(list.body)).toBe(200);
        expect(list.body.items).toHaveLength(1);
        expect(list.body.items[0]).toMatchObject({ id: inventoryItemId, quantityOnHand: 100, quantityAvailable: 30, quantityReserved: 0 });
        expect(seeded.layers.reduce((sum, layer) => sum.plus(layer.totalCost), d(0)).equals(400)).toBe(true);
        expect(await snapshot()).toEqual(seeded);
      } finally {
        await context.close();
      }
    });
  }

  test("A user belonging to the seeded organization cannot read or write isolated sector tenants", async ({ browser }) => {
    const target = fixtureBySector.get("PHARMACY");
    const context = await browser.newContext();
    try {
      await signIn(context, seedOrganizationId, readerEmail, readerPassword);
      const path = baseUrl + "/api/enterprise/" + target.organizationId + "/inventory";
      expect((await context.request.get(path + "?view=lot-options&warehouseId=" + target.warehouseId)).status()).toBe(403);
      const response = await context.request.post(path + "/lots", {
        data: { inventoryItemId: target.inventoryItemId, warehouseId: target.warehouseId, lotNumber: runKey + "-FORBIDDEN", productionDate: null, expiryDate: day(60), notes: null },
        headers: { origin: baseUrl, referer: baseUrl + "/enterprise-modules/INVENTORY_LOGISTICS" },
      });
      expect(response.status()).toBe(403);
      expect(await prisma.enterpriseStockLot.count({ where: { organizationId: target.organizationId, lotNumber: runKey + "-FORBIDDEN" } })).toBe(0);
    } finally {
      await context.close();
    }
  });
});
