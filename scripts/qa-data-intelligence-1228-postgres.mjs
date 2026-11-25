import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Run after migrate deploy on the isolated CI DB. Fixture writes are rolled back.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; PostgreSQL verification cannot be skipped");
const target = new URL(process.env.DATABASE_URL);
if (process.env.QA_1228_DATABASE_FIXTURE !== "true" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("_test")) {
  throw new Error("An explicitly enabled local isolated *_test database is required for the rollback fixture");
}
const db = new PrismaClient();
const { planFefoLots } = workflowTestLoader({})("@/lib/enterprise/inventory/lot-allocation");
class RollbackFixture extends Error {}
try {
  const expected = [
    ["EnterpriseInventoryBalance", "quantityOnHand", 21],
    ["EnterpriseInventoryBalance", "quantityReserved", 21],
    ["EnterpriseStockMovement", "quantity", 21],
    ["EnterpriseStockMovement", "balanceAfter", 21],
    ["EnterpriseInventoryReservation", "quantity", 21],
    ["EnterpriseStockTransferLine", "quantity", 21],
    ["EnterpriseQuoteItem", "quantity", 21],
    ["EnterpriseSalesOrderItem", "quantityOrdered", 21],
    ["EnterprisePurchaseItem", "quantity", 21],
    ["EnterpriseProductionOrder", "plannedQuantity", 21],
    ["EnterpriseInventoryCostLayer", "remainingQuantity", 21],
    ["EnterpriseInventoryTransferValuation", "quantity", 21],
    ["PharmacyStockMovement", "quantity", 17],
    ["HealthPharmacyStockMovement", "quantity", 17],
  ];
  const columns = await db.$queryRaw`SELECT table_name, column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND data_type='numeric'`;
  for (const [table, field, precision] of expected) {
    const found = columns.find(row => row.table_name === table && row.column_name === field);
    assert.ok(found, `${table}.${field} must exist`);
    assert.equal(found.numeric_precision, precision, `${table}.${field} preserves integer capacity`);
    assert.equal(found.numeric_scale, 6, `${table}.${field} preserves micro-units`);
  }
  const [row] = await db.$queryRaw`SELECT
    '999999999999999.999999'::numeric(21,6)::text AS common_max,
    '99999999999.999999'::numeric(17,6)::text AS sector_max,
    (5::numeric(21,6)-0.123456::numeric(21,6))::text AS residual`;
  assert.equal(row.common_max, "999999999999999.999999");
  assert.equal(row.sector_max, "99999999999.999999");
  assert.equal(row.residual, "4.876544");
  const [constraint] = await db.$queryRaw`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"EnterpriseInventoryTransferValuation"'::regclass AND conname='inv_transfer_value_amount_ck'`;
  assert.match(constraint.definition, /round\(quantity, 6\)/);
  assert.match(constraint.definition, /sourceQuantityBefore/);
  assert.match(constraint.definition, /sourceValueBefore/);
  const tenant = `qa-1228-${randomUUID()}`;
  const otherTenant = `${tenant}-other`;
  const actor = "qa-1228-actor";
  try {
    await db.$transaction(async tx => {
      const unit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId: tenant, code: "MICRO", name: "Micro-unit", decimalScale: 6 } });
      const otherUnit = await tx.enterpriseUnitOfMeasure.create({ data: { organizationId: otherTenant, code: "MICRO", name: "Other unit", decimalScale: 6 } });
      const catalogData = { code: "MICRO", name: "Micro article", normalizedName: "micro article", itemType: "PRODUCT", trackInventory: true, createdByUserId: actor };
      const item = await tx.enterpriseCatalogItem.create({ data: { ...catalogData, organizationId: tenant, unitOfMeasureId: unit.id } });
      const foreign = await tx.enterpriseCatalogItem.create({ data: { ...catalogData, organizationId: otherTenant, unitOfMeasureId: otherUnit.id } });
      await tx.$executeRawUnsafe("SAVEPOINT qa_1228_tenant");
      await assert.rejects(async () => tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: foreign.id, createdByUserId: actor } }), { code: "P2003" });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT qa_1228_tenant");
      const site = await tx.enterpriseSite.create({ data: { organizationId: tenant, code: "SHOP", name: "QA shop", siteType: "STORE", createdByUserId: actor } });
      const warehouse = await tx.enterpriseWarehouse.create({ data: { organizationId: tenant, siteId: site.id, code: "WH", name: "QA warehouse", createdByUserId: actor } });
      const inventory = await tx.enterpriseInventoryItem.create({ data: { organizationId: tenant, catalogItemId: item.id, createdByUserId: actor } });
      const coordinates = { organizationId: tenant, inventoryItemId: inventory.id, warehouseId: warehouse.id };
      const balance = await tx.enterpriseInventoryBalance.create({ data: { ...coordinates, quantityOnHand: "999999999999999.999998" } });
      const updated = await tx.enterpriseInventoryBalance.update({ where: { id: balance.id }, data: { quantityOnHand: { increment: "0.000001" } } });
      assert.equal(updated.quantityOnHand.toFixed(), "999999999999999.999999", "Prisma round-trip and PostgreSQL increment retain the last micro-unit");
      const promisedBalance=await tx.enterpriseInventoryBalance.update({where:{id:balance.id},data:{quantityReserved:"0.000001"}});
      const maximumPlan=planFefoLots({candidates:[{id:promisedBalance.id,status:"AVAILABLE",expiryDate:null,quantityOnHand:promisedBalance.quantityOnHand,quantityReserved:promisedBalance.quantityReserved}],quantity:promisedBalance.quantityOnHand,businessDate:"2026-11-25",expiryMode:"BLOCK"});
      assert.equal(maximumPlan.allocations[0].quantity.toFixed(),"999999999999999.999998","The real Prisma NUMERIC values retain the last reserved micro-unit in FEFO");
      assert.equal(maximumPlan.shortfall.toFixed(),"0.000001");
      const movement = await tx.enterpriseStockMovement.create({ data: { ...coordinates, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: "0.123456", balanceAfter: "999999999999999.999999", idempotencyKey: `${tenant}-movement`, createdByUserId: actor } });
      assert.equal(movement.quantity.toFixed(), "0.123456");
      assert.equal(movement.balanceAfter.toFixed(), "999999999999999.999999");
      const layer = await tx.enterpriseInventoryCostLayer.create({ data: { organizationId: tenant, inventoryItemId: inventory.id, warehouseId: warehouse.id, sourceMovementId: movement.id, valuationMethod: "WEIGHTED_AVERAGE", quantity: "0.123456", remainingQuantity: "0.123456", unitCost: "2.5", totalCost: "0.30864", currencyCode: "CDF", effectiveAt: new Date() } });
      assert.equal(layer.remainingQuantity.toFixed(), "0.123456");
      await tx.$executeRawUnsafe("SAVEPOINT qa_1228_idempotence");
      await assert.rejects(async () => tx.enterpriseStockMovement.create({ data: { ...coordinates, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: "0.123456", idempotencyKey: `${tenant}-movement`, createdByUserId: actor } }), { code: "P2002" });
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT qa_1228_idempotence");
      // More than two analytical batches, with real orders, unpaid invoice
      // holds, another unit and forbidden site. No ledger posting is performed.
      const integerUnit=await tx.enterpriseUnitOfMeasure.create({data:{organizationId:tenant,code:"INTEGER",name:"Piece",decimalScale:0}});
      const bulk=Array.from({length:501},(_,i)=>({id:`${tenant}-bulk-${String(i).padStart(4,"0")}`,catalogId:`${tenant}-catalog-${i}`,invoiceItemId:`${tenant}-invoice-item-${i}`}));
      await tx.enterpriseCatalogItem.createMany({data:bulk.map((row,i)=>({...catalogData,id:row.catalogId,organizationId:tenant,code:`BULK-1228-${i}`,normalizedName:`bulk-1228-${i}`,name:`BULK-1228-${i}`,unitOfMeasureId:i%2?integerUnit.id:unit.id}))});
      await tx.enterpriseInventoryItem.createMany({data:bulk.map(row=>({id:row.id,organizationId:tenant,catalogItemId:row.catalogId,minimumQuantity:10,createdByUserId:actor}))});
      await tx.enterpriseInventoryBalance.createMany({data:bulk.map(row=>({organizationId:tenant,inventoryItemId:row.id,warehouseId:warehouse.id,quantityOnHand:10,quantityReserved:1}))});
      await tx.enterpriseInventoryReservation.createMany({data:bulk.map(row=>({organizationId:tenant,inventoryItemId:row.id,warehouseId:warehouse.id,salesOrderId:"fixture-order",salesOrderItemId:row.id,quantity:2,fulfilledQuantity:0,idempotencyKey:row.id,createdByUserId:actor}))});
      const invoice=await tx.enterpriseSalesInvoice.create({data:{organizationId:tenant,number:"QA-1228-HOLDS",businessPartyId:`${tenant}-party`,invoiceDate:new Date(),currencyCode:"USD",subtotal:501,taxTotal:0,grandTotal:501,outstandingAmount:501,createdByUserId:actor}});
      await tx.enterpriseSalesInvoiceItem.createMany({data:bulk.map(row=>({id:row.invoiceItemId,organizationId:tenant,salesInvoiceId:invoice.id,catalogItemId:row.catalogId,description:"Unpaid fixture line",quantity:1,unitPrice:1,netAmount:1,taxAmount:0,totalAmount:1}))});
      const checkout=await tx.enterpriseRetailInvoiceCheckout.create({data:{organizationId:tenant,salesInvoiceId:invoice.id,siteId:site.id,warehouseId:warehouse.id,idempotencyKey:`${tenant}-checkout`,requestFingerprint:"a".repeat(64),preparedByUserId:actor}});
      await tx.enterpriseRetailInvoiceCheckoutLine.createMany({data:bulk.map(row=>({organizationId:tenant,checkoutId:checkout.id,invoiceItemId:row.invoiceItemId,inventoryItemId:row.id}))});
      const forbiddenSite=await tx.enterpriseSite.create({data:{organizationId:tenant,code:"FORBIDDEN",name:"Forbidden shop",siteType:"STORE",createdByUserId:actor}});
      const forbiddenWarehouse=await tx.enterpriseWarehouse.create({data:{organizationId:tenant,siteId:forbiddenSite.id,code:"FORBIDDEN",name:"Forbidden warehouse",createdByUserId:actor}});
      await tx.enterpriseInventoryBalance.create({data:{organizationId:tenant,inventoryItemId:bulk[0].id,warehouseId:forbiddenWarehouse.id,quantityOnHand:99999}});
      const reader=new Proxy(tx,{get:(target,key)=>key==="organization"?{findUniqueOrThrow:async()=>({timezone:"UTC"})}:Reflect.get(target,key)});
      const {GET:inventoryGet}=workflowTestLoader({
        "@/lib/prisma":{prisma:{$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,"RepeatableRead");return fn(reader);}}},
        "@/lib/auth":{getSession:async()=>({userId:actor})},
        "@/lib/audit":{writeApiLog:async()=>{}},
        "@/lib/enterprise/common/access":{getEnterpriseCommonDomainAccess:async({organizationId})=>organizationId===tenant?{canManage:false,canWrite:false,canAdminister:false}:null},
        "@/lib/enterprise/retail/site-access":{retailInventoryVisibleSites:async()=>({isolationEnabled:true,siteIds:[site.id]})},
        "@/lib/enterprise/retail/http":{},
      })("@/app/api/enterprise/[organizationId]/inventory/route");
      const inventoryPage=async(page,extra="")=>{const response=await inventoryGet(new Request(`http://localhost/api/enterprise/${tenant}/inventory?search=BULK-1228&pageSize=5&page=${page}${extra}`),{params:Promise.resolve({organizationId:tenant})});assert.equal(response.status,200);return response.json();};
      const started=performance.now();const firstPage=await inventoryPage(1),secondPage=await inventoryPage(2),beyondPage=await inventoryPage(999);
      const elapsed=performance.now()-started;assert(elapsed<10000,`501-item full analytics plus three HTTP projections exceeded 10s: ${elapsed}ms`);
      assert.equal(firstPage.pagination.total,501);assert.equal(firstPage.items.length,5);assert.equal(secondPage.items.length,5);assert.equal(beyondPage.items.length,0);
      assert.deepEqual(firstPage.quantityTotals,secondPage.quantityTotals);assert.deepEqual(firstPage.quantityTotals,beyondPage.quantityTotals);assert.deepEqual(beyondPage.pageQuantityTotals,[]);
      assert.deepEqual(firstPage.generalQuantityTotals,secondPage.generalQuantityTotals);
      for(const [unitId,onHand,reserved,sellable]of [[unit.id,"2510.000000","1004.000000","1506.000000"],[integerUnit.id,"2500","1000","1500"]])for(const [metric,value]of [["onHand",onHand],["reserved",reserved],["sellable",sellable]])assert.equal(firstPage.quantityTotals.find(row=>row.unitId===unitId&&row.metric===metric).value,value);
      assert.equal(firstPage.metrics.warehouseCount,1);assert.equal(firstPage.metrics.movementCount,0);
      assert.equal(firstPage.generalQuantityTotals.find(row=>row.unitId===unit.id&&row.metric==="onHand").value,"1000000000002509.999999");
      const forbiddenPage=await inventoryPage(1,`&warehouseId=${forbiddenWarehouse.id}`);assert.equal(forbiddenPage.pagination.total,0);assert.deepEqual(forbiddenPage.quantityTotals,[]);assert.deepEqual(forbiddenPage.generalQuantityTotals,firstPage.generalQuantityTotals);
      assert.equal((await inventoryGet(new Request(`http://localhost/api/enterprise/${otherTenant}/inventory`),{params:Promise.resolve({organizationId:otherTenant})})).status,403);
      console.log(`PASS #1228 PostgreSQL inventory analytics: 501 items, real reservations/holds, two units, forbidden site, three pages in ${elapsed.toFixed(0)}ms`);
      // Commercial aggregates use PostgreSQL NUMERIC across more than one page,
      // with both foreign rows and a second document status/currency present.
      const exactCents = 999999999999999999n;
      const money = count => { const cents=exactCents*BigInt(count); return `${cents/100n}.${String(cents%100n).padStart(2,"0")}`; };
      for(const model of ["enterpriseQuote","enterpriseSalesOrder","enterprisePurchase"]){
        const data=Array.from({length:104},(_,i)=>({organizationId:i<102?tenant:otherTenant,reference:`COMM-${i}`,title:i%2?"Other":"Target",status:i%3?"DRAFT":"CANCELLED",currency:i%5?"USD":"CDF",subtotalAmount:"9999999999999999.99",taxAmount:"0",totalAmount:"9999999999999999.99",createdByUserId:actor,...(model==="enterprisePurchase"?{requestedByUserId:i%7?actor:"other-actor"}:{businessPartyId:`${tenant}-party`,discountAmount:"0"})}));
        await tx[model].createMany({data});
        const base={organizationId:tenant,archivedAt:null,...(model==="enterprisePurchase"?{requestedByUserId:actor}:{})};
        const where={...base,status:"DRAFT",title:{contains:"Target",mode:"insensitive"}};
        const general=await tx[model].groupBy({by:["currency","status"],where:base,_sum:{totalAmount:true},_count:{_all:true}});
        const filtered=await tx[model].groupBy({by:["currency","status"],where,_sum:{totalAmount:true},_count:{_all:true}});
        for(const group of general){const count=data.filter(row=>row.organizationId===tenant&&row.currency===group.currency&&row.status===group.status&&(model!=="enterprisePurchase"||row.requestedByUserId===actor)).length;assert.equal(group._sum.totalAmount.toFixed(2),money(count));assert.equal(group._count._all,count);}
        for(const group of filtered){const count=data.filter(row=>row.organizationId===tenant&&row.currency===group.currency&&row.status==="DRAFT"&&row.title==="Target"&&(model!=="enterprisePurchase"||row.requestedByUserId===actor)).length;assert.equal(group._sum.totalAmount.toFixed(2),money(count));assert.equal(group._count._all,count);}
        assert.equal(await tx[model].count({where}),filtered.reduce((sum,row)=>sum+row._count._all,0));
        const first=await tx[model].findMany({where,take:5,orderBy:{id:"asc"}}),second=await tx[model].findMany({where,take:5,skip:5,orderBy:{id:"asc"}});
        assert.equal(first.length,5);assert.equal(second.length,5);assert.equal(new Set([...first,...second].map(row=>row.id)).size,10);
        assert.equal((await tx[model].findMany({where,take:5,skip:1000})).length,0);
        assert.deepEqual(await tx[model].groupBy({by:["currency","status"],where,_sum:{totalAmount:true},_count:{_all:true}}),filtered);
      }
      throw new RollbackFixture();
    }, { timeout: 30000, isolationLevel: "RepeatableRead" });
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error;
  }
  assert.equal(await db.enterpriseCatalogItem.count({ where: { organizationId: { in: [tenant, otherTenant] } } }), 0, "No fixture data may remain");
  for(const model of ["enterpriseQuote","enterpriseSalesOrder","enterprisePurchase"]) assert.equal(await db[model].count({where:{organizationId:{in:[tenant,otherTenant]}}}),0,"Commercial rollback must leave no rows");
  console.log("PASS #1228 PostgreSQL: deployed quantity types, preserved integer capacity, exact micro-unit subtraction and transfer conservation constraint");
} finally {
  await db.$disconnect();
}
