import assert from "node:assert/strict";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";
const load = workflowTestLoader({});
const { appendCatalogUnitConversion, resolveCatalogUnitConversion, projectCatalogConversion, requireCatalogConversionFactor } = load("@/lib/enterprise/master-data/unit-conversions");
const units = [
  { id:"bottle", organizationId:"A", code:"BT", decimalScale:0, status:"ACTIVE", archivedAt:null },
  { id:"carton", organizationId:"A", code:"CT", decimalScale:0, status:"ACTIVE", archivedAt:null },
  { id:"foreign", organizationId:"B", code:"CT", decimalScale:0, status:"ACTIVE", archivedAt:null },
];
const item = { id:"water", organizationId:"A", trackInventory:true, status:"ACTIVE", archivedAt:null, unitOfMeasure:units[0] };
const versions=[], events=[];
const match=(row,where)=>Object.entries(where).every(([k,v])=>row[k]===v);
const tx={
  enterpriseCatalogItem:{findFirst:async({where})=>match(item,where)?item:null},
  enterpriseUnitOfMeasure:{findFirst:async({where})=>units.find(row=>match(row,where))??null},
  enterpriseCatalogUnitConversion:{
    findFirst:async({where})=>versions.filter(row=>match(row,where)).sort((a,b)=>b.version-a.version)[0]??null,
    create:async({data})=>{const row={...data,id:"v"+data.version};versions.push(row);return row;},
  },
  enterpriseOperationalEvent:{create:async({data})=>{events.push(data);return data;}},
};
const input={organizationId:"A",actorUserId:"admin",catalogItemId:"water",sourceUnitId:"carton",factor:"24",expectedVersion:0};
const first=await appendCatalogUnitConversion(tx,input);
assert.equal((await resolveCatalogUnitConversion(tx,{...input,quantity:"2"})).stockQuantity,"48");
assert.equal((await resolveCatalogUnitConversion(tx,{...input,sourceUnitId:"bottle",quantity:"2"})).stockQuantity,"2");
await assert.rejects(appendCatalogUnitConversion(tx,input),/CATALOG_CONVERSION_REVISION_CONFLICT/);
await assert.rejects(appendCatalogUnitConversion(tx,{...input,sourceUnitId:"foreign"}),/CATALOG_CONVERSION_REFERENCE_UNAVAILABLE/);
await assert.rejects(appendCatalogUnitConversion(tx,{...input,organizationId:"B"}),/CATALOG_CONVERSION_REFERENCE_UNAVAILABLE/);
await assert.rejects(appendCatalogUnitConversion(tx,{...input,sourceUnitId:"bottle"}),/INVENTORY_UNIT_CONVERSION_INVALID/);
await assert.rejects(appendCatalogUnitConversion(tx,{...input,factor:"0.5",expectedVersion:1}),/INVENTORY_UNIT_QUANTITY_PRECISION/);
const second=await appendCatalogUnitConversion(tx,{...input,factor:"12",expectedVersion:1});
assert.equal(second.version,2);
assert.equal((await resolveCatalogUnitConversion(tx,{...input,quantity:"2"})).stockQuantity,"24");
assert.equal(projectCatalogConversion(first,"2").stockQuantity,"48");
assert.equal(versions.length,2);
assert.equal(events.length,2);
await assert.rejects(resolveCatalogUnitConversion(tx,{...input,quantity:"0.5"}),/INVENTORY_UNIT_QUANTITY_PRECISION/);
item.unitOfMeasure={...units[0],decimalScale:3};
await assert.rejects(resolveCatalogUnitConversion(tx,{...input,quantity:"2"}),/INVENTORY_UNIT_CONVERSION_REQUIRED/);
for(const bad of ["0","-1","1e2","1.0000000000001","1000000000000000000","NaN"])assert.throws(()=>requireCatalogConversionFactor(bad),/INVENTORY_UNIT_CONVERSION_INVALID/);
assert.equal(projectCatalogConversion({...first,sourceScale:6,targetScale:6},"0.000001").stockQuantity,"0.000024");
console.log("PASS #1228: versioned product conversion, exact historical snapshot, tenant and precision guards");
