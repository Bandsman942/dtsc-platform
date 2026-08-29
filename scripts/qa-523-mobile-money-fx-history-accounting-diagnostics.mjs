import fs from "node:fs";

const files = {
  dashboard: "app/api/enterprise/[organizationId]/retail/dashboard/route.ts",
  fx: "app/api/enterprise/[organizationId]/retail/mobile-money/fx/route.ts",
  retry: "app/api/enterprise/[organizationId]/retail/mobile-money/fx/[transferId]/accounting/route.ts",
  workspace: "components/enterprise/professional/mobile-money-agency-workspace.tsx",
  diagnostic: "lib/enterprise/retail/accounting-pending-diagnostic.ts",
  outcome: "lib/enterprise/retail/mutation-outcome.ts",
  language: "lib/retail-customer-language.ts",
  posting: "lib/enterprise/accounting/posting-service.ts",
};

const source = Object.fromEntries(Object.entries(files).map(([key, path]) => {
  if (!fs.existsSync(path)) {
    console.error(`Fichier introuvable: ${path}`);
    process.exit(1);
  }
  return [key, fs.readFileSync(path, "utf8")];
}));

const failures = [];
const requireSource = (name, condition, message) => {
  if (!condition) failures.push(`${name}: ${message}`);
};

requireSource("dashboard", source.dashboard.includes("enterpriseMobileMoneyFxTransfer.findMany"), "les conversions FX ne sont pas chargées dans l'historique Mobile Money");
requireSource("dashboard", source.dashboard.includes('sourceEntityType: "EnterpriseMobileMoneyFxTransfer"') && source.dashboard.includes('postingEvent: "RETAIL_MOBILE_MONEY_FX_POSTED"'), "le statut comptable des conversions FX n'est pas relié au posting canonique");
requireSource("dashboard", source.dashboard.includes("mobileMoneyHistory = [...mobileMoneyRecent, ...fxHistory]"), "les conversions FX ne sont pas fusionnées à l'historique rendu");
requireSource("dashboard", !source.dashboard.includes("finalizeMobileMoneyFxAccounting"), "un GET d'historique ne doit jamais déclencher de comptabilisation");

requireSource("fx", source.fx.includes("retailAccountingPendingDiagnostic(accountingError)"), "la cause comptable est encore détruite ou ignorée dans la route FX");
requireSource("fx", source.fx.includes("accountingErrorCode: diagnostic.errorCode"), "le diagnostic comptable n'est pas audité de façon sûre");
requireSource("fx", source.fx.includes("blockerCode: diagnostic.errorCode") && source.fx.includes("actionHref: diagnostic.actionHref"), "la réponse PENDING n'expose pas un diagnostic actionnable");
requireSource("fx", !source.fx.includes("void accountingError"), "le code d'erreur comptable est encore explicitement jeté");

requireSource("retry", source.retry.includes("finalizeMobileMoneyFxAccounting(organizationId, auth.session.userId, transfer.id)"), "la reprise ne réutilise pas le posting idempotent du transfert existant");
requireSource("retry", source.retry.includes("where: { id: transferId, organizationId }"), "la reprise comptable n'est pas strictement tenant-scoped");
requireSource("retry", source.retry.includes("retailAccountingPendingDiagnostic(error)"), "la reprise comptable perd le blocker réel");
requireSource("retry", source.retry.includes("retailPendingOutcome(diagnostic.messageCode"), "un échec de finalisation après transfert durable n'est pas conservé en PENDING");
requireSource("retry", source.retry.includes("status: 202"), "la reprise encore bloquée ne renvoie pas HTTP 202");
requireSource("retry", !source.retry.includes("createMobileMoneyFxTransfer"), "la reprise comptable ne doit jamais recréer/rejouer le transfert wallet");
requireSource("retry", !source.retry.includes("operationalBalance"), "la reprise comptable ne doit jamais modifier directement les soldes wallet");

