import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const read = (pathName) => fs.readFileSync(path.join(process.cwd(), pathName), "utf8");
const handoff = read("lib/enterprise/sector-activity-canonical-handoffs.ts");
const catalog = read("lib/enterprise/sector-activity-capabilities.ts");
const activityContract = read("lib/enterprise/enterprise-activity-form-contract.ts");
const activityApi = read("app/api/enterprise/[organizationId]/activities/route.ts");
const blocks = read("lib/enterprise/enterprise-activity-blocks-loader.ts");
const access = read("lib/enterprise-sector-templates.ts");
const dataset = read("lib/enterprise/enterprise-activities-loader.ts");
const panels = read("components/enterprise/enterprise-activities-panels.tsx");
const manufacturingUi = read("components/enterprise/manufacturing/enterprise-manufacturing-workspace.tsx");
const ordersApi = read("app/api/enterprise/[organizationId]/manufacturing/orders/[orderId]/route.ts");
const service = read("lib/enterprise/manufacturing/production-service.ts");
const validator = read("lib/enterprise/manufacturing/validators.ts");
const registry = JSON.parse(read("lib/enterprise/module-registry-manufacturing.json"));
const compile = ts.transpileModule(handoff, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const sandbox = { exports: {} }; vm.runInNewContext(compile.outputText, sandbox);
const get = sandbox.exports.canonicalSectorActivityDestination;
assert.equal(typeof get, "function");
assert.equal(get("MANUFACTURING", "DECLARE_PRODUCTION")?.moduleCode, "PRODUCTION_EXECUTION");
assert.equal(get("MANUFACTURING", "DECLARE_PRODUCTION")?.intent, "DECLARE_PRODUCTION");
for (const [sector, code] of [
  ["COMMERCE_RETAIL", "DECLARE_PRODUCTION"], ["AGRI_FOOD", "DECLARE_PRODUCTION"],
  ["MANUFACTURING", "REPORT_MACHINE_FAILURE"], ["MANUFACTURING", "REPORT_QUALITY_DEFECT"],
  ["EDUCATION", "ENTER_GRADES"], [null, "DECLARE_PRODUCTION"],
]) assert.equal(get(sector, code), null, "Sector/action boundary must be explicit: " + sector + "/" + code);
for (const [sector,code,expected] of [
  ["PROFESSIONAL_SERVICES", "DECLARE_TIME_WORKED", "TIME_ATTENDANCE"],
  ["PROFESSIONAL_SERVICES", "SUBMIT_DELIVERABLE", "TIME_DELIVERABLES"],
]) assert.equal(get(sector,code)?.moduleCode, expected, "#880 already accepted handoffs must survive");
const target = registry.modules.find((item) => item.code === "PRODUCTION_EXECUTION");
assert.equal(target?.implementationStatus, "ACTIVE");
assert.equal(target?.routePath, "/enterprise-modules/PRODUCTION_EXECUTION");
assert.equal(target?.workspaceKey, "ENTERPRISE_MANUFACTURING");
assert.ok(Array.isArray(target?.applicableSectors) && target.applicableSectors.includes("MANUFACTURING"));
assert.equal(target?.accessPolicy, "POSITION_PERMISSION");
assert.ok(catalog.includes('DECLARE_PRODUCTION: { mode: "UNAVAILABLE"'));
assert.ok(activityContract.includes("getSectorActivityCapability(sectorCode, blockCode)"), "Legacy Activities POST must not turn into a real production write");
assert.ok(activityApi.includes('"ENTERPRISE_ACTIVITY_ACTION_NOT_READY"') && activityApi.includes("status: 422"), "Fake Activities POST must stay blocked");
for (const token of [
  "canonicalSectorActivityDestination(sectorCode, block.blockCode)",
  "allowedModuleCodes.has(destination.moduleCode)",
]) assert.ok(blocks.includes(token), "Canonical entitlement guard missing: " + token);
for (const token of [
  "membership.organization.sectorCode",
  "canonicalSectorActivityDestination(access.sectorCode, blockCode)",
  "moduleCode: handoff?.moduleCode || block.targetModuleCode",
]) assert.ok(access.includes(token), "Sector/membership RBAC guard missing: " + token);
for (const token of [
  "resolveEnterpriseModuleCapabilities({ userId, organizationId, moduleCode: destination.moduleCode })",
  "capabilities.canRead", "capabilities.canCreate", "capabilities.canWrite",
  "isEnterpriseModuleNavigable(route.definition)", "resolveEnterpriseModuleRoute(destination.moduleCode)",
  "activityAction=", "destination.intent",
]) assert.ok(dataset.includes(token), "Handoff not fail-closed: " + token);
for (const token of ["canonicalActionHandoffs[item.blockCode]", "canonicalHandoff && !isReady", "canonicalHandoff.href"]) assert.ok(panels.includes(token));
for (const token of [
  'initialFocus === "PRODUCTION_EXECUTION"',
  '.get("activityAction") === "DECLARE_PRODUCTION"',
  'id="manufacturing-production-execution-record"',
  'recordExecutionFromOrder',
  'orderMutate(executionOrder.id, "RECORD_EXECUTION"',
  'executionOrder.status !== "IN_PROGRESS"',
  'data.capabilities.canWrite',
  'executionIdempotencyKey.current ||= crypto.randomUUID()',
  'if (result) {',
  'quantityCompleted:',
  'minutesWorked:',
  'recordExecutionFromOrder(event)',
  'RECEIVE_OUTPUT',
  'CONSUME_MATERIAL',
]) assert.ok(manufacturingUi.includes(token), "Dedicated execution form or workflow is missing: " + token);
assert.ok(manufacturingUi.includes("ne modifie pas le stock") && manufacturingUi.includes("does not receive finished goods"), "The execution journal must not masquerade as stock receipt");
assert.ok(ordersApi.includes('action: "write"') && ordersApi.includes('moduleCode: "PRODUCTION_EXECUTION"') && ordersApi.includes('recordProductionExecution(organizationId, orderId'), "Write must use canonical manufacturing API");
assert.ok(ordersApi.includes('manufacturingExecutionRecordSchema.safeParse') && ordersApi.includes("authorizeManufacturingRequest"), "Zod and RBAC must remain server authority");
for (const token of [
  'organizationId, idempotencyKey: input.idempotencyKey',
  'order.status !== "IN_PROGRESS"',
  'requireProductionOrder(tx, organizationId, orderId)',
  'validateExecutionReferences(tx, organizationId, order, input)',
  'addEnterpriseOperationalEvent(tx,',
]) assert.ok(service.includes(token), "Production service safety must be preserved: " + token);
assert.ok(validator.includes('executionType: z.enum(["OPERATION_START", "OPERATION_COMPLETE", "LABOR"])'));
assert.ok(read("docs/HOTFIX_882_MANUFACTURING_EXECUTION_HANDOFF.md").includes("#882"));
console.log("Hotfix #882: Manufacturing declaration opens a canonical authorized execution form; legacy POST fail-closed, tenant/order/idempotency and no fake output receipt: PASS");
