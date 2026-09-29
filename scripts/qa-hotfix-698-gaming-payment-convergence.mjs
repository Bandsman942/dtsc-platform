import fs from "node:fs";

const fail = (message) => {
  console.error("FAIL #698: " + message);
  process.exit(1);
};

const read = (path) => fs.readFileSync(path, "utf8");

const checkoutCommands = read("lib/enterprise/gaming/checkout-commands.ts");
const checkoutHttp = read("lib/enterprise/gaming/checkout-http.ts");
const checkoutUi = read("components/enterprise/gaming/enterprise-gaming-checkout-workspace.tsx");
const checkoutCopy = read("components/enterprise/gaming/gaming-checkout-i18n.ts");
const financeHttp = read("lib/enterprise/accounting/http.ts");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const financialAccountsRoute = read("app/api/enterprise/[organizationId]/financial-accounts/route.ts");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/[paymentId]/transition/route.ts");
const convergence = read("lib/enterprise/gaming/payment-convergence.ts");
const eventCatalog = read("lib/enterprise/cross-module/event-catalog.ts");
const projectionService = read("lib/enterprise/cross-module/projection-service.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");

if (!checkoutCommands.includes('input.methodType === "CASH"')
  || !checkoutCommands.includes("cashierUserId: actorUserId")
  || !checkoutCommands.includes('status: "OPEN"')
  || !checkoutCommands.includes("GAMING_CHECKOUT_OPEN_CASH_SESSION_REQUIRED")) {
  fail("ADD_PAYMENT doit vérifier une caisse OPEN pour l’initiateur avant de créer un paiement Cash");
}
if (!checkoutHttp.includes("GAMING_CHECKOUT_OPEN_CASH_SESSION_REQUIRED")) {
  fail("le checkout Gaming doit exposer un message métier explicite pour la caisse manquante");
}
if (!financialAccountsRoute.includes("hasOpenCashSessionForCurrentUser")
  || !financialAccountsRoute.includes("cashierUserId: auth.session.userId")) {
  fail("le référentiel des comptes doit exposer la readiness Cash de l’utilisateur courant");
}
if (!checkoutUi.includes('["PENDING_APPROVAL", "APPROVED"].includes(payment.status)')
  || !checkoutUi.includes("copy.confirmPayment")) {
  fail("un paiement APPROVED doit rester finalisable depuis Gaming");
}
if (!checkoutUi.includes("hasOpenCashSessionForCurrentUser === true")
  || !checkoutUi.includes("openCashSessionRequired")
  || !checkoutUi.includes("disabled={busy || !cashReady}")) {
  fail("le formulaire Gaming doit bloquer Cash sans caisse ouverte et guider l’utilisateur");
}
for (const code of [
  "OPEN_CASH_SESSION_REQUIRED",
  "PAYMENT_FINANCIAL_ACCOUNT_REQUIRED",
  "PAYMENT_FINANCIAL_ACCOUNT_INVALID",
  "PAYMENT_METHOD_ACCOUNT_MISMATCH",
  "PAYMENT_NOT_APPROVED",
  "PAYMENT_SELF_CONFIRMATION_FORBIDDEN",
]) {
  if (!financeHttp.includes(code)) fail("le serveur Finance doit expliciter " + code);
  if (!financeUi.includes(code)) fail("l’UI Finance doit expliciter " + code);
}
if (!paymentRoute.includes("convergeConfirmedGamingPayment")
  || !paymentRoute.includes('parsed.data.action === "CONFIRM"')) {
  fail("la confirmation Finance doit lancer immédiatement la convergence Gaming");
}
if (!convergence.includes("allocateEnterprisePayment")
  || !convergence.includes("syncGamingCheckoutPaidState")
  || !convergence.includes("enterprisePaymentAllocation.findFirst")) {
  fail("la convergence doit être idempotente, allouer la créance et synchroniser le checkout");
}
if (!eventCatalog.includes("GAMING_PAYMENT_CONTINUITY")
  || !eventCatalog.includes("gaming-checkout-payment-continuity")
  || !projectionService.includes("projectGamingPaymentContinuity")) {
  fail("PAYMENT_CONFIRMED doit conserver un filet de sécurité via la projection inter-modules");
}
if (!checkoutCopy.includes("confirmPayment") || !checkoutCopy.includes("openCashSessionRequired")) {
  fail("les libellés FR/EN du hotfix #698 sont incomplets");
}
if (!e2e.includes("#698 refuses CASH before payment creation")
  || !e2e.includes("#698 external Finance approval and confirmation settle the Gaming checkout end to end")
  || !e2e.includes('expect(persistedCheckout.status).toBe("PAID")')
  || !e2e.includes('expect(persistedSession.status).toBe("PAID")')) {
  fail("l’E2E doit couvrir le blocage Cash et la convergence Finance vers Gaming jusqu’à PAID");
}

console.log("PASS #698 Gaming/Finance cash readiness, approved-payment continuation and convergence contracts.");
