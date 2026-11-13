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
// Gaming migration: every original endpoint is preserved as an identical
// Git blob, and the dispatcher has a static import + explicit method gate.
const gamingOriginalShas = {
  "app/api/enterprise/[organizationId]/gaming/bookings/[bookingId]/route.ts": "9cbb4086182206152210e63ae9ce4edf4b199db5",
  "app/api/enterprise/[organizationId]/gaming/bookings/route.ts": "1df1fa75900976ac2f8d1a97b0fa523ea0fb7b18",
  "app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/receipt/route.ts": "da9b1a237d43f0bbbb86276099318009d7c19527",
  "app/api/enterprise/[organizationId]/gaming/checkouts/[checkoutId]/route.ts": "23ff29f6fc2c6578257aa774f7277bb1b4844c9e",
  "app/api/enterprise/[organizationId]/gaming/checkouts/route.ts": "98a02600193c59ef60793c10d5e20e2d8867f5f1",
  "app/api/enterprise/[organizationId]/gaming/daily-closes/[closeId]/route.ts": "a527af96368c6ac9151ec3bc8139951a8d784389",
  "app/api/enterprise/[organizationId]/gaming/daily-closes/route.ts": "b628bcae25a10541ef8194adcd064bc49e6e0012",
  "app/api/enterprise/[organizationId]/gaming/dashboard/route.ts": "581982d48a8d939a8695fea136800fc3a20fac0b",
  "app/api/enterprise/[organizationId]/gaming/onboarding/route.ts": "caeb49449f7d2dcf079dbdc52a49f74c8150e064",
  "app/api/enterprise/[organizationId]/gaming/pricing/[ruleId]/route.ts": "ed4bfabffdc38ac3ee32abb20066a31680bebda3",
  "app/api/enterprise/[organizationId]/gaming/pricing/route.ts": "d28412e1def2f0c335c6a484c98f49629ace1ed4",
  "app/api/enterprise/[organizationId]/gaming/pricing/simulate/route.ts": "c2d530ee55ffbb86ba149563d46f9f092e6a5fd8",
  "app/api/enterprise/[organizationId]/gaming/reports/route.ts": "287b7215654afa61cf32a9c7fc7fc12364794912",
  "app/api/enterprise/[organizationId]/gaming/sessions/[sessionId]/route.ts": "e663494195a6502c0b287d53cad07c8ab01ca2b9",
  "app/api/enterprise/[organizationId]/gaming/sessions/route.ts": "0dde87451055a88340848c11c9a39819c1aa77d6",
  "app/api/enterprise/[organizationId]/gaming/stations/[stationId]/route.ts": "ba036baa1d5db07dd91c1dbf7dae8cd96308c6b8",
  "app/api/enterprise/[organizationId]/gaming/stations/candidates/route.ts": "ae2d7e8b84701e695f1d5a6bf50c822e9f6f5148",
  "app/api/enterprise/[organizationId]/gaming/stations/route.ts": "6ca712e3ec12b575715a044ec5a03b4e33e5934c",
  "app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/registrations/[registrationId]/route.ts": "27d6971d4534518de1ef09256ba23a9b44d0cb18",
  "app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/registrations/route.ts": "b89a556727aed1aa58f863ba9172beaf9488bb1b",
  "app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/route.ts": "ea96175d69ebb9e5f459d63b01cb5853d202e242",
  "app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/stations/[assignmentId]/route.ts": "7d6b2429fd59fd56a386ed97c0669277a0ce7e47",
  "app/api/enterprise/[organizationId]/gaming/tournaments/[tournamentId]/stations/route.ts": "c074c787d19c08cc9ef9abc445ad1315ab58ff01",
  "app/api/enterprise/[organizationId]/gaming/tournaments/route.ts": "e8f23bb9c5981fb70f72bd6856cb1c10e68f8803"
};
const gamingDispatcher = read("app/api/enterprise/[organizationId]/gaming/[...operation]/route.ts");
for (const [oldPath, originalSha] of Object.entries(gamingOriginalShas)) {
  const moved = oldPath.replace(/route\.ts$/, "handler.ts");
  assert.ok(!exists(oldPath), "Gaming routable original still present: " + oldPath);
  assert.ok(exists(moved), "Gaming handler missing: " + moved);
  const bytes = Buffer.from(read(moved), "utf8");
  const blobSha = crypto.createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
  assert.equal(blobSha, originalSha, "Gaming handler modified: " + moved);
  const rel = oldPath.slice("app/api/enterprise/[organizationId]/gaming/".length, -"/route.ts".length);
  assert.ok(gamingDispatcher.includes('gaming/' + rel + '/handler'), "Gaming import not allowlisted: " + rel);
}
for (const verb of ["GET", "POST", "PATCH", "OPTIONS"]) {
  assert.ok(gamingDispatcher.includes("export function " + verb + "("), "Gaming HTTP method missing: " + verb);
}
assert.ok(gamingDispatcher.includes("methodNotAllowed") && gamingDispatcher.includes('error: "Not found"'), "Gaming rejects unknown path/method");
const baseline=JSON.parse(read("docs/routing/route-budget-baseline.json"));
assert.equal(baseline.source.total,915);
console.log("ROUTES-02/03 parity OK: 33 immutable handlers, 14 Finance URLs, 24 Gaming URLs preserved by dynamic route.");
