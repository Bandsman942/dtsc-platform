import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
const require = createRequire(import.meta.url);
function moduleAt(path, dependencies = {}, globals = {}) {
  const unit = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: unit, exports: unit.exports, URL, URLSearchParams, Date, ...globals,
    require: name => name in dependencies ? dependencies[name] : name.startsWith("@/") ? {} : require(name),
  }, { filename: path });
  return unit.exports;
}
const analytics = moduleAt("lib/enterprise/common/analytics.ts");
const D = value => new Prisma.Decimal(value);
const row = (currency, status, amount) => ({ currency, status, subtotalAmount: D(amount), discountAmount: D(0), taxAmount: D(0), totalAmount: D(amount) });
const exact = analytics.commercialPageTotals([row("USD", "DRAFT", "999999999999999.999998"), row("USD", "DRAFT", "0.000001"), row("CDF", "DRAFT", "0"), row("USD", "CANCELLED", "2")]);
assert.equal(exact.find(x => x.currencyCode === "USD" && x.status === "DRAFT" && x.metric === "total").amount, "999999999999999.999999");
assert.equal(exact.find(x => x.currencyCode === "CDF" && x.metric === "total").amount, "0");
assert.equal(exact.find(x => x.status === "CANCELLED" && x.metric === "total").amount, "2");
assert.equal(analytics.commercialAmountTotals([{currency: "USD", status: "DRAFT", _sum: { totalAmount: null }}]).length, 0);
assert.equal(analytics.commercialPageTotals([]).length, 0);

