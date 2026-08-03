import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const checks = [];

function check(condition, message) {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) failures.push(message);
}

function requireFile(file) {
  check(exists(file), `${file} existe`);
  return exists(file) ? read(file) : "";
}

function requireTokens(file, tokens) {
  const content = requireFile(file);
  for (const token of tokens) check(content.includes(token), `${file} contient ${token}`);
  return content;
}

const requiredDocs = [
  "docs/ERP_CROSS_MODULE_CONSOLIDATION_AUDIT.md",
  "docs/ERP_CANONICAL_ENTITY_OWNERSHIP.md",
  "docs/ERP_CROSS_MODULE_RELATION_MATRIX.md",
  "docs/ERP_CROSS_MODULE_EVENT_CATALOG.md",
  "docs/ERP_CROSS_MODULE_WORKFLOWS.md",
  "docs/ERP_CROSS_MODULE_DEEP_LINKS.md",
  "docs/ERP_CROSS_MODULE_PERMISSION_MATRIX.md",
  "docs/ERP_CROSS_MODULE_FINANCIAL_MAPPING.md",
  "docs/ERP_CROSS_MODULE_DOCUMENT_MODEL.md",
  "docs/ERP_CROSS_MODULE_NOTIFICATION_MODEL.md",
  "docs/ERP_USER_GUIDES_INVENTORY.md",
  "docs/ERP_FINAL_CONSOLIDATION_USER_GUIDE.md",
  "docs/MANUAL_E2E_ERP_FINAL_CONSOLIDATION.md",
  "docs/ERP_FINAL_CONSOLIDATION_AUDIT.md",
  "docs/ERP_FINAL_COMMERCIAL_READINESS_MATRIX.md",
  "docs/ERP_FINAL_CONSOLIDATION_CLOSURE_REPORT.md",
  "docs/CHANGELOG_ERP_FINAL_CONSOLIDATION.md",
];

function baseChecks() {
  requireTokens("prisma/enterprise-cross-module.prisma", [
    "model EnterpriseCrossModuleProjection",
    "organizationId",
    "domainEventId",
    "consumerCode",
    "attemptCount",
    "retryRequestedByUserId",
    "@@unique([organizationId, domainEventId, consumerCode])",
  ]);
  requireTokens("prisma/migrations/20260803013000_add_erp_cross_module_projection_control/migration.sql", [
    "CREATE TABLE \"EnterpriseCrossModuleProjection\"",
    "CREATE UNIQUE INDEX",
  ]);
  requireTokens("lib/enterprise/cross-module/event-catalog.ts", [
    "SALES_INVOICE_ISSUED",
    "SUPPLIER_INVOICE_POSTED",
    "PAYMENT_CONFIRMED",
    "PAYROLL_RUN_APPROVED",
    "PROJECT_DELIVERABLE_ACCEPTED",
    "ASSET_ACCOUNTING_PROFILE_CREATED",
    "HEALTH_MEDICAL_INVOICE_CREATED",
    "PHARMACY_SALE_INVOICE_CREATED",
  ]);
  requireTokens("lib/enterprise/cross-module/projection-service.ts", [
    "processCrossModuleProjections",
    "retryCrossModuleProjection",
    "listCrossModuleProjections",
    "enterpriseEntityLink",
    "Serializable",
  ]);
  requireTokens("lib/enterprise/workflows/domain-events.ts", ["metadataIdentity", "idempotencyKey", "P2002"]);
  requireTokens("lib/enterprise/workflows/worker.ts", ["processCrossModuleProjections", "projectionFailures"]);
}

function modeChecks(mode) {
  if (["all", "cross-module-consolidation", "canonical-entity-ownership", "workflows", "idempotence", "financial-integrity", "sector-integrity"].includes(mode)) baseChecks();
  if (["all", "deep-links"].includes(mode)) requireTokens("lib/enterprise/cross-module/deep-links.ts", ["recordId", "entityType", "tab", "section", "action", "returnTo"]);
  if (["all", "permissions"].includes(mode)) {
    requireTokens("app/api/enterprise/[organizationId]/erp-projections/route.ts", ["authorizeFinanceRequest", "FINANCE_OVERVIEW", "view"]);
    requireTokens("app/api/enterprise/[organizationId]/erp-projections/[projectionId]/retry/route.ts", ["authorizeFinanceRequest", "manage", "mutation: true", "writeAuditLog"]);
  }
  if (["all", "documents"].includes(mode)) requireTokens("docs/ERP_CROSS_MODULE_DOCUMENT_MODEL.md", ["upload", "classification", "médical", "version"]);
  if (["all", "comments"].includes(mode)) requireTokens("docs/ERP_CROSS_MODULE_WORKFLOWS.md", ["commentaires", "correction", "décision"]);
  if (["all", "notifications"].includes(mode)) requireTokens("docs/ERP_CROSS_MODULE_NOTIFICATION_MODEL.md", ["deep link", "déduplication", "confidentialité"]);
  if (["all", "plan-module-alignment", "navigation"].includes(mode)) {
    requireTokens("docs/ERP_CROSS_MODULE_RELATION_MATRIX.md", ["registre canonique", "plan", "dépendances"]);
    requireTokens("docs/ERP_CROSS_MODULE_DEEP_LINKS.md", ["recordId", "retour"]);
  }
  if (["all", "user-guides"].includes(mode)) {
    requireTokens("docs/ERP_USER_GUIDES_INVENTORY.md", ["FINANCE_OVERVIEW", "HEALTH", "PHARMACY", "Guide"]);
    requireTokens("docs/ERP_FINAL_CONSOLIDATION_USER_GUIDE.md", ["reprise", "liens croisés", "mobile"]);
  }
  if (["all", "french-language"].includes(mode)) requireTokens("docs/ERP_FINAL_CONSOLIDATION_USER_GUIDE.md", ["français", "message utilisateur"]);
  if (["all", "mobile"].includes(mode)) requireTokens("docs/ERP_FINAL_CONSOLIDATION_USER_GUIDE.md", ["320 px", "rail horizontal", "tableaux"]);
  if (["all", "commercial-readiness"].includes(mode)) {
    const matrix = requireTokens("docs/ERP_FINAL_COMMERCIAL_READINESS_MATRIX.md", ["COMMERCIAL_READY", "validation manuelle", "déclassement"]);
    check(!/Tests E2E réussis/i.test(matrix), "La matrice ne prétend pas que les E2E manuels ont réussi");
  }
  if (mode === "all") {
    for (const doc of requiredDocs) requireFile(doc);
    const manual = requireTokens("docs/MANUAL_E2E_ERP_FINAL_CONSOLIDATION.md", ["NON_EXÉCUTÉ", "Vente complète", "Achat complet", "RH et paie", "Health", "Pharmacy", "Relations avec les entreprises"]);
    check(!/Tests E2E réussis/i.test(manual), "Le plan E2E ne contient aucune réussite inventée");
  }
}

export async function runAudit(mode = "all") {
  modeChecks(mode);
  for (const item of checks) console.log(`${item.ok ? "✓" : "✗"} ${item.message}`);
  if (failures.length) {
    console.error(`\n${failures.length} contrôle(s) en échec pour ${mode}.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAudit ERP final ${mode}: OK (${checks.length} contrôles).`);
  }
}
