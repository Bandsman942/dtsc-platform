import fs from "node:fs";
import process from "node:process";

const frPath = "locales/enterprise-finance.fr.json";
const enPath = "locales/enterprise-finance.en.json";
const cashPath = "components/enterprise/professional/enterprise-finance-cash-bank-reconciliation-workspace.tsx";
const advancedPath = "components/enterprise/professional/enterprise-advanced-finance-workspace.tsx";
const onboardingPath = "components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx";

const fr = JSON.parse(fs.readFileSync(frPath, "utf8"));
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const cash = fs.readFileSync(cashPath, "utf8");
const advanced = fs.readFileSync(advancedPath, "utf8");
const onboarding = fs.readFileSync(onboardingPath, "utf8");

let failed = false;
function check(condition, message) {
  if (condition) console.log(`PASS ${message}`);
  else { failed = true; console.error(`FAIL ${message}`); }
}

check(JSON.stringify(Object.keys(fr).sort()) === JSON.stringify(Object.keys(en).sort()), "enterprise-finance FR/EN conserve une parité stricte des clés");

for (const key of [
  "cashCsvNoRows", "cashCsvRequiredColumns", "cashDetailUnavailable", "cashSessionOpened", "cashCloseSubmitted",
  "statementImported", "reconciliationPrepared", "matchRecorded", "cashOperations", "bankAndStatements",
  "financialReconciliation", "professionalCash", "bankStatementsTitle", "bankFinanceReconciliationTitle",
  "cashCloseAssistant", "independentValidation", "newMatch", "advancedFinance", "advancedFinanceDescription",
  "accountingSections", "accountingMetrics", "accountingSearchPlaceholder", "chartsOfAccounts", "fiscalYears",
  "journalEntries", "generalLedger", "trialBalance", "postingRules", "taxCodesRates", "financialCloses",
  "fixedAssetRegister", "accountingOnboarding", "configureValidateActivate", "accountingOnboardingDescription",
  "companyChart", "chartVersion", "applyChartVersion", "configureRecommendedJournals", "activateAccounting",
]) {
  check(typeof fr[key] === "string" && fr[key].length > 0 && typeof en[key] === "string" && en[key].length > 0, `${key} existe et n'est pas vide dans les deux catalogues`);
}

check(cash.includes("translateEnterpriseFinance"), "Caisse/Banque/Rapprochement utilise le catalogue enterprise-finance");
check(cash.includes('parseBankCsv(await file.text(), locale)'), "Le parseur CSV reçoit explicitement la locale active");
check(cash.includes('cashT(locale, "cashCsvNoRows")'), "L'erreur CSV sans lignes est localisée par catalogue");
check(cash.includes('cashT(locale, "cashCsvRequiredColumns")'), "L'erreur de colonnes CSV est localisée par catalogue");
check(cash.includes('description={locale === "en" ? definition.descriptionEn : definition.descriptionFr}'), "Le header Caisse/Banque/Rapprochement sélectionne la description selon la locale");
check(!cash.includes('description={definition.descriptionFr}'), "La description française n'est plus forcée en interface EN");
check(!cash.includes('throw new Error("Le fichier CSV'), "Le parseur ne contient plus de fallback CSV français codé en dur");
check(!cash.includes('throw new Error("Colonnes requises'), "Le parseur ne contient plus de fallback colonnes français codé en dur");
check(cash.includes('/cash-sessions/${closeTarget.id}/close'), "Le contrat API de clôture caisse est conservé");
check(cash.includes('/cash-sessions/${validateTarget.id}/validate'), "Le contrat API de validation caisse est conservé");
check(cash.includes('/reconciliations/${matchTarget.id}/matches'), "Le contrat API de rapprochement est conservé");
check(cash.includes('/reconciliations/${record.id}/complete'), "Le contrat API de finalisation du rapprochement est conservé");
check(cash.includes('file.size > 5 * 1024 * 1024'), "La limite CSV de 5 Mo est conservée");
check(cash.includes('parsed.length > 10_000'), "La limite de 10 000 lignes bancaires est conservée");

check(advanced.includes("translateEnterpriseFinance"), "Finance avancée utilise le catalogue enterprise-finance");
check(advanced.includes('labelKey: "chartsOfAccounts"'), "Les sections comptables utilisent des clés canoniques");
check(advanced.includes('description={t("advancedFinanceDescription")}'), "Le header Finance avancée utilise la description canonique");
check(advanced.includes('financeStatusLabel(String(item.status), locale)'), "Les statuts affichés restent projetés en libellés métier localisés");
check(advanced.includes('valueText.replace(/([a-z0-9])([A-Z])/g'), "Le fallback métier humanise les codes inconnus au lieu de rendre un enum brut");
for (const code of ["SUBMIT", "APPROVE", "REJECT", "POST", "REOPEN", "CLOSE"]) check(advanced.includes(`"${code}"`), `Finance avancée conserve le code métier/API ${code}`);
check(advanced.includes('idempotencyKey: `${organizationId}:manual-entry:${Date.now()}`'), "L'idempotency key des écritures manuelles est conservée");
check(advanced.includes('statementType: "INVENTORY_VALUATION"'), "La publication de valorisation inventaire conserve son type serveur");
check(advanced.includes('/asset-depreciation/run'), "Le contrat d'amortissement reste inchangé");
check(advanced.includes('requiresApproval: Boolean(form.requiresApproval)'), "La séparation/approbation des journaux reste transmise au serveur");

check(onboarding.includes("translateEnterpriseFinance"), "L'onboarding comptable utilise le catalogue enterprise-finance");
check(onboarding.includes('t("accountingOnboarding")'), "Le titre d'onboarding provient du catalogue canonique");
check(onboarding.includes('t("accountingOnboardingDescription")'), "La description d'onboarding provient du catalogue canonique");
check(onboarding.includes('action: "ADOPT_TEMPLATE"'), "L'onboarding conserve le code serveur ADOPT_TEMPLATE");
check(onboarding.includes('action: "APPLY_RECOMMENDED_JOURNALS"'), "L'onboarding conserve le code serveur APPLY_RECOMMENDED_JOURNALS");
check(onboarding.includes('action: "ACTIVATE_CHART"'), "L'onboarding conserve le code serveur ACTIVATE_CHART");
check(onboarding.includes('en ? diagnostic.messageEn : diagnostic.messageFr'), "Les diagnostics serveur restent des données bilingues, non retraduites");
check(onboarding.includes('en ? payload.governance.messageEn : payload.governance.messageFr'), "La gouvernance serveur reste projetée selon sa langue source");

if (failed) process.exit(1);
console.log("Finance advanced i18n #325: contrat valide.");
