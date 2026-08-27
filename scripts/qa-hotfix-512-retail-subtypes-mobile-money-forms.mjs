import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const subtypes = read("lib/enterprise/retail/subtype-registry.ts");
for (const marker of ["SHOP", "RETAIL_BUSINESS_SUBTYPES", "retailSubtypeAllowsModule", "RETAIL_MODULE_CODES"]) {
  check(subtypes.includes(marker), `Retail subtype registry missing ${marker}`);
}

const templates = read("lib/enterprise-sector-templates.ts");
check(templates.includes("businessSubtypeCode"), "Sector template application must carry retail subtype");
check(templates.includes("retailSubtypeAllowsModule"), "Retail templates must filter subtype-scoped modules");
check(templates.includes("excludedModuleCodes"), "Leaving a subtype must disable its modules without deleting data");

const createRoute = read("app/api/admin/client-organizations/route.ts");
for (const marker of ["RETAIL_BUSINESS_SUBTYPE_INVALID", "RETAIL_BUSINESS_SUBTYPE_SECTOR_MISMATCH", "businessSubtypeCode", "applyCanonicalSectorTemplateToOrganization"]) {
  check(createRoute.includes(marker), `Company creation route missing ${marker}`);
}

const createPanel = read("components/admin/client-organizations-panel.tsx");
for (const marker of ["Sous-type de commerce retail", "ReferenceCombobox", "Commerce retail général", "businessSubtypeCode"]) {
  check(createPanel.includes(marker), `Company form missing ${marker}`);
}

const clientToast = read("lib/client-toast.ts");
for (const marker of ['notifyToast(description: string, tone?: ToastTone)', 'durationMs: tone === "error" ? 7000 : undefined']) {
  check(clientToast.includes(marker), `Global toast dispatch contract missing ${marker}`);
}

const toastProvider = read("components/ui/toast-provider.tsx");
for (const marker of ["useAppLocale", 'z-[1200]', 'Dismiss notification', 'copy[toast.tone]']) {
  check(toastProvider.includes(marker), `Foreground/i18n toast provider missing ${marker}`);
}

const shared = read("components/enterprise/professional/retail-workspace-shared.tsx");
check(shared.includes('notifyToast(success, "success")'), "Retail mutations must raise success toasts");
check(shared.includes('notifyToast(errorMessage, "error")'), "Retail mutations must raise error toasts");

const mobileMoney = read("components/enterprise/professional/mobile-money-agency-workspace.tsx");
check(!mobileMoney.includes("window.prompt"), "Mobile Money reversal must not use window.prompt");
for (const marker of ["reverseTarget", "reverseReason", "Dialog", "setOperationError", "previewError", "mappingRequired", "if (result) closeReverseDialog()"] ) {
  check(mobileMoney.includes(marker), `Mobile Money form contract missing ${marker}`);
}

const cash = read("components/enterprise/professional/mobile-money-cash-session-manager.tsx");
for (const marker of ["openError", "closeError", "notifyToast", "accountRequired", "reasonRequired", "if (result)"]) {
  check(cash.includes(marker), `Mobile Money cash-session form contract missing ${marker}`);
}

const providerService = read("lib/enterprise/retail/mobile-money-multicurrency-service.ts");
for (const marker of ["organizationId", "assertProviderTx", "assertMobileMoneyAccountTx", "RETAIL_FINANCIAL_ACCOUNT_INVALID"]) {
  check(providerService.includes(marker), `Mobile Money tenant reference validation missing ${marker}`);
}

const formContract = read("docs/FORM_UX_CONTRACT.md");
for (const marker of ["formulaire reste ouvert", "toast global", "Aucun bouton placeholder ou bouton muet", "organizationId", "succès backend confirmé"]) {
  check(formContract.includes(marker), `Global DTSC form contract missing ${marker}`);
}

if (failures.length) {
  console.error("Hotfix #512 QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Hotfix #512 QA passed: Retail subtype isolation and DTSC form feedback contracts are present.");