requireSource("workspace", source.workspace.includes('startsWith("FX_CONVERSION_PENDING:")'), "l'historique ne détecte pas les conversions en attente de comptabilisation");
requireSource("workspace", source.workspace.includes("/retail/mobile-money/fx/${item.id}/accounting"), "l'action de finalisation comptable n'appelle pas l'endpoint dédié");
requireSource("workspace", source.workspace.includes('accountingRetry: "Finaliser la comptabilisation"') && source.workspace.includes('accountingRetry: "Finalize accounting"'), "l'action de reprise n'est pas bilingue");
requireSource("workspace", source.workspace.includes("{ idempotent: false }"), "l'action de reprise doit appeler l'endpoint dédié sans générer une seconde clé de transfert côté client");

for (const code of [
  "RETAIL_ACCOUNTING_PENDING_JOURNAL",
  "RETAIL_ACCOUNTING_PENDING_PERIOD_REQUIRED",
  "RETAIL_ACCOUNTING_PENDING_PERIOD_CLOSED",
  "RETAIL_ACCOUNTING_PENDING_RATE",
  "RETAIL_ACCOUNTING_PENDING_ACCOUNT",
  "RETAIL_ACCOUNTING_PENDING_MAPPING",
  "RETAIL_ACCOUNTING_PENDING_CONFIGURATION",
  "RETAIL_ACCOUNTING_PENDING_UNKNOWN",
]) {
  requireSource("outcome", source.outcome.includes(code), `message utilisateur manquant: ${code}`);
}
requireSource("outcome", source.outcome.includes("journal Mobile Money actif") && source.outcome.includes("période comptable") && source.outcome.includes("taux nécessaire"), "les messages FR ne donnent pas les blockers réels");
requireSource("outcome", !source.outcome.toLowerCase().includes("fiscalité"), "la fiscalité ne doit pas être présentée comme blocker générique du posting FX");

requireSource("diagnostic", source.diagnostic.includes('case "POSTING_JOURNAL_REQUIRED"'), "le journal Mobile Money n'est pas diagnostiqué");
requireSource("diagnostic", source.diagnostic.includes('case "FINANCE_PERIOD_NOT_FOUND"'), "la période comptable absente n'est pas diagnostiquée");
requireSource("diagnostic", source.diagnostic.includes('case "FINANCE_EXCHANGE_RATE_REQUIRED"'), "le taux Finance manquant n'est pas diagnostiqué");
requireSource("diagnostic", source.diagnostic.includes('case "POSTING_DIRECT_ACCOUNT_INVALID"'), "le compte ledger invalide n'est pas diagnostiqué");
requireSource("diagnostic", source.diagnostic.includes("ORGANIZATION_MAPPINGS_REQUIRED"), "les mappings comptables incomplets ne sont pas diagnostiqués");

requireSource("posting", source.posting.includes("errorCode = accountingError?.code || \"POSTING_FAILED\""), "le code d'EnterpriseAccountingError n'est pas persisté");
requireSource("posting", source.posting.includes("enterprisePostingBatch.create") && source.posting.includes('status: "FAILED"'), "un échec avant création du batch peut encore perdre son diagnostic durable");
requireSource("posting", source.posting.includes('status: { not: "COMPLETED" }'), "un diagnostic d'échec pourrait écraser un batch déjà COMPLETED");

requireSource("language", source.language.includes("FX_CONVERSION_POSTED") && source.language.includes("FX_CONVERSION_PENDING:"), "les conversions FX ne disposent pas de libellés d'historique localisés");
requireSource("language", source.language.includes("journal Mobile Money à configurer") && source.language.includes("Mobile Money journal needs setup"), "le diagnostic d'historique n'est pas bilingue");

if (failures.length) {
  console.error("FAIL qa-523-mobile-money-fx-history-accounting-diagnostics");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-523-mobile-money-fx-history-accounting-diagnostics");
console.log("- les conversions FX durables sont visibles dans l'historique Mobile Money");
console.log("- le blocker comptable réel est conservé et traduit sans exposer la stack");
console.log("- la reprise comptable est tenant-scoped, idempotente et ne rejoue jamais le transfert wallet");
console.log("- le GET d'historique reste strictement en lecture seule");
