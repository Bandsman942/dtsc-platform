import fs from "node:fs";
import process from "node:process";

const files = {
  constants: "lib/enterprise/accounting/constants.ts",
  registry: "lib/enterprise/accounting/posting-registry-final.ts",
  telcoAdapter: "lib/enterprise/accounting/sector-adapters/retail-telco.ts",
  telcoAccounting: "lib/enterprise/retail/telco-accounting.ts",
  telcoRoute: "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",
  telcoReverse: "app/api/enterprise/[organizationId]/retail/telco-topups/[topupId]/reverse/route.ts",
  orchestration: "lib/enterprise/retail/operator-orchestration.ts",
  historySchema: "prisma/enterprise-retail-history.prisma",
  historyMigration: "prisma/migrations/20260821131500_retail_history_telco_posting/migration.sql",
  historyInput: "lib/enterprise/retail/historical-import-schemas.ts",
  historyService: "lib/enterprise/retail/historical-import-service.ts",
  historyWorkspace: "lib/enterprise/retail/historical-import-workspace-service.ts",
  historyRoute: "app/api/enterprise/[organizationId]/retail/historical-imports/route.ts",
  historyPreviewRoute: "app/api/enterprise/[organizationId]/retail/historical-imports/preview/route.ts",
  historyApplyRoute: "app/api/enterprise/[organizationId]/retail/historical-imports/[importId]/apply/route.ts",
  historyCopy: "lib/enterprise/retail/historical-import-copy.ts",
  historyUi: "components/enterprise/professional/retail-historical-import-panel.tsx",
  retailPage: "app/enterprise-modules/retail-page.tsx",
  guide: "docs/SHOP_HISTORICAL_IMPORT_470.md",
  finalGuide: "docs/ERP_FINAL_USER_GUIDE.md",
};

