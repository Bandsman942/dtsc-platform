import fs from "node:fs";

const files = {
  shared: "components/enterprise/professional/retail-workspace-shared.tsx",
  outcome: "lib/enterprise/retail/mutation-outcome.ts",
  http: "lib/enterprise/retail/http.ts",
  mobileMoney: "app/api/enterprise/[organizationId]/retail/mobile-money/route.ts",
  mobileMoneyFx: "app/api/enterprise/[organizationId]/retail/mobile-money/fx/route.ts",
  telco: "app/api/enterprise/[organizationId]/retail/telco-topups/route.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => {
    if (!fs.existsSync(path)) {
      console.error(`Fichier introuvable: ${path}`);
      process.exit(1);
    }
    return [key, fs.readFileSync(path, "utf8")];
  }),
);

const failures = [];

function requireSource(name, condition, message) {
  if (!condition) failures.push(`${name}: ${message}`);
}

requireSource("outcome", source.outcome.includes('"SUCCESS" | "PENDING" | "FAILURE"'), "le contrat canonique SUCCESS/PENDING/FAILURE est absent");
requireSource("outcome", source.outcome.includes("RETAIL_ACCOUNTING_PENDING") && source.outcome.includes("RETAIL_PROVIDER_PENDING") && source.outcome.includes("RETAIL_PROVIDER_FAILED"), "les messages d'outcome FR/EN attendus sont incomplets");
requireSource("outcome", source.outcome.includes("fr:") && source.outcome.includes("en:"), "les messages d'outcome ne sont pas bilingues");

requireSource("shared", source.shared.includes('body?.ok === false'), "un body ok:false peut encore être interprété comme succès");
requireSource("shared", source.shared.includes('body?.outcome === "FAILURE"'), "le client n'interprète pas FAILURE");
requireSource("shared", source.shared.includes('response.status === 202') && source.shared.includes('body?.outcome === "PENDING"'), "le client n'interprète pas PENDING/HTTP 202");
requireSource("shared", source.shared.includes('notifyToast(pendingMessage, "warning")'), "PENDING doit utiliser un toast warning, pas success/error");
requireSource("shared", source.shared.includes("return null;") && source.shared.includes("Keep the stable idempotency key"), "PENDING doit conserver la clé d'idempotence et laisser le formulaire réessayable");
requireSource("shared", source.shared.includes("retailMutationOutcomeMessage"), "les messages outcome ne sont pas localisés côté client");

for (const [name, route, atomicWrapper] of [
  ["mobile-money", source.mobileMoney, "createMobileMoneyTransactionWithPosting"],
  ["telco", source.telco, "createTelcoTopupWithPosting"],
]) {
  requireSource(name, route.includes('retailFailureOutcome("RETAIL_PROVIDER_FAILED"'), "un échec provider n'utilise pas FAILURE");
  requireSource(name, route.includes('retailPendingOutcome("RETAIL_PROVIDER_PENDING"'), "un provider en attente n'utilise pas PENDING");
  requireSource(name, route.includes("failed ? 422 : pending ? 202"), "les statuts provider FAILED/PENDING ne sont pas 422/202");
  requireSource(name, !route.includes('connected.operation.status === "FAILED" ? 200 : 202'), "le legacy HTTP 200 + ok:false est revenu");
  requireSource(name, route.includes(atomicWrapper), "le flux manuel n'utilise pas le wrapper métier + trésorerie + posting atomique");
  requireSource(name, !route.includes('retailPendingOutcome("RETAIL_ACCOUNTING_PENDING"'), "le flux manuel peut encore exposer un PENDING comptable post-commit au lieu de rollbacker atomiquement");
}

requireSource("mobile-money-fx", source.mobileMoneyFx.includes("createMobileMoneyFxTransferWithPosting"), "le transfert FX n'utilise pas le wrapper métier + trésorerie + posting atomique");
requireSource("mobile-money-fx", !source.mobileMoneyFx.includes("retailPendingOutcome(diagnostic.messageCode"), "le transfert FX peut encore exposer un PENDING comptable post-commit");
requireSource("mobile-money-fx", !source.mobileMoneyFx.includes('status: "PENDING"'), "le transfert FX conserve encore un état comptable PENDING incompatible avec le rollback atomique");
requireSource("mobile-money-fx", source.mobileMoneyFx.includes("retailSuccessOutcome"), "le succès FX n'est pas explicitement contractuel");

requireSource("http", source.http.includes("retailFailureOutcome"), "retailErrorResponse n'encode pas FAILURE");
requireSource("http", source.http.includes('outcome: "FAILURE"') || source.http.includes("retailFailureOutcome"), "l'enveloppe d'erreur canonique est absente");

if (failures.length) {
  console.error("FAIL qa-520-retail-mutation-outcome-contract");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASS qa-520-retail-mutation-outcome-contract");
console.log("- SUCCESS/PENDING/FAILURE reste explicite côté API et client pour les opérations réellement asynchrones");
console.log("- HTTP 200 + ok:false ne peut plus produire un toast succès dans le workspace Retail partagé");
console.log("- Mobile Money manuel, FX et Telco SUCCESS ne peuvent plus exposer ACCOUNTING_PENDING après un commit métier: métier, trésorerie et posting sont atomiques");
