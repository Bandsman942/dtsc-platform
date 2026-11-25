import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
const D=value=>new Prisma.Decimal(value);
const analytics=workflowTestLoader({})("@/lib/enterprise/inventory/availability-analytics");
const {inventoryQuantityMetrics:metrics,inventoryQuantityTotals:totals,readInventoryQuantityTotalsTx:read}=analytics;
const asOf=new Date("2026-11-25T12:00:00Z"),businessDate="2026-11-25";
const unit={id:"unit",name:"Kilogram",symbol:"kg",decimalScale:6};
const balance=(id,quantity="10")=>({id,warehouseId:"wh",storageLocationId:null,stockLotId:"lot",quantityOnHand:D(quantity),quantityReserved:D(1),warehouse:{status:"ACTIVE",archivedAt:null},storageLocation:null,stockLot:{status:"AVAILABLE",archivedAt:null,expiryDate:new Date("2027-01-01")}});
const item={id:"item",lotTracking:true,expiryTracking:true,balances:[balance("balance")]};
const order={inventoryItemId:"item",warehouseId:"wh",quantity:D(3),fulfilledQuantity:D(1),lotAllocations:null,storageLocationId:null};
const hold={inventoryItemId:"item",warehouseId:"wh",stockLotId:"lot",quantity:D(1)};
let values=metrics(item,[order],[hold],businessDate);assert.equal(values.onHand.toFixed(),"10");assert.equal(values.reserved.toFixed(),"4");assert.equal(values.sellable.toFixed(),"6");
for(const change of [b=>({...b,stockLot:{...b.stockLot,status:"QUARANTINED"}}),b=>({...b,stockLot:{...b.stockLot,expiryDate:new Date("2026-11-24")}}),b=>({...b,warehouse:{...b.warehouse,status:"INACTIVE"}}),b=>({...b,storageLocationId:"shelf",storageLocation:{status:"INACTIVE",archivedAt:null}})]){const result=metrics({...item,balances:[change(balance("balance"))]},[order],[hold],businessDate);assert.equal(result.onHand.toFixed(),"10");assert.equal(result.reserved.toFixed(),"4");assert.equal(result.sellable.toFixed(),"0");}
values=metrics({...item,lotTracking:false,expiryTracking:false},[order],[hold],businessDate);assert.equal(values.sellable.toFixed(),"6");
const foreignHold={...hold,warehouseId:"forbidden",quantity:D(99999)};assert.equal(metrics(item,[order],[hold,foreignHold],businessDate).reserved.toFixed(),"4");
const maximum={...item,balances:[{...balance("maximum","999999999999999.999999"),quantityReserved:D("0.000001")}]};
const maximumValues=metrics(maximum,[],[],businessDate);assert.equal(maximumValues.sellable.toFixed(),"999999999999999.999998");
const exact=totals([{unit,metrics:maximumValues},{unit,metrics:metrics({...item,lotTracking:false,expiryTracking:false,balances:[{...balance("micro","0.000001"),quantityReserved:D(0)}]},[],[],businessDate)}]);
assert.equal(exact.find(x=>x.metric==="onHand").value,"1000000000000000.000000");assert.equal(exact.find(x=>x.metric==="sellable").value,"999999999999999.999999");
assert.equal(totals([]).length,0);

// 501 authorized items, one forbidden warehouse and a foreign tenant: three
// fixed-size reads rather than one query per product. Fake data access checks
// the actual scoped Prisma query arguments; physical arithmetic remains real.
const records=Array.from({length:502},(_,i)=>({id:`item-${String(i).padStart(4,"0")}`,organizationId:i===501?"foreign":"tenant",lotTracking:Boolean(i%2),expiryTracking:Boolean(i%2),minimumQuantity:D(i%2?5:10),catalogItem:{unitOfMeasure:unit},balances:[{...balance(`b-${i}`),stockLot:i%2&&i%3===0?{...balance("x").stockLot,expiryDate:new Date("2026-11-24")}:balance("x").stockLot},{...balance(`forbidden-${i}`,"99999"),warehouseId:"forbidden"}]}));
let calls={items:0,reservations:0,holds:0};
const tx={
 enterpriseInventoryItem:{findMany:async query=>{calls.items++;assert.equal(query.take,200);assert.deepEqual(query.where.AND[0],{organizationId:"tenant"});assert.deepEqual(query.select.balances.where.AND[0],{organizationId:"tenant"});assert.equal(query.select.balances.where.AND[1].warehouseId,"wh");const allowed=records.filter(row=>row.organizationId===query.where.AND[0].organizationId&&(!query.where.AND[1].id||query.where.AND[1].id.in.includes(row.id)));const start=query.cursor?allowed.findIndex(row=>row.id===query.cursor.id)+query.skip:0;return allowed.slice(start,start+query.take).map(row=>({...row,balances:row.balances.filter(b=>b.warehouseId==="wh")}));}},
 enterpriseInventoryReservation:{findMany:async query=>{calls.reservations++;assert.equal(query.where.organizationId,"tenant");assert.deepEqual(query.where.warehouseId.in,["wh"]);assert.equal(query.where.OR[1].expiresAt.gt,asOf);return query.where.inventoryItemId.in.map(id=>({...order,inventoryItemId:id}));}},
 enterpriseRetailInvoiceCheckoutLine:{findMany:async query=>{calls.holds++;assert.equal(query.where.organizationId,"tenant");assert.deepEqual(query.where.checkout.warehouseId.in,["wh"]);return query.where.inventoryItemId.in.map(id=>({inventoryItemId:id,stockLotId:"lot",lotAllocations:null,invoiceItem:{quantity:D(1)},returnLines:[],checkout:{warehouseId:"wh"}}));}},
};
const input={organizationId:"tenant",where:{},balancesWhere:{warehouseId:"wh"},lowStock:false,businessDate,asOf};
const all=await read(tx,input);assert.equal(all.find(x=>x.metric==="onHand").value,"5010.000000");assert.equal(all.find(x=>x.metric==="reserved").value,"2004.000000");
const expired=records.slice(0,501).filter((_,i)=>i%2&&i%3===0).length;assert.equal(all.find(x=>x.metric==="sellable").value,`${6*(501-expired)}.000000`);assert.deepEqual(calls,{items:3,reservations:3,holds:3});
const low=await read(tx,{...input,lowStock:true});assert.equal(low.find(x=>x.metric==="onHand").value,"2510.000000");assert.equal(low.find(x=>x.metric==="sellable").value,"1506.000000");
const selected=await read(tx,{...input,where:{id:{in:["item-0000","item-0001"]}}});assert.equal(selected.find(x=>x.metric==="onHand").value,"20.000000");assert.equal(selected.find(x=>x.metric==="reserved").value,"8.000000");
assert.equal((await read(tx,{...input,where:{id:{in:[]}}})).length,0);
console.log("#1228 inventory analytics: canonical FEFO, promises/holds, expiry/quarantine/inactive locations, exact capacity, low-stock filters, cross-tenant/store scope and 501-item bounded batches passed");