// Execute the actual three GET handlers. The in-memory delegate models filters,
// grouping and pagination; database isolation is separately proven by PostgreSQL CI.
function matches(item, where) {
  if (!where) return true;
  return Object.entries(where).every(([key,value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every(v => matches(item,v));
    if (key === "OR") return value.some(v => matches(item,v));
    if (key === "NOT") return !matches(item,value);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === "contains") return String(item[key] || "").toLowerCase().includes(String(expected).toLowerCase());
        if (operator === "mode") return true;
        if (operator === "in") return expected.includes(item[key]);
        if (operator === "gte") return item[key] >= expected;
        if (operator === "lte") return item[key] <= expected;
        if (operator === "lt") return item[key] < expected;
        throw new Error(`Unmodelled operator ${operator}`);
      });
    }
    return item[key] === value;
  });
}
for (const [endpoint, model] of [["quotes","enterpriseQuote"],["sales-orders","enterpriseSalesOrder"],["purchases","enterprisePurchase"]]) {
  const records = Array.from({length: 130},(_,i) => ({ id: `row-${String(i).padStart(3,"0")}`, organizationId: i >= 128 ? "foreign" : "tenant", archivedAt: null, ...row(i % 3 ? "USD" : "CDF", i % 4 ? "DRAFT" : "CANCELLED", "0.123456"), title: i % 2 ? "target" : "other", reference: `DOC-${i}`, description: "", businessPartyId: "party", requestedByUserId: i % 5 ? "actor" : "someone-else", createdAt: new Date("2026-11-25T12:00:00Z"), expectedAt: null }));
  let actor = {userId: "actor"}, permitted = true, calls = [], transactions = 0;
  const delegate = {
    async findMany(query) { calls.push(["list",query]); return records.filter(item=>matches(item,query.where)).slice(query.skip,query.skip+query.take); },
    async count(query) { calls.push(["count",query]); return records.filter(item=>matches(item,query.where)).length; },
    async groupBy(query) { calls.push(["group",query]); const groups = new Map(); for(const item of records.filter(item=>matches(item,query.where))) { const key=JSON.stringify(query.by.map(k=>item[k])); let g=groups.get(key); if(!g){g={currency:item.currency,status:item.status,_sum:Object.fromEntries(Object.keys(query._sum).map(k=>[k,D(0)])),_count:{_all:0}};groups.set(key,g);} g._count._all++;for(const key of Object.keys(g._sum))g._sum[key]=g._sum[key].plus(item[key]); }return [...groups.values()]; },
  };
  const prisma = { [model]:delegate, enterpriseBusinessParty:{findMany:async()=>[]}, enterpriseApproval:{findMany:async()=>[]},
    $transaction: async(fn,options)=>{transactions++;assert.equal(options.isolationLevel,"RepeatableRead");return fn(prisma);} };
  const access = {getEnterpriseCommonDomainAccess:async()=>permitted ? {canManage:false,canWrite:false}:null};
  const route = moduleAt(`app/api/enterprise/[organizationId]/${endpoint}/route.ts`, {
    "@/lib/enterprise/common/analytics":analytics,
    "next/server":{NextResponse:{json:(body,init)=>({status:init?.status||200,body:JSON.parse(JSON.stringify(body))})}},
    "@/lib/auth":{getSession:async()=>actor}, "@/lib/prisma":{prisma},
    "@/lib/audit":{writeApiLog:async()=>{}}, "@/lib/enterprise/common/access":access,
    "@/lib/enterprise/accounting/http":{financeBusinessDateRange:()=>({ok:true,from:new Date("2026-11-01"),to:new Date("2026-11-30")})},
    "@/lib/enterprise/procurement/access":{getEnterpriseProcurementAccess:async()=>permitted ? {canManage:false,canSeeAll:false}:null,enterprisePurchaseVisibilityWhere:({organizationId,userId})=>({organizationId,archivedAt:null,requestedByUserId:userId})},
  });
  const url=`http://localhost/api/enterprise/tenant/${endpoint}?search=target&status=DRAFT&pageSize=5&from=2026-11-01&to=2026-11-30`;
  const get = page=>route.GET({url:url+`&page=${page}`},{params:Promise.resolve({organizationId:"tenant"})});
  const first=await get(1), second=await get(2), beyond=await get(100);
  assert.equal(first.status,200);assert.equal(first.body.items.length,5);assert.equal(second.body.items.length,5);assert.equal(beyond.body.items.length,0);
  assert.deepEqual(first.body.filteredTotals,second.body.filteredTotals);assert.deepEqual(first.body.filteredTotals,beyond.body.filteredTotals);
  assert.deepEqual(first.body.generalTotals,second.body.generalTotals);assert.equal(beyond.body.pageTotals.length,0);
  assert(first.body.pagination.total>10);assert(first.body.generalTotals.some(x=>x.status==="CANCELLED"));assert(first.body.filteredTotals.every(x=>x.status==="DRAFT"));
  assert.equal(first.body.items.some(x=>x.organizationId!=="tenant"),false);
  if(endpoint==="purchases")assert(first.body.items.every(x=>x.requestedByUserId==="actor"));
  const expected=records.filter(x=>x.organizationId==="tenant"&&x.title==="target"&&x.status==="DRAFT"&&(endpoint!=="purchases"||x.requestedByUserId==="actor"));
  for(const currency of ["USD","CDF"]){const sum=expected.filter(x=>x.currency===currency).reduce((s,x)=>s.plus(x.totalAmount),D(0));assert.equal(first.body.filteredTotals.find(x=>x.currencyCode===currency&&x.metric==="total").amount,sum.toFixed());}
  assert.deepEqual(calls[0][1].where,calls[1][1].where);assert.deepEqual(calls[0][1].where,calls[2][1].where);
  const general=records.filter(x=>x.organizationId==="tenant"&&(endpoint!=="purchases"||x.requestedByUserId==="actor"));
  for(const currency of ["USD","CDF"])for(const status of ["DRAFT","CANCELLED"]){const sum=general.filter(x=>x.currency===currency&&x.status===status).reduce((s,x)=>s.plus(x.totalAmount),D(0));assert.equal(first.body.generalTotals.find(x=>x.currencyCode===currency&&x.status===status&&x.metric==="total").amount,sum.toFixed());}
  assert.equal(transactions,3);calls=[];actor=null;assert.equal((await get(1)).status,401);assert.equal(calls.length,0);
  actor={userId:"actor"};permitted=false;assert.equal((await get(1)).status,403);assert.equal(calls.length,0);
}
console.log("#1228 commercial analytics: exact decimals, null/zero, currencies/statuses, three real handlers, stable filtered/general/page scopes, authorization and requester visibility passed");

// Deferred real hook requests prove that newer filters win even if fetch ignores
// abort; cleanup also prevents state publication after unmount.
{
  const state=[], pending=[];let stateIndex=0,cleanup;
  const hook=moduleAt("components/enterprise/core-v2/use-enterprise-v2-collection.ts",{
    react:{useState:initial=>{const i=stateIndex++;state[i]=initial;return[initial,v=>{state[i]=v;}];},useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>{cleanup=fn();}},
  },{AbortController,fetch:(_url,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal}))});
  const collection=hook.useEnterpriseV2Collection({endpoint:"/purchases",params:new URLSearchParams("search=latest")});
  const newer=collection.reload();assert.equal(pending[0].signal.aborted,true);
  const payload=id=>({ok:true,json:async()=>({items:[{id}],pagination:{page:1,pageSize:5,total:1,pageCount:1},filteredTotals:[{currencyCode:"USD",metric:"total",amount:id}]})});
  pending[1].resolve(payload("latest"));await newer;
  pending[0].resolve(payload("stale"));await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(state[0][0].id,"latest");assert.equal(state[2].filteredTotals[0].amount,"latest");assert.equal(state[3],false);
  const afterUnmount=collection.reload();cleanup();pending[2].resolve(payload("unmounted"));await afterUnmount;
  assert.equal(state[0][0].id,"latest");
}
console.log("#1228 purchase request ordering: aborted/stale/unmounted responses cannot replace current rows or totals");

