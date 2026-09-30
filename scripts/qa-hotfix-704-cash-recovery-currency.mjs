import fs from "node:fs";

const fail = (message) => {
  console.error("FAIL #704: " + message);
  process.exit(1);
};

const read = (path) => fs.readFileSync(path, "utf8");

const payments = read("lib/enterprise/accounting/payments-service.ts");
const cashRoute = read("app/api/enterprise/[organizationId]/cash-sessions/route.ts");
const financeCore = read("components/enterprise/professional/finance-professional-workspace-core.tsx");
const financeHttp = read("lib/enterprise/accounting/http.ts");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");

for (const token of [
  "findPreferredOpenReplacement",
  "historicalCashierSession",
  "confirmingCashierSession",
  "compatibleOpenSessions",
  "PAYMENT_CASH_SESSION_AMBIGUOUS",
  "historicalInitiatorUserId",
  "previousCashierUserId",
  "cashierUserId: replacement.cashierUserId",
]) {
  if (!payments.includes(token)) fail("le moteur de récupération Cash doit couvrir " + token);
}

if (!payments.includes('account.currencyCode !== payment.currencyCode')) {
  fail("la confirmation doit revalider la devise du compte financier");
}

if (!payments.includes("compatibleOpenSessions.length > 1")) {
  fail("la récupération cross-cashier doit échouer en cas d’ambiguïté");
}

if (!cashRoute.includes("currencyCode: item.financialAccount.currencyCode")) {
  fail("la collection des sessions de caisse doit projeter explicitement la devise du compte");
}

if (financeCore.includes('String(item.currencyCode || "USD")')) {
  fail("les listes Finance ne doivent plus utiliser un fallback silencieux USD");
}
if (!financeCore.includes("financialAccount?.currencyCode") || !financeCore.includes("if (!currencyCode) return null")) {
  fail("le formatter Finance doit utiliser la devise du compte lié ou refuser de formater un montant sans devise");
}

for (const source of [financeHttp, financeUi]) {
  if (!source.includes("PAYMENT_CASH_SESSION_AMBIGUOUS")) {
    fail("le message métier d’ambiguïté Cash doit être exposé côté serveur et UI");
  }
  if (source.includes("caissier qui a initié le paiement") || source.includes("cashier who initiated the payment")) {
    fail("les messages #700 obsolètes ne doivent plus imposer artificiellement le caissier historique");
  }
}

for (const token of [
  "#704 uses another authorized cashier and preserves CDF",
  "openResponse = await confirmerContext.request.post",
  "expect(openedPersisted.cashierUserId).toBe(confirmerUserId)",
  "expect(openedPersisted.cashierUserId).not.toBe(adminUserId)",
  "expect(openedPersisted.cashierUserId).not.toBe(approverUserId)",
  'expect(cashList?.items?.[0]?.currencyCode).toBe("CDF")',
  "CASH_SESSION_RECOVERED",
  'expect(persistedCheckout.status).toBe("PAID")',
]) {
  if (!e2e.includes(token)) fail("l’E2E #704 doit couvrir " + token);
}

console.log("PASS #704 cross-cashier historical Cash recovery and canonical cash-session currency contracts.");
