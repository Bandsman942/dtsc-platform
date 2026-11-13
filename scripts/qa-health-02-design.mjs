import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const admin=read("components/enterprise/healthcare-admin-workspace.tsx");
const modules=["PATIENTS","APPOINTMENTS","CONSULTATIONS","MEDICAL_RECORDS","CARE_TEAM","LABORATORY","INTERNAL_PHARMACY","MEDICAL_BILLING","INSURANCE_COVERAGE","QUALITY_INCIDENTS","MEDICAL_DOCUMENTS"];
for(const code of modules){
  assert.ok(admin.includes('code: "'+code+'"'),"Missing canonical section "+code);
  assert.ok(admin.includes('"'+code+'":')||admin.includes(code+':{label:'),"English module label missing "+code);
  assert.ok(admin.includes('activeModuleCode === "'+code+'"'),"Missing active section rendering "+code);
}
assert.ok(admin.includes('grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'),"Compact responsive section cards missing");
assert.ok(admin.includes('aria-label={inEnglish?"Healthcare modules":"Modules du secteur Santé"}'),"Module directory needs accessible landmark");
assert.ok(admin.includes('focus-visible:outline'),"Module directory needs keyboard focus");
assert.ok(admin.includes('Retour aux modules'),"Fullscreen back navigation missing");
assert.ok(admin.includes('Changer de module'),"Compact module switcher missing");
assert.ok(admin.includes("setModuleSearch"),"Section search missing");
assert.ok(admin.includes('Aucun module Santé ne correspond'),"Section search empty-state missing");
assert.ok(!admin.includes('w-64 shrink-0 rounded-2xl border p-4 text-left transition'),"Legacy scroll-only navigation must not remain");
assert.ok(admin.includes('setActiveModuleCode("HEALTH_DASHBOARD")'),"Entitlement change must reset active section");
assert.ok(read("scripts/qa-regression-checks.mjs").includes("qa-health-02-design.mjs"),"Regression runner must include HEALTH-02");
const sectorRouter=read("components/enterprise/enterprise-sector-module-workspace.tsx");
assert.match(sectorRouter,/data-health-sector-nav/,"Actual module routes must render the common health navigation");
assert.match(sectorRouter,/definition\.routeKind === "SECTOR_HEALTH"/,"Health navigation must never render for Pharmacy or other sectors");
assert.match(sectorRouter,/enabledModuleCodes\.includes\(m\.code\)/,"Health navigation can only show entitled modules");
assert.match(sectorRouter,/aria-current=\{module\.code===moduleCode/,"Accessible current health module marker required");
assert.match(sectorRouter,/role="status"/,"Search empty-state feedback required");
for(const code of modules)assert.ok(sectorRouter.includes('{code:"'+code+'"'),"Healthcare section missing from real routes: "+code);
console.log("✅ HEALTH-02 navigation : 11 modules, cartes compactes, recherche, clavier et accès responsive");
