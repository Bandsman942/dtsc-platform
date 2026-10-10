import fs from "node:fs";
import vm from "node:vm";
const read = (p) => fs.readFileSync(p, "utf8");
const check = (ok, msg) => { if (!ok) throw Error("FAIL SCALE-7J: " + msg); console.log("PASS SCALE-7J: " + msg); };
const dash=read("app/dashboard/page.tsx");
const shell=read("components/layout/app-shell.tsx");
const sales=read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
const tasks=read("app/api/enterprise/[organizationId]/tasks/route.ts");
const load=read("scripts/load/scale7-staged-certification.js");
const report=read("scripts/load/build-scale7-certification-report.mjs");
check(dash.includes("verifiedSession={session}") && dash.includes("const user = await requireUser(session);") &&
  shell.includes("verifiedSession?: SessionPayload;") && shell.includes("verifiedSession ?? await getSession()"), "verified Dashboard session reuse, fallback elsewhere");
for (const [label,src,auth] of [
  ["Shop",sales,"authorizeRetailRequest(req, organizationId"],
  ["Collaboration",tasks,'getEnterpriseCoreV2Access({ session, organizationId, moduleCode: "TASKS_OPERATIONS", action: "read" })'],
]) {
  const get=(src.split("export async function GET(")[1] || "").split("export async function POST(")[0];
  const post=(src.split("export async function POST(")[1] || "");
  check(get.includes(auth) &&
    get.includes("const accessMs = Number((performance.now() - accessStartedAt).toFixed(2));") &&
    get.includes("const dataMs = Number((performance.now() - dataStartedAt).toFixed(2));") &&
    get.includes("scale7ReadPhaseMs: { access: accessMs, data: dataMs }") &&
    get.includes('"Server-Timing"') && get.includes("access;dur=") && get.includes("data;dur=") &&
    get.includes("writeApiLog") && !post.includes("scale7ReadPhaseMs"),
    label+" preserves scoped access/audit and emits bounded timing on GET only");
}
check(sales.includes('getRetailMetricsByCurrency(organizationId, metricFrom, metricTo, "RETAIL_POS")') &&
  sales.includes("include: { lines: true, tenders: true, pricingDecisions: true, promotionRedemptions: true") &&
  tasks.includes("enterpriseTaskVisibilityWhere({ organizationId, userId: session.userId, canSeeAll: access.canSeeAll })"),
  "Shop response and Task visibility unchanged");
for (const marker of [
 'http_req_duration: ["p(95)<1000", "p(99)<2000"]',
 '"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]',
 '"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]',
 '"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]',
 'tenant_isolation_pass: ["rate==1"]',
]) check(load.includes(marker), "unchanged latency/isolation SLO "+marker);
check(load.includes("dashboardP99LimitMs") && report.includes("dashboardP99UnderPolicyLimit") &&
  report.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"),
  "temporary Dashboard and strict idle gates preserved");
const start=load.indexOf("function recordServerPhases(response, workload) {");
const end=load.indexOf("\n}\n",start);
check(start>=0 && end>start,"phase parser exists");
const samples={sa:[],sd:[],ca:[],cd:[]},ctx={};
for (const [name,key] of [["shopAccessDuration","sa"],["shopDataDuration","sd"],["collaborationAccessDuration","ca"],["collaborationDataDuration","cd"]]) ctx[name]={add:(v)=>samples[key].push(v)};
const parse=vm.runInNewContext("("+load.slice(start,end+2)+")",ctx);
parse({status:200,headers:{"Server-Timing":"access;dur=41.5, data;dur=319.25"}},"shop-read");
parse({status:200,headers:{"server-timing":"access;dur=8, data;dur=21"}},"collaboration-read");
parse({status:403,headers:{"Server-Timing":"access;dur=50, data;dur=90"}},"shop-read");
parse({status:200,headers:{"Server-Timing":"access;dur=abc, data;dur=9"}},"shop-read");
parse({status:200,headers:{}},"shop-read");
check(JSON.stringify(samples)===JSON.stringify({sa:[41.5],sd:[319.25],ca:[8],cd:[21]}),
  "parser accepts only valid successful numeric timings");
for(const metric of ["scale7_shop_access_ms","scale7_shop_data_ms","scale7_collaboration_access_ms","scale7_collaboration_data_ms"]){
  check(load.includes('new Trend("'+metric+'", true)') && report.includes('latency(summary, "'+metric+'")'),"bounded sanitized metric "+metric);
}
check(report.includes("http.serverPhases.shop.access.p95") && report.includes("http.serverPhases.collaboration.data.p95"),
  "only aggregate diagnostic phases published");
console.log("SCALE-7J QA: OK");