// Exercise the real export control with multiple API pages. General totals must
// survive CSV/XLSX/PDF and a changed general scope must abort the download.
{
  let pages=[], exports=[], notices=[];
  const total=(amount,metric="total")=>({currencyCode:"USD",status:"DRAFT",metric,amount});
  const exporter=moduleAt("components/enterprise/professional/finance-design2-controls.tsx",{
    react:{useEffect:()=>{},useState:initial=>[initial,()=>{}]},
    "@/lib/enterprise/inventory/quantity-display":moduleAt("lib/enterprise/inventory/quantity-display.ts"),
    "@/components/ui/button":{Button:"button"},
    "@/components/enterprise/professional/finance-professional-ui":{financeMoney:(amount,currency)=>`${amount} ${currency}`,financeStatusLabel:status=>status},
    "@/lib/client-toast":{notifyToast:(...args)=>notices.push(args)},
    "@/lib/reporting/professional-export":Object.fromEntries(["Csv","Xlsx","Pdf"].map(format=>[`downloadProfessional${format}`,model=>exports.push({format,model})])),
  },{fetch:async()=>({ok:true,json:async()=>pages.shift()})});
  const page=(id,general="8")=>({items:[{id}],pagination:{total:2,pageCount:2},filteredTotals:[total("3")],generalTotals:[total(general)],pageTotals:[total("999")]});
  function find(node,label){if(node?.props?.children===label)return node;const children=node?.props?.children;if(Array.isArray(children)&&children.includes(label))return node;for(const child of Array.isArray(children)?children:[children]){if(Array.isArray(child)){for(const value of child){if(value===label)return node;}}else if(child&&typeof child==="object"){const match=find(child,label);if(match)return match;}}return null;}
  async function click(label){const tree=exporter.FinanceExportControls({endpoint:"/quotes",organizationName:"Tenant",title:"Quotes",locale:"en",columns:[{key:"id",labelFr:"Référence",labelEn:"Reference",get:r=>r.id}]});const button=find(tree,label);assert(button,`Missing ${label} button`);button.props.onClick();await new Promise(resolve=>setTimeout(resolve,10));}
  for(const label of ["CSV","Excel","PDF"]){pages=[page("a"),page("b")];await click(label);const result=exports.at(-1);assert(result,JSON.stringify(notices));assert.equal(result.model.rows.length,2);assert(result.model.kpis.some(x=>x.label.startsWith("Filtered subtotal")&&x.value==="3 USD"));assert(result.model.kpis.some(x=>x.label.startsWith("Authorized general total")&&x.value==="8 USD"));assert(!result.model.kpis.some(x=>x.value==="999 USD"));assert.equal(result.model.includeCompleteSummary,true);}
  const quantity=(metric,value)=>({unitId:"unit",unit:"kg",decimalScale:6,metric,value,precisionMismatch:false});
  const stockPage=id=>({...page(id),quantityTotals:[quantity("onHand","10"),quantity("reserved","4"),quantity("sellable","6")],generalQuantityTotals:[quantity("onHand","999999999999999.999999")],physicalTotals:[{unitId:"unit",unit:"kg",value:"10",precisionMismatch:false}]});
  pages=[stockPage("a"),stockPage("b")];await click("CSV");const stockModel=exports.at(-1).model;
  assert.equal(stockModel.kpis.filter(x=>x.label.includes("On-hand stock")).length,2,"Legacy physical totals must not duplicate the new quantity scope");
  assert(stockModel.kpis.some(x=>x.label.includes("Reservations and holds")&&x.numericValue===4));
  assert(stockModel.kpis.some(x=>x.label.includes("Sellable stock")&&x.numericValue===6));
  const exactQuantity=stockModel.kpis.find(x=>x.label.startsWith("Authorized general total")&&x.label.includes("On-hand stock"));assert.equal(exactQuantity.value,"999999999999999.999999 kg");assert.equal(exactQuantity.numericValue,undefined);
  const beforeStockChange=exports.length;const stockChanged=stockPage("b");stockChanged.quantityTotals[1].value="5";pages=[stockPage("a"),stockChanged];await click("CSV");assert.equal(exports.length,beforeStockChange);assert(notices.at(-1)[0].includes("Data changed"));
  const before=exports.length;pages=[page("a"),page("b","9")];await click("CSV");assert.equal(exports.length,before);assert(notices.at(-1)[0].includes("Data changed"));
}
console.log("#1228 actual CSV/XLSX/PDF controls: all rows and filtered/general totals, page scope excluded, inconsistent snapshots rejected");
