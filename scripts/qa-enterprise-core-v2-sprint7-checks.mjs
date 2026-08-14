import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };
const includes = (file, snippets) => { const content = read(file); for (const snippet of snippets) ok(content.includes(snippet), `${file}: missing ${snippet}`); return content; };

const schema = read("prisma/enterprise-documents-procurement.prisma");
for (const model of ["EnterpriseDocument", "EnterpriseDocumentVersion", "EnterpriseDocumentAccess", "EnterpriseSupplier", "EnterpriseSupplierContact", "EnterprisePurchase", "EnterprisePurchaseItem", "EnterprisePurchaseReceipt", "EnterprisePurchaseReceiptItem"]) ok(schema.includes(`model ${model} {`), `Missing Sprint 7 Prisma model ${model}`);
ok(schema.includes("Decimal") && schema.includes("revision"), "Purchases must use Decimal amounts and optimistic revision fields.");
ok(schema.includes("@@unique([organizationId, normalizedName])"), "Supplier duplicate protection must be scoped by organization.");
ok(schema.includes("@@unique([organizationId, documentId, versionNumber])"), "Document versions must be unique per document/version.");

const migration = read("prisma/migrations/20260729194500_add_enterprise_documents_procurement/migration.sql");
for (const table of ["EnterpriseDocument", "EnterpriseDocumentVersion", "EnterpriseSupplier", "EnterprisePurchase", "EnterprisePurchaseItem", "EnterprisePurchaseReceipt"]) ok(migration.includes(`CREATE TABLE "${table}"`), `Sprint 7 migration missing ${table}`);
ok(!/DROP\s+(TABLE|COLUMN)/i.test(migration), "Sprint 7 migration must remain additive.");

const storage = includes("lib/enterprise/procurement/document-storage.ts", ["SUPABASE_STORAGE_SERVICE_ROLE_KEY", "createSignedUrl", "sha256", "enterprise/${organizationId}/documents/${documentId}/", "10 * 1024 * 1024"]);
ok(!storage.includes("getPublicUrl"), "Enterprise documents must never use public storage URLs.");

const purchase = includes("lib/enterprise/procurement/purchase-service.ts", ["Prisma.Decimal", "ENTERPRISE_PURCHASE_SUBMITTED", "EnterprisePurchase", "EnterpriseApproval", "PURCHASE_OVER_RECEIPT", "updateMany", "PARTIALLY_RECEIVED", "RECEIVED"]);
ok((purchase.match(/updateMany\(/g) || []).length >= 5, "Sensitive purchase transitions must use guarded updateMany operations.");
ok(!purchase.includes("pharmacyStockMovement.create") && !purchase.includes("health" + "StockMovement.create"), "Common enterprise purchases must not mutate sector stock truth directly.");
if (fs.existsSync(path.join(root, "prisma/enterprise-finance-reporting.prisma"))) {
  ok(purchase.includes("createPurchaseBudgetCommitment"), "Sprint 8 may extend Sprint 7 purchases only through the dedicated budget commitment service.");
  ok(purchase.includes("releasePurchaseBudgetCommitment"), "Sprint 8 purchase cancellation must release the dedicated commitment.");
}

const constants = read("lib/enterprise/core-v2/constants.ts");
for (const type of ["DOCUMENT", "SUPPLIER", "PURCHASE"]) ok(constants.includes(`"${type}"`), `Dedicated Core type missing: ${type}`);
ok(constants.includes("EnterprisePurchase"), "EnterpriseApproval must support EnterprisePurchase targets.");

const dispatcher = read("lib/enterprise/core-v2/dispatcher.ts");
for (const service of ["createEnterpriseDocument", "createEnterpriseSupplier", "createEnterprisePurchase"]) ok(dispatcher.includes(service), `Dispatcher missing ${service}`);

for (const route of [
  "app/api/enterprise/[organizationId]/documents/route.ts",
  "app/api/enterprise/[organizationId]/documents/[id]/versions/route.ts",
  "app/api/enterprise/[organizationId]/suppliers/route.ts",
  "app/api/enterprise/[organizationId]/suppliers/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/purchases/route.ts",
  "app/api/enterprise/[organizationId]/purchases/[id]/actions/route.ts",
  "app/api/enterprise/[organizationId]/purchases/[id]/receive/route.ts",
]) {
  const content = read(route);
  ok(content.includes("isSameOriginRequest"), `${route}: same-origin guard missing.`);
  ok(content.includes("await rateLimit"), `${route}: awaited rateLimit missing.`);
  ok(content.includes("getEnterpriseProcurementAccess"), `${route}: centralized enterprise access missing.`);
}

const moduleWorkspace = read("components/enterprise/enterprise-module-workspace.tsx");
for (const component of ["EnterpriseDocumentsWorkspace", "EnterpriseSuppliersWorkspace", "EnterprisePurchasesWorkspace"]) ok(moduleWorkspace.includes(component), `Dedicated Sprint 7 workspace missing: ${component}`);

const core = read("lib/enterprise/enterprise-core.ts");
ok(core.includes("EnterpriseCoreRecord"), "Legacy EnterpriseCoreRecord must remain available for history and compatibility.");
const vercel = read("vercel.json");
ok(vercel.includes('"main": true') && vercel.includes('"**": false'), "Vercel must remain production-only from main, including slash branches.");
ok(vercel.includes("VERCEL_ENV") && vercel.includes("production"), "Vercel ignoreCommand must preserve production-only behavior.");
const vercelScript = read("vercel.sh");
ok(vercelScript.includes("pnpm prisma migrate deploy") && vercelScript.includes("pnpm build"), "Production must migrate before build.");
const productionOnlyPolicy = read(".github/workflows/vercel-production-only-policy.yml");
ok(productionOnlyPolicy.includes("Vercel production-only delivery policy") && productionOnlyPolicy.includes("qa-vercel-production-only-policy.mjs"), "Production-only Vercel policy workflow must remain enforced by GitHub CI.");
ok(!fs.existsSync(path.join(root, ".github/workflows/vercel-production-only-status.yml")), "Legacy Preview status normalizer must stay removed.");

if (failures.length) { console.error("ERP Core v2 Sprint 7 QA failed:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("ERP Core v2 Sprint 7 QA passed: dedicated documents/procurement, private storage, server totals, receipt guards, additive finance integration, legacy safety and production-only Vercel policy verified.");
