import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const service = read("lib/console/internal-register-page.ts");
const route = read("app/api/admin/internal-registers/[section]/[datasetId]/route.ts");
const client = read("components/admin/operations-admin-panel.tsx");
const schema = read("prisma/schema.prisma");

const modelNames = {
  department: "Department", financialAccount: "FinancialAccount", dtscPosition: "DtscPosition", hrcfoEmployee: "HrcfoEmployee", hrcfoBudget: "HrcfoBudget", hrcfoExpense: "HrcfoExpense", hrcfoPayroll: "HrcfoPayroll",
  materialItem: "MaterialItem", scoVendor: "ScoVendor", scoPurchaseRequest: "ScoPurchaseRequest", scoInventoryItem: "ScoInventoryItem", scoAsset: "ScoAsset", scoLogisticsEvent: "ScoLogisticsEvent",
  cooOperation: "CooOperation", cooTask: "CooTask", cooRecurringTask: "CooRecurringTask", cooDepartmentRequest: "CooDepartmentRequest", cooBlocker: "CooBlocker", cooMeeting: "CooMeeting", cooWorkflow: "CooWorkflow", cooOperationalReport: "CooOperationalReport",
  ceoObjective: "CeoObjective", ceoSupervisionLog: "CeoSupervisionLog", mpoProject: "MpoProject", mpoProjectRecord: "MpoProjectRecord", ctoTechnicalProject: "CtoTechnicalProject", ctoTechnicalRecord: "CtoTechnicalRecord",
  legalCase: "LegalCase", legalContract: "LegalContract", legalTemplate: "LegalTemplate", legalRisk: "LegalRisk", legalDocument: "LegalDocument", legalDispute: "LegalDispute", legalRequest: "LegalRequest", legalReport: "LegalReport",
};

const registered = [...service.matchAll(/source: prisma\.(\w+), search: \[([^\]]+)\]/g)];
assert.equal(registered.length, 35, "Every internal operations register needs an explicit allowlisted model");
for (const [, sourceName, searchFields] of registered) {
  const model = modelNames[sourceName];
  assert.ok(model, `Unexpected Prisma delegate: ${sourceName}`);
  const start = schema.indexOf(`model ${model} {`);
  assert.ok(start >= 0, `Missing schema model ${model}`);
  const block = schema.slice(start, schema.indexOf("\n}", start));
  const fields = new Map(block.split("\n").map((line) => line.trim().split(/\s+/)).map(([name, type]) => [name, type]));
  for (const name of ["id", "status", "createdAt"]) assert.ok(fields.has(name), `${model}.${name} required`);
  for (const field of JSON.parse(`[${searchFields}]`)) {
    assert.match(fields.get(field) || "", /^String\??$/, `Search field ${model}.${field} must be a string`);
  }
}
for (const section of ["hr-cfo", "sco", "coo", "ceo", "mpo", "cto", "legal"]) assert.ok(service.includes(`${section}: {`) || service.includes(`"${section}": {`));
for (const amountField of ["openingBalance", "currentBalance", "spentAmount", "grossAmount", "netAmount"]) {
  assert.ok(service.includes(`"${amountField}"`), `Exact numeric amount search must cover ${amountField}`);
}
assert.match(service, /predicates\.push\(\{ \[field\]: numeric \}\)/);

for (const requirement of [
  "requireAdminBlockAccess", "isInternalRegisterSection", "isAllowedInternalRegister", "rateLimit", "querySchema.safeParse", "Cache-Control",
]) assert.ok(route.includes(requirement), `API lacks ${requirement}`);
for (const requirement of [
  "Promise.all", "reader.count", "reader.groupBy", "reader.findMany", 'createdAt: "desc"', 'id: "desc"', "skip:", "take:", "Math.min(25",
]) assert.ok(service.includes(requirement), `Server pagination lacks ${requirement}`);
for (const requirement of [
  "AbortController", "debouncedQuery", "statusCounts", "allCount", "onPageChange={setPage}", "registerRevision", 'params.set("from"', 'params.set("to"',
]) assert.ok(client.includes(requirement), `Client pagination lacks ${requirement}`);
assert.doesNotMatch(client, /useSmartList\(\{ items: statusRecords/);

console.log(`Internal register pagination contract: PASS (${registered.length} models, seven sections, RBAC, server filters/counts/page, client invalidation)`);
