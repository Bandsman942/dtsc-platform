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
    const [user, subscription, enterprisePlan] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: adminEmail } }),
      prisma.organizationSubscription.findFirstOrThrow({ where: { organizationId: seedOrganizationId, status: "ACTIVE" } }),
      // Sector tests must use the actual canonical Enterprise entitlement,
      // not the possibly modified subscription of another scenario.
      prisma.billingPlan.findFirstOrThrow({where:{id:"e2e-enterprise-plan",slug:"enterprise",isActive:true,audience:{in:["ORGANIZATION","BOTH"]}}}),
    ]);
    for (const sectorCode of sectors) {
      const key = runKey + "-" + sectorCode;
      const org = await prisma.organization.create({ data: {
        name: key, slug: key.toLowerCase(), sectorCode, sector: sectorCode,
        status: "ACTIVE", organizationType: "CLIENT", country: "CD",
        timezone: "Africa/Kinshasa", createdByDtscUserId: user.id,
        // Disposable one-owner fixtures only: allow a stock approval candidate
        // so authority failures are tested after genuine RBAC/policy checks.
        settingsJson:{approvalPolicy:{selfApprovalModuleCodes:["INVENTORY_LOGISTICS"]}},
      } });
      const organizationId = org.id;
      await prisma.organizationMember.create({ data: {
        organizationId, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date(),
      } });
      await prisma.organizationSubscription.create({ data: {
        organizationId, planId: sectorCode==="PHARMACY"||sectorCode==="HEALTH_CARE"?enterprisePlan.id:subscription.planId, status: "ACTIVE",
        startedAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() + 30 * 86400000),
        createdByDtscUserId: user.id, updatedByDtscUserId: user.id,
      } });
      for (const [index, moduleCode] of ["CATALOG", "SITES_WAREHOUSES", "INVENTORY_LOGISTICS", ...(sectorCode==="PHARMACY"?["CRM_CUSTOMERS","FINANCE_RECEIVABLES","MEDICINES_PRODUCTS","BATCH_EXPIRY","SALES_DISPENSATION"]:[])].entries()) {
        await prisma.enterpriseModule.create({ data: {
          organizationId, moduleCode, labelFr: moduleCode, labelEn: moduleCode,
          moduleCategory: "E2E", isEnabled: true, isCore: false, requiresPlanLevel: ["MEDICINES_PRODUCTS","BATCH_EXPIRY","SALES_DISPENSATION"].includes(moduleCode)?"ENTERPRISE":["CRM_CUSTOMERS","CATALOG"].includes(moduleCode)?"STARTER":"BUSINESS", sortOrder: index,
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
      const secondWarehouse=await prisma.enterpriseWarehouse.create({data:{organizationId,siteId:site.id,code:"E2E-WH-2",name:"E2E second warehouse",warehouseType:"STORE",status:"ACTIVE",createdByUserId:user.id}});
      fixtureBySector.set(sectorCode, { organizationId, warehouseId: warehouse.id, secondWarehouseId:secondWarehouse.id, inventoryItemId: inventory.id, actor: user.id });
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

        // A common article in a sector tenant is allowed until an actual
        // sector-authority link exists. After that, the same common identity
        // remains readable but is no longer an independent lot editor.
        if (sectorCode === "PHARMACY" || sectorCode === "HEALTH_CARE") {
          const stockItem = await prisma.enterpriseInventoryItem.findUniqueOrThrow({where:{id:inventoryItemId}});
          let pharmacyBatch = null;
          let sectorEvent = null;
          if (sectorCode === "PHARMACY") {
            const product = await prisma.pharmacyProduct.create({data:{
              organizationId,name:runKey,internalCode:runKey,category:"E2E",pharmaceuticalForm:"TABLET",
              saleUnit:"EA",stockUnit:"EA",createdById:actor,
            }});
            pharmacyBatch = await prisma.pharmacyBatch.create({data:{
              organizationId,productId:product.id,batchNumber:input.lotNumber,expiryDate:iso(input.expiryDate),
              receivedQuantity:0,availableQuantity:0,unit:"EA",createdById:actor,
            }});
            await prisma.pharmacyProductExtension.create({data:{organizationId,pharmacyProductId:product.id,catalogItemId:stockItem.catalogItemId,createdByUserId:actor}});
          } else {
            // Explicit synthetic sector provenance marker, not an assertion
            // that clinical stock consumption was executed.
            sectorEvent = await prisma.enterpriseSectorInventoryEvent.create({data:{
              organizationId,sector:sectorCode,sourceMovementId:seeded.movements[0].id,sourceProductId:stockItem.catalogItemId,
              catalogItemId:stockItem.catalogItemId,inventoryItemId,eventType:"E2E_AUTHORITY_MARKER",direction:"IN",
              quantity:0,idempotencyKey:runKey+"-sector-authority",createdByUserId:actor,
            }});
          }
          const beforeProtected = await snapshot();
          const beforeLot = await prisma.enterpriseStockLot.findUniqueOrThrow({where:{id:lot.id}});
          const beforeCount = await prisma.enterpriseStockLot.count({where:scope});
          const excluded = await get(path+"?view=lot-options&warehouseId="+warehouseId+"&search="+runKey);
          expect(excluded.status).toBe(200);
          expect(excluded.body.items).toEqual([]);
          expect(excluded.body.pagination.total).toBe(0);
          const projected = await get(path+"?search="+runKey);
          expect(projected.status).toBe(200);
          expect(projected.body.items.find(item=>item.id===inventoryItemId)?.sectorManaged).toBe(true);
          const lotRegister = await get(path+"/lots?search="+runKey+"&warehouseId="+warehouseId);
          expect(lotRegister.status).toBe(200);
          expect(lotRegister.body.items.find(item=>item.id===lot.id)?.sectorManaged).toBe(true);
          const forbiddenCreate = await post({...input,lotNumber:runKey+"-SECTOR-DUPLICATE"});
          expect(forbiddenCreate.status).toBe(409);
          expect(forbiddenCreate.body.error).toBe("STOCK_RECLASS_SECTOR_AUTHORITY");
          const headers = {origin:baseUrl,referer:baseUrl+"/enterprise-modules/INVENTORY_LOGISTICS"};
          for (const mutation of [{expiryDate:day(90)},{status:"QUARANTINED",qualityReason:"Attempt wrong stock authority"}]) {
            const result=await read(await context.request.patch(baseUrl+path+"/lots",{headers,data:{id:lot.id,revision:beforeLot.revision,...mutation}}));
            expect(result.status).toBe(409);
            expect(result.body.error).toBe("STOCK_RECLASS_SECTOR_AUTHORITY");
          }
          const forbiddenPolicy=await read(await context.request.put(baseUrl+path+"/item-policy",{headers,data:{
            inventoryItemId,revision:stockItem.revision,minimumQuantity:10,reorderQuantity:20,lotTracking:true,expiryTracking:true,
          }}));
          expect(forbiddenPolicy.status).toBe(409);
          expect(forbiddenPolicy.body.error).toBe("STOCK_RECLASS_SECTOR_AUTHORITY");
          const apiBase=baseUrl+"/api/enterprise/"+organizationId;
          const durableCounts=async()=>Promise.all([
            prisma.enterpriseStockAdjustment.count({where:scope}),
            prisma.enterpriseStockTransfer.count({where:{organizationId}}),
            prisma.enterpriseInventoryCount.count({where:{organizationId}}),
            prisma.enterpriseApproval.count({where:{organizationId}}),
            prisma.enterpriseInventoryAccountingEvent.count({where:scope}),
            prisma.enterpriseJournalEntry.count({where:{organizationId}}),
          ]);
          const beforeOperations=await durableCounts();
          for(const [endpoint,data] of [
            ["stock-movements",{inventoryItemId,warehouseId,stockLotId:lot.id,movementType:"OPENING_BALANCE",direction:"IN",quantity:1,idempotencyKey:runKey+"-blocked-opening"}],
            ["stock-adjustments",{inventoryItemId,warehouseId,stockLotId:lot.id,adjustmentType:"IN",quantity:1,reason:"Attempt independent common adjustment",approverUserId:actor,idempotencyKey:runKey+"-blocked-adjustment"}],
            ["inventory-counts",{warehouseId,countType:"SPOT",approverUserId:actor,lines:[{inventoryItemId,stockLotId:lot.id,countedQuantity:1}]}],
            ["stock-transfers",{sourceWarehouseId:warehouseId,destinationWarehouseId:fixture.secondWarehouseId,approverUserId:actor,lines:[{inventoryItemId,stockLotId:lot.id,quantity:1}]}],
          ]){
            const response=await read(await context.request.post(apiBase+"/"+endpoint,{headers,data}));
            expect(response.status,JSON.stringify(response.body)).toBe(409);
            expect(response.body.error).toBe("STOCK_RECLASS_SECTOR_AUTHORITY");
          }
          expect(await durableCounts()).toEqual(beforeOperations);
          expect(await prisma.enterpriseStockLot.count({where:scope})).toBe(beforeCount);
          expect(await prisma.enterpriseStockLot.findUniqueOrThrow({where:{id:lot.id}})).toEqual(beforeLot);
          expect(await prisma.enterpriseInventoryItem.findUniqueOrThrow({where:{id:inventoryItemId}})).toEqual(stockItem);
          expect(await snapshot()).toEqual(beforeProtected);
          if(pharmacyBatch) {
            expect(await prisma.pharmacyBatch.findUniqueOrThrow({where:{id:pharmacyBatch.id}})).toEqual(pharmacyBatch);
            // Genuine Pharmacy references endpoint (not the common projection).
            // All positive quantities here are isolated regulated fixture data,
            // not a claim that a sale or a clinical action was executed.
            const regulatoryLots=[];
            for(const [suffix,offset,amount,status,flags] of [
              ["EARLY",20,5,"ACTIVE",{}],["LATE",60,8,"ACTIVE",{}],
              ["EXPIRED",-10,9,"ACTIVE",{}],["QUARANTINE",10,6,"QUARANTINED",{quarantine:true}],
              ["RECALLED",15,7,"RECALLED",{recall:true}],["BLOCKED",5,4,"BLOCKED",{}]
            ]){
              regulatoryLots.push(await prisma.pharmacyBatch.create({data:{
                organizationId,productId:pharmacyBatch.productId,batchNumber:runKey+"-PH-"+suffix,
                expiryDate:iso(day(offset)),receivedQuantity:amount,availableQuantity:amount,
                status,...flags,unit:"EA",createdById:actor,
              }}));
            }
            const refs="/api/enterprise/"+organizationId+"/pharmacy/sales/references?kind=batches&productId="+pharmacyBatch.productId;
            const first=await get(refs+"&pageSize=1");
            expect(first.status,JSON.stringify(first.body)).toBe(200);
            expect(first.body.total).toBe(2);
            expect(first.body.pageCount).toBe(2);
            expect(first.body.items.map(row=>row.id)).toEqual([regulatoryLots[0].id]);
            const second=await get(refs+"&pageSize=1&page=2&selectedId="+regulatoryLots[0].id);
            expect(second.status).toBe(200);
            expect(second.body.items.map(row=>row.id)).toEqual([regulatoryLots[1].id]);
            expect(second.body.selected.id).toBe(regulatoryLots[0].id);
            for(const denied of regulatoryLots.slice(2)){
              const result=await get(refs+"&selectedId="+denied.id);
              expect(result.status).toBe(200);
              expect(result.body.selected).toBeNull();
            }
            await prisma.pharmacyProduct.update({where:{id:pharmacyBatch.productId},data:{status:"ARCHIVED"}});
            const archived=await get(refs+"&selectedId="+regulatoryLots[0].id);
            expect(archived.status).toBe(200);
            expect(archived.body.total).toBe(0);
            expect(archived.body.selected).toBeNull();
            for(const batch of regulatoryLots)expect(await prisma.pharmacyBatch.findUniqueOrThrow({where:{id:batch.id}})).toEqual(batch);
            expect(await snapshot()).toEqual(beforeProtected);
          }
          if(sectorEvent) expect(await prisma.enterpriseSectorInventoryEvent.findUniqueOrThrow({where:{id:sectorEvent.id}})).toEqual(sectorEvent);
        }
      } finally {
        await context.close();
      }
    });
  }

  test("Lot 6 #1215: real two-warehouse recall, deduplicated active managers, retry and no stock or ledger mutation", async ({ browser }) => {
    const target = fixtureBySector.get("COMMERCE_RETAIL");
    expect(target).toBeTruthy();
    const { organizationId, warehouseId, secondWarehouseId, inventoryItemId, actor } = target;
    const reader = await prisma.user.findUniqueOrThrow({ where: { email: readerEmail } });
    // Only disposable synthetic organizations are written. Two physical
    // warehouses share the same batch and the same active manager.
    await prisma.organizationMember.create({ data: {
      organizationId, userId: reader.id, role: "MEMBER", status: "ACTIVE", joinedAt: new Date(),
    } });
    await prisma.enterpriseWarehouse.updateMany({
      where: { organizationId, id: { in: [warehouseId, secondWarehouseId] } },
      data: { managerUserId: reader.id },
    });
    const lotNumber = runKey + "-CROSS-WAREHOUSE-RECALL";
    const lots = await Promise.all([warehouseId, secondWarehouseId].map(id =>
      prisma.enterpriseStockLot.create({ data: {
        organizationId, inventoryItemId, warehouseId: id, lotNumber,
        expiryDate: iso(day(60)), status: "AVAILABLE", createdByUserId: actor,
      } }),
    ));
    const initial = await Promise.all([
      prisma.enterpriseStockMovement.count({ where: { organizationId, inventoryItemId } }),
      prisma.enterpriseInventoryBalance.count({ where: { organizationId, inventoryItemId } }),
      prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
      prisma.enterpriseInventoryAccountingEvent.count({ where: { organizationId, inventoryItemId } }),
    ]);
    const context = await browser.newContext();
    const api = baseUrl + "/api/enterprise/" + organizationId + "/inventory/lots";
    const headers = { origin: baseUrl, referer: baseUrl + "/enterprise-modules/INVENTORY_LOGISTICS" };
    try {
      await signIn(context, organizationId, adminEmail, adminPassword);
      const recall = await read(await context.request.patch(api, { headers, data: {
        id: lots[0].id, revision: lots[0].revision, recall: true,
        qualityReason: "Prevent delivery of the affected test batch",
      } }));
      expect(recall.status, JSON.stringify(recall.body)).toBe(200);
      expect(recall.body).toMatchObject({ ok: true, status: "QUARANTINED", affectedLots: 2 });
      expect(recall.body.recallReference).toMatch(/^RECALL-/);
      expect(recall.body.notifications).toMatchObject({
        recipients: 1, queued: 1, failed: 0, discoveryFailed: false,
      });
      expect(JSON.stringify(recall.body)).not.toContain(reader.id);
      expect(JSON.stringify(recall.body)).not.toContain(lotNumber);
      const after = await prisma.enterpriseStockLot.findMany({
        where: { organizationId, inventoryItemId, lotNumber },
        orderBy: { warehouseId: "asc" },
      });
      expect(after).toHaveLength(2);
      for (const lot of after) {
        expect(lot.status).toBe("QUARANTINED");
        expect(lot.recallReference).toBe(recall.body.recallReference);
        expect(lot.revision).toBe(2);
      }
      const notices = await prisma.notification.findMany({
        where: { organizationId, userId: reader.id, title: "Alerte qualité des stocks" },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0].body).not.toContain(lotNumber);
      expect(notices[0].body).not.toContain(warehouseId);
      const retry = await read(await context.request.patch(api, { headers, data: {
        action: "RETRY_RECALL_ALERTS", id: lots[0].id, revision: 2,
      } }));
      expect(retry.status, JSON.stringify(retry.body)).toBe(200);
      expect(retry.body.notifications).toMatchObject({ recipients: 1, queued: 1, failed: 0 });
      expect(await prisma.notification.count({ where: { organizationId, userId: reader.id, title: "Alerte qualité des stocks" } })).toBe(1);
      const stale = await read(await context.request.patch(api, { headers, data: {
        action: "RETRY_RECALL_ALERTS", id: lots[0].id, revision: 1,
      } }));
      expect(stale.status).toBe(409);
      const unquarantine = await read(await context.request.patch(api, { headers, data: {
        id: lots[0].id, revision: 2, status: "AVAILABLE",
        qualityReason: "Invalid attempted release after recall",
      } }));
      expect(unquarantine.status).toBe(409);
      expect(await Promise.all([
        prisma.enterpriseStockMovement.count({ where: { organizationId, inventoryItemId } }),
        prisma.enterpriseInventoryBalance.count({ where: { organizationId, inventoryItemId } }),
        prisma.enterpriseJournalEntry.count({ where: { organizationId } }),
        prisma.enterpriseInventoryAccountingEvent.count({ where: { organizationId, inventoryItemId } }),
      ])).toEqual(initial);
    } finally { await context.close(); }
  });
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
