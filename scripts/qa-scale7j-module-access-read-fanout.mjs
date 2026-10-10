import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (name) => fs.readFileSync(name, "utf8");
function expect(ok, label) {
  if (!ok) throw new Error("FAIL SCALE-7J-B: " + label);
  console.log("PASS SCALE-7J-B: " + label);
}

const access = read("lib/enterprise/module-access.ts");
const ent = read("lib/billing/entitlements.ts");
const core = read("lib/enterprise/core-v2/access.ts");
const policy = JSON.parse(read("scripts/load/scale7-dashboard-p99-policy.json"));
const load = read("scripts/load/scale7-staged-certification.js");
const report = read("scripts/load/build-scale7-certification-report.mjs");

const start = access.indexOf("export function buildCanonicalTenantModuleIndex(");
const end = access.indexOf("\n}\n", start);
expect(start >= 0 && end > start, "canonical tenant module helper exists");
const isolated = access.slice(start, end + 2);
const transformed = ts.transpileModule(isolated, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const environment = { exports: {}, normalizeEnterpriseModuleCode: (value) => value === "LEGACY_SHOP" ? "RETAIL_POS" : value };
vm.runInNewContext(transformed, environment);
const index = environment.exports.buildCanonicalTenantModuleIndex;
expect(typeof index === "function", "test actual exported canonical indexing implementation");
const legacyFirst = index([
  { id: "alias-on", moduleCode: "LEGACY_SHOP", isEnabled: true },
  { id: "canonical-off", moduleCode: "RETAIL_POS", isEnabled: false },
]);
expect(legacyFirst.tenantModuleByCanonicalCode.get("RETAIL_POS").id === "canonical-off",
  "canonical row wins over earlier enabled alias (do not elevate permission)");
expect(legacyFirst.tenantModuleByCanonicalCode.get("RETAIL_POS").isEnabled === false,
  "disabled canonical module stays disabled even if alias is enabled");
expect(legacyFirst.enabledCanonicalCodes.has("RETAIL_POS"),
  "legacy enabled dependency set still includes enabled aliases");
const canonicalFirst = index([
  { id: "canonical", moduleCode: "RETAIL_POS", isEnabled: false },
  { id: "alias", moduleCode: "LEGACY_SHOP", isEnabled: true },
]);
expect(canonicalFirst.tenantModuleByCanonicalCode.get("RETAIL_POS").id === "canonical",
  "canonical row wins over later alias");
expect(index([{ id: "normal", moduleCode: "TASKS_OPERATIONS", isEnabled: true }])
  .tenantModuleByCanonicalCode.get("TASKS_OPERATIONS").id === "normal", "standalone tenant module preserved");
expect(index([]).tenantModuleByCanonicalCode.size === 0, "empty tenant module index never grants a module");

expect(ent.includes("businessSubtypeCode: string | null;") &&
  ent.includes("businessSubtypeCode: null,") &&
  ent.includes("businessSubtypeCode,") &&
  ent.includes("modules,"),
  "entitlements carry precisely the same subtype and module snapshot");
expect(access.includes("const [membership, entitlements] = await Promise.all([") &&
  access.includes("getOrganizationEntitlements(organizationId)") &&
  access.includes("entitlements.modules, null") &&
  access.includes("buildCanonicalTenantModuleIndex(tenantModules)"),
  "authorization uses authoritative entitlement modules rather than re-reading tables");
expect(access.includes("if (!membership || membership.organization.deletedAt") &&
  access.includes('membership.organization.status !== "ACTIVE"') &&
  access.includes('membership.organization.organizationType !== "CLIENT"') &&
  access.includes('where: { userId, organizationId, status: "ACTIVE", removedAt: null }'),
  "active same-tenant membership and organization status are still required");
expect(access.includes("const [tenantModules, subtypeSelection] = entitlements") &&
  access.includes("prisma.enterpriseModule.findMany({") &&
  access.includes("prisma.enterpriseBusinessSubtypeSelection.findUnique({") &&
  access.includes("entitlements.businessSubtypeCode"),
  "legacy denied outcomes retained via conditional fail-closed fallback");
for (const marker of [
  "getActiveEnterpriseModuleRestriction(",
  "isEnterpriseModuleSectorCompatible(",
  "isEnterpriseModuleBusinessSubtypeCompatible(",
  'return denied("TENANT_MODULE_DISABLED"',
  'return denied("ENTITLEMENT_DENIED"',
  'return denied("PERMISSION_DENIED"',
  "permissionsAllowAction(",
]) expect(access.includes(marker), "access barrier kept: " + marker);
expect(core.includes("const [membership, capabilities] = await Promise.all([") &&
  core.includes("requireEnterpriseMembership(session, organizationId)") &&
  core.includes("resolveEnterpriseModuleCapabilities({ userId: session.userId, organizationId, moduleCode })") &&
  core.includes("if (!membership || !capabilityAllowsAction(capabilities, action)) return null;") &&
  core.includes("canSeeAll: capabilities.canApprove || capabilities.canManage"),
  "Collaboration overlaps reads while retaining both independent authorizations");
expect(policy.standardP99Ms === 2000 && policy.temporary.p99Ms === 2500 &&
  policy.temporary.targetVus === 500 &&
  policy.temporary.expiresAt === "2026-11-10T00:00:00.000Z", "temporary Dashboard policy unchanged");
for (const threshold of [
  'http_req_duration: ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:enterprise-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:shop-read}": ["p(95)<1000", "p(99)<2000"]',
  '"http_req_duration{workload:collaboration-read}": ["p(95)<1000", "p(99)<2000"]',
  'tenant_isolation_pass: ["rate==1"]',
]) expect(load.includes(threshold), "critical SLO/isolation remains strict: " + threshold);
expect(report.includes("infrastructure.maxIdleInTransaction != null && infrastructure.maxIdleInTransaction === 0"),
  "idle-in-transaction stays strictly zero");
console.log("SCALE-7J-B canonical rights and DB-fanout contracts: OK");
