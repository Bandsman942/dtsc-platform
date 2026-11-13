import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const {hirmsCsvCell,parseHirmsHistoryQuery,utcSubmittedAtRange}=await import("../lib/enterprise/health-insurance-connectors/history-filters.ts");

const good=parseHirmsHistoryQuery(new URL("https://dtsc-platform.com/?environment=UAT&status=QUEUED&search=ABC-22&from=2026-11-01&to=2026-11-13"));
assert.equal(good?.status,"QUEUED");
assert.equal(good?.search,"ABC-22");
assert.ok(utcSubmittedAtRange(good).gte instanceof Date);
assert.equal(utcSubmittedAtRange(good).lte.toISOString(),"2026-11-13T23:59:59.999Z");
assert.equal(parseHirmsHistoryQuery(new URL("https://dtsc-platform.com/?status=INVALID")),null);
assert.equal(parseHirmsHistoryQuery(new URL("https://dtsc-platform.com/?from=2026-02-30")),null);
assert.equal(parseHirmsHistoryQuery(new URL("https://dtsc-platform.com/?from=2026-11-13&to=2026-11-01")),null);
for(const dangerous of ["=1+1","+SUM(A1:A2)","-1+2","@cmd","  =HYPERLINK(1)"]) {
  assert.ok(hirmsCsvCell(dangerous).includes("'${dangerous.replaceAll('"','""')}"),"CSV formula injection: "+dangerous);
}
assert.equal(hirmsCsvCell('a"b'),'"a""b"');

const invoice=read("app/api/enterprise/[organizationId]/insurance-connectors/invoices/route.ts");
const ocr=read("app/api/enterprise/[organizationId]/insurance-connectors/ocr/route.ts");
for(const route of [invoice,ocr]){
  for(const marker of ["parseHirmsHistoryQuery","hirmsCsv","writeAuditLog","organizationId","getSession","statusCounts"]) {
    if(marker==="statusCounts")continue; // generated in the scoped service
    assert.ok(route.includes(marker),marker);
  }
  assert.ok(route.includes("X-Export-Limit"),"Bound exported rows");
  assert.ok(route.includes("format === \"csv\""),"CSV export must be opt-in");
  assert.ok(route.includes('Cache-Control'),"No cache of tenant documents");
}
for(const path of ["lib/enterprise/health-insurance-connectors/invoice-service.ts","lib/enterprise/health-insurance-connectors/ocr-service.ts"]){
  const source=read(path);
  for(const marker of ["groupBy","statusCounts","organizationId","environment","utcSubmittedAtRange", "safeSize"]) assert.ok(source.includes(marker),path+" "+marker);
}
const nav=read("components/enterprise/hirms-workspace-navigation.tsx");
for(const name of ["connectors","verify","invoices","ocr"]) assert.ok(nav.includes('key:"'+name+'"'),"Missing view "+name);
for(const name of ["health-insurance-connector-workspace","insurance-member-verify-workspace","hirms-invoice-submission-workspace","hirms-ocr-workspace"]){
  assert.ok(read("components/enterprise/"+name+".tsx").includes("HirmsWorkspaceNavigation"),name+" disconnected from navigation");
}
for(const name of ["hirms-invoice-submission-workspace","hirms-ocr-workspace"]){
  const src=read("components/enterprise/"+name+".tsx");
  for(const marker of ["HirmsHistoryControls","HirmsStatusIndicator","downloadHirmsCsv","hirmsHistoryParams"])assert.ok(src.includes(marker),name+" "+marker);
}
const template=read("lib/enterprise/health-insurance-connectors/hirms-invoice-template.ts");
for(const marker of ["hirmsEndpoints(environment).api","/api/invoices/standard-template","assertHirmsEnvironmentEnabled","organizationId_adapterCode_environment","TEMPLATE_MAX_BYTES","getHirmsAccessToken"])assert.ok(template.includes(marker),marker);
assert.ok(!template.includes("localhost") && !template.includes("http://"),"Do not permit untrusted HSL hosts");
console.log("✅ #1132 HIRMS UX: four routed views, server status rail, bounded history and CSV, formula escaping and official HSL template.");
