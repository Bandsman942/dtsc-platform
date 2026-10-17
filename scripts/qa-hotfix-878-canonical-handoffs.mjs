import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const helper = read("lib/enterprise/sector-activity-canonical-handoffs.ts");
const blockLoader = read("lib/enterprise/enterprise-activity-blocks-loader.ts");
const access = read("lib/enterprise-sector-templates.ts");
const dataset = read("lib/enterprise/enterprise-activities-loader.ts");
const types = read("lib/enterprise/enterprise-activities-types.ts");
const panel = read("components/enterprise/enterprise-activities-panels.tsx");
const moduleUi = read("components/enterprise/enterprise-activities-module.tsx");
const time = read("components/enterprise/professional/enterprise-time-attendance-workspace.tsx");
const deliverables = read("components/enterprise/professional/enterprise-time-deliverables-workspace.tsx");
const requests = read("app/api/enterprise/[organizationId]/activities/route.ts");
const contract = read("lib/enterprise/sector-activity-capabilities.ts");
const registry = JSON.parse(read("lib/enterprise/module-registry-common-domains.json"));
const transpiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(transpiled, sandbox);
const resolve = sandbox.exports.canonicalSectorActivityDestination;
assert.equal(typeof resolve, "function");
assert.equal(resolve("PROFESSIONAL_SERVICES", "DECLARE_TIME_WORKED")?.moduleCode, "TIME_ATTENDANCE");
assert.equal(resolve("PROFESSIONAL_SERVICES", "SUBMIT_DELIVERABLE")?.moduleCode, "TIME_DELIVERABLES");
for (const [sector, block] of [
  ["EDUCATION", "DECLARE_TIME_WORKED"], ["NGO_ASBL", "SUBMIT_DELIVERABLE"],
  ["PROFESSIONAL_SERVICES", "SUBMIT_SUPPORTING_DOCUMENT"],
  ["PROFESSIONAL_SERVICES", "CONFIRM_DELIVERY"],
  ["PROFESSIONAL_SERVICES", "SUBMIT_TICKET"],
  ["OTHER", "DECLARE_TIME_WORKED"],
]) assert.equal(resolve(sector, block), null, "Unexpected sector/action handoff: " + sector + "/" + block);
for (const code of ["TIME_ATTENDANCE", "TIME_DELIVERABLES"]) {
  const mod = registry.modules.find((m) => m.code === code);
  assert.equal(mod?.implementationStatus, "ACTIVE");
  assert.equal(mod?.routeKind, "DEDICATED_CORE");
  assert.equal(mod?.routePath, "/enterprise-modules/" + code);
}
for (const token of ["canonicalSectorActivityDestination(sectorCode, block.blockCode)", "allowedModuleCodes.has(destination.moduleCode)"]) assert.ok(blockLoader.includes(token), token);
for (const token of ["membership.organization.sectorCode", "canonicalSectorActivityDestination(access.sectorCode, blockCode)", "moduleCode: handoff?.moduleCode || block.targetModuleCode"]) assert.ok(access.includes(token), token);
for (const token of [
  "getEnterpriseActivityBlocks(organizationId, userId, organization.sectorCode)",
  "capabilities.canRead", "capabilities.canCreate",
  "resolveEnterpriseModuleRoute(destination.moduleCode)",
  "isEnterpriseModuleNavigable(route.definition)",
  "resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: destination.moduleCode })",
  "activityAction=", "destination.intent",
]) assert.ok(dataset.includes(token), "Missing tenant gated route: " + token);
assert.ok(types.includes("canonicalActionHandoffs"));
assert.ok(moduleUi.includes("canonicalActionHandoffs={canonicalActionHandoffs}"));
for (const token of ["canonicalActionHandoffs[item.blockCode]", "canonicalHandoff.href", "canonicalHandoff && !isReady", "disabled={!isReady}"]) assert.ok(panel.includes(token), token);
assert.ok(time.includes('new URLSearchParams(window.location.search).get("activityAction") !== "DECLARE_TIME_WORKED"'));
assert.ok(time.includes("if (timesheets.canWrite) setTimesheetOpen(true)"));
assert.ok(time.includes('setTab("TIMESHEETS")'));
assert.ok(deliverables.includes('new URLSearchParams(window.location.search).get("activityAction") !== "SUBMIT_DELIVERABLE"'));
assert.ok(deliverables.includes("if (deliverables.canWrite) setCreateOpen(true)"));
for (const code of ["DECLARE_TIME_WORKED", "SUBMIT_DELIVERABLE"]) assert.ok(contract.includes(code + ': { mode: "UNAVAILABLE"'), "Old fake form must remain blocked: " + code);
assert.ok(requests.includes('"ENTERPRISE_ACTIVITY_ACTION_NOT_READY"') && requests.includes("status: 422"));
assert.ok(read("docs/HOTFIX_878_WAVE1_CANONICAL_HANDOFFS.md").includes("#878"));
console.log("Hotfix #878 wave 1 canonical destination, access and editor contracts: PASS");
