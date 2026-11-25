import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
function load(path,dependencies={}){const unit={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:unit,exports:unit.exports,require:name=>name in dependencies?dependencies[name]:name.startsWith("@/")?load(`${name.slice(2)}.ts`,dependencies):require(name)});return unit.exports;}
const {resolveSalesQuantitiesTx:resolve}=load("lib/enterprise/crm-sales/quantity.ts");
const {inventoryQuantityStep:step,isInventoryQuantityInputValid:valid}=load("lib/enterprise/inventory/quantity-display.ts");
let catalog=[], units=[], reads=0,writes=0,existing=null,quote,created;
const tx={
  enterpriseCatalogItem:{findMany:async({where})=>{reads++;assert.equal(where.organizationId,"tenant");assert.equal(where.status,"ACTIVE");assert.equal(where.archivedAt,null);return catalog.filter(item=>where.id.in.includes(item.id)&&item.organizationId===where.organizationId);}},
  enterpriseUnitOfMeasure:{findMany:async({where})=>units.filter(unit=>where.id.in.includes(unit.id)&&unit.organizationId===where.organizationId&&unit.status===where.status&&!unit.archivedAt)},
  enterpriseBusinessParty:{findFirst:async()=>({id:"party"})},
  enterpriseQuote:{create:async({data})=>{writes++;created=data;return{...data,id:"quote",status:"DRAFT"};},findFirst:async()=>quote,updateMany:async()=>({count:1})},
  enterpriseSalesOrder:{findFirst:async()=>existing,findUniqueOrThrow:async()=>existing,create:async({data})=>{writes++;created=data;return{...data,id:"order"};}},
};
const dependencies={"@/lib/prisma":{prisma:{$transaction:fn=>fn(tx)}},"@/lib/enterprise/crm-sales/helpers":{assertActiveClientOrganization:async()=>{},enterpriseReference:()=>"REF",publishEnterpriseEvent:async()=>{},roundMoney:value=>Math.round((value+Number.EPSILON)*100)/100}};
const quotes=load("lib/enterprise/crm-sales/quotes.ts",dependencies),orders=load("lib/enterprise/crm-sales/orders.ts",dependencies);
const line=quantity=>({catalogItemId:"product",description:"Product",quantity,unitPrice:10,discountRate:0,taxRate:0,discountAmount:0,taxRatePercent:0,taxAmount:0,lineSubtotal:10,lineTotal:10});
const input=quantity=>({businessPartyId:"party",title:"Quote",currency:"USD",idempotencyKey:"test-key",items:[line(quantity)]});
function setUnit(scale){catalog=[{id:"product",organizationId:"tenant",unitOfMeasureId:"unit",unitOfMeasure:{id:"unit",decimalScale:scale,status:"ACTIVE",archivedAt:null}}];}
for(let scale=0;scale<=6;scale++){
  setUnit(scale);const value=scale?`1.${"0".repeat(scale-1)}1`:"1",bad=`1.${"0".repeat(scale)}1`;
  assert.equal(step(scale),scale?`0.${"0".repeat(scale-1)}1`:"1");assert.equal(valid(value,scale),true);assert.equal(valid(bad,scale),false);assert.equal(valid("0",scale),false);assert.equal(valid("0",scale,false),true);
  const before=reads;const result=await resolve(tx,"tenant",[line(value),line(value)]);assert.equal(reads-before,1);assert.equal(result[0].quantity.toFixed(),value);assert.equal(result[0].unitOfMeasureId,"unit");
  await quotes.createEnterpriseQuote("tenant","actor",input(Number(value)));assert.equal(created.items.create[0].quantity.toFixed(),value);assert.equal(created.items.create[0].unitOfMeasureId,"unit");
  await orders.createEnterpriseDirectSalesOrder("tenant","actor",input(Number(value)));assert.equal(created.items.create[0].quantityOrdered.toFixed(),value);assert.equal(created.items.create[0].unitOfMeasureId,"unit");
  quote={...input(Number(value)),id:"quote",status:"ACCEPTED",revision:1,items:[{...line(value),unitOfMeasureId:"unit"}]};
  await quotes.convertEnterpriseQuoteToOrder("tenant","quote","actor",1);assert.equal(created.items.create[0].quantityOrdered,value);
  const beforeInvalid=writes;const code=scale===6?"INVENTORY_PHYSICAL_QUANTITY_PRECISION":"INVENTORY_UNIT_QUANTITY_PRECISION";
  await assert.rejects(quotes.createEnterpriseQuote("tenant","actor",input(Number(bad))),{code});
  await assert.rejects(orders.createEnterpriseDirectSalesOrder("tenant","actor",input(Number(bad))),{code});
  quote.items[0].quantity=bad;await assert.rejects(quotes.convertEnterpriseQuoteToOrder("tenant","quote","actor",1),{code});assert.equal(writes,beforeInvalid);
}
setUnit(6);
quote={...input(1),id:"legacy-quote",status:"ACCEPTED",revision:1,items:[{...line(1),unitOfMeasureId:null}]};
const beforeLegacy=writes;await assert.rejects(quotes.convertEnterpriseQuoteToOrder("tenant","legacy-quote","actor",1),{code:"INVENTORY_UNIT_CONVERSION_REQUIRED"});assert.equal(writes,beforeLegacy);assert.equal(quote.items[0].unitOfMeasureId,null);
await assert.rejects(resolve(tx,"tenant",[{...line("1"),unitOfMeasureId:"different"}]),{code:"INVENTORY_UNIT_CONVERSION_REQUIRED"});
catalog[0].unitOfMeasure.status="ARCHIVED";await assert.rejects(resolve(tx,"tenant",[line(1)]),{code:"UNIT_OF_MEASURE_NOT_FOUND"});
setUnit(6);catalog[0].organizationId="foreign";await assert.rejects(resolve(tx,"tenant",[line(1)]),{code:"CATALOG_ITEM_NOT_FOUND"});
units=[{id:"free",organizationId:"tenant",decimalScale:0,status:"ACTIVE",archivedAt:null}];
await assert.rejects(resolve(tx,"tenant",[{quantity:"1.1",unitOfMeasureId:"free"}]),{code:"INVENTORY_UNIT_QUANTITY_PRECISION"});
await assert.rejects(resolve(tx,"tenant",[{quantity:1,unitOfMeasureId:"foreign"}]),{code:"UNIT_OF_MEASURE_NOT_FOUND"});
assert.equal((await resolve(tx,"tenant",[{quantity:"0.000001"}]))[0].unitOfMeasureId,null);
existing={id:"immutable-order",items:[],fulfillments:[]};assert.equal((await orders.createEnterpriseDirectSalesOrder("tenant","actor",input("0.0000001"))).idempotent,true);
quote={id:"quote",status:"CONVERTED",convertedOrderId:existing.id};assert.equal((await quotes.convertEnterpriseQuoteToOrder("tenant","quote","actor",1)).id,existing.id);
for(const scale of [undefined,-1,7,1.5]){assert.equal(step(scale),undefined);assert.equal(valid("1",scale),false);}
console.log("#1228 sales quantities: seven unit scales through quote/direct order/conversion, no writes on invalid input, canonical units, cross-tenant/archived/free units and immutable replay passed");
