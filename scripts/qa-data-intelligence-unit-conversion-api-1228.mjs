import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const tenant = "A", itemId = "water", actor = "manager";
let signedIn = true, canRead = true, canManage = false, sameOrigin = true, limited = false;
const transactions = [], audit = [], events = [], versions = [];
const unit = { id:"bottle", organizationId:tenant, code:"BT", name:"Bottle", decimalScale:0, status:"ACTIVE", archivedAt:null };
const carton = { ...unit, id:"carton", code:"CT", name:"Carton" };
const item = { id:itemId, organizationId:tenant, name:"Water", code:"W", trackInventory:true, status:"ACTIVE", archivedAt:null, unitOfMeasure:unit };
const match = (row, where) => Object.entries(where).every(([key,value])=>row[key]===value);
const tx = {
  enterpriseCatalogItem:{findFirst:async({where})=>match(item,where)?item:null},
  enterpriseUnitOfMeasure:{findFirst:async({where})=>[unit,carton].find(row=>match(row,where))??null},
  enterpriseCatalogUnitConversion:{
    findFirst:async({where})=>versions.filter(row=>match(row,where)).sort((a,b)=>b.version-a.version)[0]??null,
    findMany:async({where,skip,take,select,orderBy})=>{
      assert.equal(where.organizationId,tenant);
      assert.equal(orderBy.at(-1).id,"desc");
      return versions.filter(row=>match(row,where)).slice().sort((a,b)=>b.version-a.version).slice(skip,skip+take).map(row=>Object.fromEntries(Object.keys(select).map(key=>[key,row[key]])));
    },
    count:async({where})=>versions.filter(row=>match(row,where)).length,
    create:async({data})=>{const row={...data,id:"v"+data.version,createdAt:new Date("2026-11-26")};versions.push(row);return row;},
  },
  enterpriseOperationalEvent:{create:async({data})=>{events.push(data);return data;}},
};
const load = workflowTestLoader({
  "@/lib/auth":{getSession:async()=>signedIn?{userId:actor}:null},
  "@/lib/enterprise/common/access":{getEnterpriseCommonDomainAccess:async({organizationId,moduleCode,action})=>{
    assert.equal(moduleCode,"CATALOG");
    return organizationId===tenant && (action==="manage"?canManage:canRead)?{canAdminister:canManage}:null;
  }},
  "@/lib/audit":{writeAuditLog:async entry=>audit.push(entry),writeApiLog:async()=>{}},
  "@/lib/rate-limit":{getRateLimitKey:()=>actor,rateLimit:async()=>({ok:!limited})},
  "@/lib/request-security":{isSameOriginRequest:()=>sameOrigin},
  "@/lib/enterprise/common/http":{
    enterpriseValidationErrorResponse:()=>new Response(null,{status:400}),
    enterpriseDomainErrorResponse:error=>new Response(JSON.stringify({error:error.code}),{status:error.status||500}),
  },
  "@/lib/prisma":{prisma:{$transaction:async(callback,options)=>{transactions.push(options.isolationLevel);return callback(tx);}}},
});
const {GET,POST} = load("@/app/api/enterprise/[organizationId]/catalog/unit-conversions/route");
const payload={catalogItemId:itemId,sourceUnitId:"carton",factor:"24",expectedVersion:0};
const post=(data=payload,org=tenant)=>POST(new Request("http://localhost/api/enterprise/"+org+"/catalog/unit-conversions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}),{params:Promise.resolve({organizationId:org})});
const get=(query="catalogItemId="+itemId,org=tenant)=>GET(new Request("http://localhost/api/enterprise/"+org+"/catalog/unit-conversions?"+query),{params:Promise.resolve({organizationId:org})});
assert.equal((await post()).status,403);
assert.equal(transactions.length,0);
canManage=true;
sameOrigin=false;assert.equal((await post()).status,403);sameOrigin=true;
signedIn=false;assert.equal((await post()).status,401);assert.equal((await get()).status,401);signedIn=true;
limited=true;assert.equal((await post()).status,429);limited=false;
assert.equal((await post({...payload,organizationId:"B"})).status,400);
assert.equal((await post({...payload,factor:24})).status,400);
assert.equal((await post(payload,"B")).status,403);
assert.equal(transactions.length,0);
const created=await post();assert.equal(created.status,201);
const data=await created.json();assert.equal(data.conversion.factor,"24");assert.equal(data.conversion.createdByUserId,undefined);
assert.equal(transactions.at(-1),"Serializable");assert.equal(events.length,1);assert.equal(audit.length,1);
assert.equal((await post()).status,409);
assert.equal((await post({...payload,expectedVersion:1,factor:"12"})).status,201);
canManage=false;
const response=await get();assert.equal(response.status,200);
assert.equal(response.headers.get("Cache-Control"),"private, no-store");
const history=await response.json();
assert.equal(history.canManage,false);assert.equal(history.pagination.total,2);
assert.deepEqual(history.items.map(row=>[row.version,row.factor]),[[2,"12"],[1,"24"]]);
assert.equal(history.items[0].createdByUserId,undefined);
assert.equal(transactions.at(-1),"RepeatableRead");
const preview=await (await get("catalogItemId=water&sourceUnitId=carton&quantity=2")).json();
assert.equal(preview.preview.stockQuantity,"24");assert.equal(preview.preview.version,2);
assert.equal((await get("catalogItemId=water&sourceUnitId=carton&quantity=0.1")).status,400);
assert.equal((await get("catalogItemId=unknown")).status,404);
assert.equal((await get("catalogItemId=water","B")).status,403);
canRead=false;assert.equal((await get()).status,403);
assert.equal(versions.length,2);assert.equal(events.length,2);assert.equal(audit.length,2);
assert.ok(versions.every(row=>row.factor instanceof Prisma.Decimal));
console.log("PASS #1228: conversion API read/preview/manage, exact strings, revision, audit, tenant and request guards");
