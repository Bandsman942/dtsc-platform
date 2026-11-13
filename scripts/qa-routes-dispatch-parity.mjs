import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const root=process.cwd();
const read=p=>fs.readFileSync(root+"/"+p,"utf8");
const exists=p=>fs.existsSync(root+"/"+p);
const shas={
  "app/api/admin/exports/audit/route.ts": "f3cd1ce75389673088b3218f72de957ed4ac103e",
  "app/api/admin/exports/organizations/route.ts": "dabb3f3cc3c84d3abedb29eac8526959b3e78835",
  "app/api/admin/exports/payments/route.ts": "c043750e6269ffbd341fedf05c0e90325a493adb",
  "app/api/admin/exports/users/route.ts": "1b201a370b13d9f567f6703e437e26474cfd7fd6",
  "app/api/enterprise/[organizationId]/insurance-connectors/invoices/route.ts": "3702f1f4259f21573951a0ded554864e90c98fff",
  "app/api/enterprise/[organizationId]/insurance-connectors/invoices/status/route.ts": "9660cae72e550284405e09f8750d6e254f17ce22",
  "app/api/enterprise/[organizationId]/insurance-connectors/ocr/route.ts": "3459e3056d974dbbfa3cba5ed1c6fe7e1a1d0594",
  "app/api/enterprise/[organizationId]/insurance-connectors/ocr/status/route.ts": "2a7dc2402066884f45fe15f8ca2095dad2206a99",
  "app/api/enterprise/[organizationId]/insurance-connectors/verify/route.ts": "a3f3389dc5b451f0f568e2100cbb4abdd52acedc"
};
for(const [original,expected] of Object.entries(shas)){
  const moved=original.replace(/route\.ts$/,"handler.ts");
  assert.ok(!exists(original),"Legacy routable endpoint still exists: "+original);
  assert.ok(exists(moved),"Missing original handler: "+moved);
  const source=read(moved);
  const buffer=Buffer.from(source,"utf8");
  const hash=crypto.createHash("sha1").update("blob "+buffer.byteLength+"\0").update(buffer).digest("hex");
  assert.equal(hash,expected,"ROUTES-02 altered legacy handler behavior: "+moved);
}
const admin=read("app/api/admin/exports/[dataset]/route.ts");
for(const name of ["audit","organizations","payments","users"]){
  assert.ok(admin.includes('admin/exports/'+name+'/handler'),"Admin exports not allowlisted: "+name);
}
const hirms=read("app/api/enterprise/[organizationId]/insurance-connectors/[...operation]/route.ts");
for(const name of ["verify","ocr","ocr/status","invoices","invoices/status"]){
  assert.ok(hirms.includes('case "'+name+'":'),"HIRMS route missing: "+name);
}
for(const check of ["return original.GET(req, ctx)", "return original.POST(req, ctx)", "methodNotAllowed", "case \"verify\""]){
  assert.ok(hirms.includes(check),"HIRMS method contract missing: "+check);
}
assert.ok(hirms.includes('default:'),"Unknown HSL API routes must be denied");
const page=read("app/enterprise-modules/[moduleCode]/page.tsx");
for(const code of ["FINANCE_ACCOUNTING","FINANCE_ASSETS","FINANCE_BANK","FINANCE_CASH","FINANCE_CLOSE","FINANCE_INVENTORY","FINANCE_OVERVIEW","FINANCE_PAYABLES","FINANCE_PAYMENTS","FINANCE_RECEIVABLES","FINANCE_RECONCILIATION","FINANCE_STATEMENTS","FINANCE_TAX","FINANCE_TREASURY"]){
  assert.ok(!exists("app/enterprise-modules/"+code+"/page.tsx"),"Static finance route still exists: "+code);
  assert.ok(page.includes('"'+code+'"'),"Dedicated finance UI not mapped: "+code);
}
assert.ok(page.includes("EnterpriseFinanceModulePage") && page.includes("FINANCE_ROUTE_CODES.has(requestedModuleCode)"),"Original finance security/UX not preserved");
const baseline=JSON.parse(read("docs/routing/route-budget-baseline.json"));
assert.equal(baseline.source.total,914);
console.log("ROUTES-02/03 parity OK: 9 immutable handlers, 14 Finance URLs preserved by dynamic route.");
