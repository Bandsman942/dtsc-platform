import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const confirmationProvider = read("components/ui/sensitive-action-confirmation-provider.tsx");
for (const forbidden of ["window.confirm =", "origin.click()", "approvedReplay", "replaying = true"]) {
  check(!confirmationProvider.includes(forbidden), `Shared confirmation provider must not replay legacy confirmation through DOM state: ${forbidden}`);
}
check(confirmationProvider.includes("DTSC_CONFIRMATION_EVENT"), "Async DTSC confirmation events must remain supported");
check(confirmationProvider.includes("window.addEventListener"), "Async DTSC confirmation provider must remain mounted through an event listener");

const collaborators = read("components/collaborators/collaborators-conversation-workspace.tsx");
check(collaborators.includes("async function deleteMessage"), "Collaborators message delete workflow is missing");
check(collaborators.includes('method: "DELETE"'), "Collaborators delete workflow must still execute a DELETE request after native confirmation");
check(collaborators.includes("window.confirm"), "Legacy Collaborators confirmation should keep native synchronous browser semantics until explicitly migrated to the async DTSC API");

const onboarding = read("lib/enterprise/retail/self-service-onboarding.ts");
for (const marker of ["activePackActivations", "functionalCurrencyCode", "uniqueOrNull(options.sites)", "warehouseCandidates", "cashAccountCandidates", "isCashAccount"]) {
  check(onboarding.includes(marker), `Canonical Shop readiness inference missing ${marker}`);
}
check(!onboarding.includes("enterpriseSite.create"), "Readiness must never fabricate a site");
check(!onboarding.includes("enterpriseWarehouse.create"), "Readiness must never fabricate a warehouse");
check(!onboarding.includes("enterpriseFinancialAccount.create"), "Readiness must never fabricate a financial account");

const readinessUi = read("components/enterprise/professional/retail-global-readiness.tsx");
check(readinessUi.includes("Compte d’encaissement"), "Shop onboarding must distinguish the persistent collection account from a till session");
check(readinessUi.includes("retailReadinessDetail"), "Shop checklist must render actionable per-step guidance");
check(!readinessUi.includes("next.readiness.options.sites[0]?.id"), "Shop UI must not silently choose the first site when several sites can exist");

const readinessCopy = read("lib/enterprise/retail/readiness-language.ts");
for (const marker of ["Devise fonctionnelle configurée", "Configuration pays active", "Dépôt de stock sélectionné", "Clôturer une session de caisse ne supprime pas cette configuration", "Un emplacement à l’intérieur du dépôt ne suffit pas"]) {
  check(readinessCopy.includes(marker), `Shop readiness must explain real state/action in French: ${marker}`);
}
for (const marker of ["Functional currency configured", "Country configuration active", "Stock warehouse selected", "Closing a till session does not remove this configuration"]) {
  check(readinessCopy.includes(marker), `Shop readiness must explain real state/action in English: ${marker}`);
}

const deepLinks = read("lib/enterprise/retail/readiness-deep-links.ts");
check(deepLinks.includes('FUNCTIONAL_CURRENCY: "/enterprise-modules/FINANCE_OVERVIEW"'), "Main-currency readiness must open Finance configuration instead of accounting onboarding");
check(!deepLinks.includes('FUNCTIONAL_CURRENCY: "/enterprise-modules/FINANCE_ACCOUNTING'), "Main-currency readiness must not route to accounting onboarding");
check(deepLinks.includes('CASH_ACCOUNT: "/enterprise-modules/FINANCE_TREASURY#cash-accounts"'), "Collection-account readiness must open financial accounts");

const accountingOnboarding = read("components/enterprise/professional/enterprise-accounting-onboarding-panel.tsx");
for (const marker of ["bg-dtsc-surface", "bg-dtsc-page", "border-dtsc-border", "text-dtsc-ink", "text-dtsc-muted"]) {
  check(accountingOnboarding.includes(marker), `Accounting onboarding must use DTSC theme token ${marker}`);
}
for (const forbidden of ["bg-card", "bg-background", "text-muted-foreground", "border-border/", "border-destructive", "text-destructive"]) {
  check(!accountingOnboarding.includes(forbidden), `Accounting onboarding must not fall back to generic black theme token ${forbidden}`);
}

if (failures.length) {
  console.error("Hotfix #303 QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Hotfix #303 QA passed: CRUD confirmations keep deterministic semantics, Shop readiness is canonical/actionable, and accounting onboarding uses DTSC branding.");