const source = {};
for (const [key, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL Fichier introuvable: ${file}`);
    process.exit(1);
  }
  source[key] = fs.readFileSync(file, "utf8");
}

const failures = [];
function requireText(key, needle, label) {
  if (!source[key].includes(needle)) failures.push(`${label}: attendu ${needle}`);
}
function forbidText(key, needle, label) {
  if (source[key].includes(needle)) failures.push(`${label}: interdit ${needle}`);
}

requireText("constants", '"RETAIL_TELCO_TOPUP_POSTED"', "événement Telco posting");
requireText("constants", '"RETAIL_TELCO_TOPUP_REVERSED"', "événement Telco reversal");
requireText("registry", "RETAIL_TELCO_TOPUP_POSTED: buildRetailTelcoTopupPosting", "registre Telco posting");
requireText("registry", "RETAIL_TELCO_TOPUP_REVERSED: buildRetailTelcoTopupReversalPosting", "registre Telco reversal");
requireText("telcoAdapter", "debit: source.topup.saleAmount", "débit encaissement Telco");
requireText("telcoAdapter", "credit: source.topup.operatorCost", "crédit float Telco");
requireText("telcoAdapter", 'accountMappingKey: "SERVICE_REVENUE"', "marge Telco sémantique");
requireText("telcoAdapter", "debit: source.topup.operatorCost", "reversal float Telco");
requireText("telcoAdapter", "credit: source.topup.saleAmount", "reversal encaissement Telco");
forbidText("telcoAdapter", 'accountMappingKey: "7', "aucun compte SYSCOHADA en dur dans l'adapter Telco");
requireText("telcoRoute", "finalizeTelcoTopupAccounting", "finalizer Telco manuel");
requireText("telcoReverse", "finalizeTelcoTopupReversalAccounting", "finalizer reversal Telco");
requireText("orchestration", "await finalizeTelcoTopupAccounting", "finalizer Telco connecté");
requireText("telcoAccounting", 'postingEvent: "RETAIL_TELCO_TOPUP_POSTED"', "posting Telco commun");
requireText("telcoAccounting", 'postingEvent: "RETAIL_TELCO_TOPUP_REVERSED"', "reversal Telco commun");

requireText("historySchema", "model EnterpriseRetailHistoricalImport", "modèle reprise historique");
requireText("historySchema", "idempotencyKey", "idempotence reprise");
requireText("historySchema", "revision", "révision reprise");
requireText("historyMigration", 'CREATE TABLE "EnterpriseRetailHistoricalImport"', "migration additive reprise");
requireText("historyMigration", '"organizationId" TEXT NOT NULL', "tenant scope migration");
requireText("historyMigration", "idempotencyKey_key", "unicité idempotence migration");
requireText("historyInput", 'kind: z.literal("MOBILE_MONEY")', "lignes historiques Mobile Money");
requireText("historyInput", 'kind: z.literal("TELCO_TOPUP")', "lignes historiques Télécom");
requireText("historyInput", "operatorCost", "coût opérateur obligatoire");
requireText("historyInput", "expectedClosingBalance", "rapprochement solde final");

requireText("historyService", "buildHistoricalPreviewTx", "preview serveur");
requireText("historyService", "RETAIL_HISTORY_BASELINE_REQUIRED", "baseline obligatoire");
requireText("historyService", "RETAIL_HISTORY_BASELINE_CHANGED", "baseline revalidée");
requireText("historyService", "RETAIL_HISTORY_CLOSING_BALANCE_MISMATCH", "rapprochement final bloquant");
requireText("historyService", "RETAIL_HISTORY_INSUFFICIENT_BALANCE", "simulation chronologique des soldes");
requireText("historyService", "RETAIL_HISTORY_LIVE_CASH_SESSION", "protection caisse live");
requireText("historyService", "RETAIL_HISTORY_OVERLAP", "protection chevauchement historique");
requireText("historyService", "RETAIL_HISTORY_SELF_APPROVAL_FORBIDDEN", "séparation préparateur/approbateur");
requireText("historyService", 'status: "CLOSED"', "session historique fermée");
requireText("historyService", 'status: "APPLYING"', "reprise retryable avant postings");
requireText("historyService", 'status: "APPLIED"', "reprise finalisée seulement après postings");
requireText("historyService", "finalizeMobileMoneyAccounting", "posting Mobile Money historique");
requireText("historyService", "finalizeTelcoTopupAccounting", "posting Telco historique");
requireText("historyService", "transactionDate: input.occurredAt", "date d'origine Treasury");
requireText("historyService", "occurredAt: prepared.occurredAt", "date d'origine opérations");
requireText("historyService", "history:${historicalImport.id}", "idempotence stable des lignes");
forbidText("historyService", "openCashSession(", "la reprise ne doit jamais ouvrir une caisse live");

requireText("historyRoute", '"RETAIL_DAILY_CLOSE", "manage"', "mutation reprise protégée par permission");
requireText("historyPreviewRoute", '"RETAIL_DAILY_CLOSE", "manage"', "preview protégé par permission");
requireText("historyApplyRoute", '"RETAIL_DAILY_CLOSE", "manage"', "application protégée par permission");
requireText("historyWorkspace", 'accountUse: { in: ["MOBILE_MONEY_FLOAT", "TELCO_FLOAT"] }', "mappings providers canoniques");

requireText("historyCopy", "fr:", "copie FR reprise");
requireText("historyCopy", "en:", "copie EN reprise");
requireText("historyUi", "Prévisualiser", "surface reprise guidée");
requireText("historyUi", "historicalImportCopy", "UI reliée au dictionnaire partagé");
requireText("historyUi", "datetime-local", "date/heure historique visible");
requireText("historyUi", "operatorCost", "coût opérateur dans UI");
requireText("retailPage", "RetailHistoricalImportPanel", "reprise accessible depuis clôture Shop");
requireText("guide", "Preview sans écriture", "documentation dry-run");
requireText("guide", "Nouveau contrat comptable TELCO_TOPUPS", "documentation posting Telco");
requireText("finalGuide", "Shop — reprise d'un historique papier", "guide utilisateur ERP mis à jour");

if (failures.length) {
  console.error("FAIL qa-470-shop-history-telco-posting");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("PASS qa-470-shop-history-telco-posting");
