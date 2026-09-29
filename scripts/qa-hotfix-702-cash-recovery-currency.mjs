import fs from "node:fs";

const fail = (message) => {
  console.error("FAIL #702: " + message);
  process.exit(1);
};

const read = (path) => fs.readFileSync(path, "utf8");

const payments = read("lib/enterprise/accounting/payments-service.ts");
const financeHttp = read("lib/enterprise/accounting/http.ts");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const financeCore = read("components/enterprise/professional/finance-professional-workspace-core.tsx");
const cashRoute = read("app/api/enterprise/[organizationId]/cash-sessions/route.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");

for (const token of [
  "ORIGINAL_CASHIER",
  "CONFIRMING_ACTOR",
  "UNIQUE_ACCOUNT_SESSION",
  "PAYMENT_CASH_SESSION_AMBIGUOUS",
  "recoveryCashierUserId",
  "originalInitiatorUserId",
  "recoveryStrategy",
  "PAYMENT_CASH_ACCOUNT_CURRENCY_MISMATCH",
]) {
  if (!payments.includes(token)) fail("le moteur paiement doit couvrir " + token);
}

if (!payments.includes("cashierUserId: actorUserId")) {
  fail("la récupération historique doit pouvoir utiliser la caisse OPEN de l’acteur autorisé qui confirme");
}

if (!payments.includes("financialAccountId: payment.financialAccountId") || !payments.includes('status: "OPEN" as const')) {
  fail("la recherche de remplacement doit rester bornée au même compte et à une session OPEN");
}

if (!financeHttp.includes("PAYMENT_CASH_SESSION_AMBIGUOUS")
  || !financeUi.includes("PAYMENT_CASH_SESSION_AMBIGUOUS")
  || !financeHttp.includes("PAYMENT_CASH_ACCOUNT_CURRENCY_MISMATCH")
  || !financeUi.includes("PAYMENT_CASH_ACCOUNT_CURRENCY_MISMATCH")) {
  fail("les nouveaux refus Cash doivent conserver des messages métier FR/EN");
}

if (financeHttp.includes("avec le caissier qui a initié le paiement")
  || financeUi.includes("with the cashier who initiated the payment")) {
  fail("le conseil client ne doit plus exiger le caissier historique pour récupérer un paiement ancien");
}

if (!cashRoute.includes("currencyCode: item.financialAccount.currencyCode")) {
  fail("les sessions de caisse doivent exposer explicitement la devise de leur compte");
}

if (financeCore.includes('String(item.currencyCode || "USD")')
  || !financeCore.includes("financialAccount?.currencyCode?.trim()")
  || !financeCore.includes("if (!currencyCode) return null;")) {
  fail("le formatter Finance ne doit jamais inventer USD lorsqu’une devise manque");
}

if (!e2e.includes("#702 recovers an approved historical payment into a different authorized cashier session")
  || !e2e.includes('recoveryStrategy: "CONFIRMING_ACTOR"')
  || !e2e.includes('expect(cashList?.items?.[0]?.currencyCode).toBe("CDF")')
  || !e2e.includes('expect(persistedCheckout.status).toBe("PAID")')) {
  fail("l’E2E #702 doit couvrir récupération multi-caissier, CDF et convergence Gaming PAID");
}

console.log("PASS #702 historical Cash recovery across authorized cashier sessions and currency-safe cash listing.");
