import fs from "node:fs";

const fail = (message) => {
  console.error("FAIL #700: " + message);
  process.exit(1);
};

const read = (path) => fs.readFileSync(path, "utf8");

const schema = read("prisma/enterprise-accounting.prisma");
const migration = read("prisma/migrations/20260929083000_payment_cash_session_binding/migration.sql");
const treasury = read("lib/enterprise/accounting/treasury-service.ts");
const payments = read("lib/enterprise/accounting/payments-service.ts");
const financeHttp = read("lib/enterprise/accounting/http.ts");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const accountsRoute = read("app/api/enterprise/[organizationId]/financial-accounts/route.ts");
const gamingUi = read("components/enterprise/gaming/enterprise-gaming-checkout-workspace.tsx");
const gamingCopy = read("components/enterprise/gaming/gaming-checkout-i18n.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");

if (!schema.includes("cashSessionId            String?")
  || !schema.includes("cashSession              EnterpriseCashSession?")
  || !schema.includes("@@index([organizationId, cashSessionId])")
  || !schema.includes("payments              EnterprisePayment[]")) {
  fail("EnterprisePayment doit porter une relation tenant-safe vers EnterpriseCashSession");
}

if (!migration.includes('ADD COLUMN "cashSessionId" TEXT')
  || !migration.includes('EnterprisePayment_organizationId_cashSessionId_fkey')
  || !migration.includes('REFERENCES "EnterpriseCashSession"("organizationId", "id")')
  || !migration.includes('EnterprisePayment_organizationId_cashSessionId_idx')) {
  fail("la migration additive cashSessionId/FK/index est incomplète");
}

if (treasury.includes('status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] }')
  || !treasury.includes('status: { in: ["OPEN", "CLOSING"] }')) {
  fail("PENDING_VALIDATION ne doit plus empêcher l’ouverture de la caisse suivante");
}

for (const token of [
  "resolveCashSessionForConfirmation",
  "CASH_SESSION_RECOVERED",
  "CASH_SESSION_REBOUND",
  "PAYMENT_CASH_SESSION_PENDING_VALIDATION",
  "PAYMENT_CASH_SESSION_CLOSING",
  "PAYMENT_CASH_SESSION_CLOSED",
  "cashSessionId: recovered.id",
]) {
  if (!payments.includes(token)) fail("le moteur paiement doit couvrir " + token);
}

if (!payments.includes('input.methodType === "CASH"')
  || !payments.includes('cashSessionId = cashSession?.id || null')
  || !payments.includes('cashSessionId, businessPartyId')) {
  fail("les nouveaux paiements Cash doivent mémoriser la session ouverte exacte à la création");
}

for (const code of [
  "PAYMENT_CASH_SESSION_INVALID",
  "PAYMENT_CASH_SESSION_PENDING_VALIDATION",
  "PAYMENT_CASH_SESSION_CLOSING",
  "PAYMENT_CASH_SESSION_CLOSED",
  "CASH_SESSION_ALREADY_ACTIVE",
]) {
  if (!financeHttp.includes(code)) fail("le serveur Finance doit exposer le message métier " + code);
  if (!financeUi.includes(code)) fail("l’UI Finance doit traduire " + code + " en FR/EN");
}

if (!accountsRoute.includes("cashSessionStateForCurrentUser")
  || !accountsRoute.includes('status: { in: ["OPEN", "CLOSING", "PENDING_VALIDATION"] }')) {
  fail("le référentiel comptes doit exposer l’état réel de la session de caisse courante");
}

if (!gamingUi.includes("cashSessionStateForCurrentUser")
  || !gamingUi.includes("cashReadinessMessage")
  || !gamingCopy.includes("cashSessionPendingValidation")
  || !gamingCopy.includes("cashSessionClosing")) {
  fail("Gaming doit distinguer caisse absente, clôture en attente et clôture en cours");
}

if (!e2e.includes("#700 reopens cash after pending close and recovers a historical approved Gaming payment")
  || !e2e.includes("cashSessionId: null")
  || !e2e.includes('"CASH_SESSION_RECOVERED"')
  || !e2e.includes("expect(persistedPayment.cashSessionId).toBe(opened.session.id)")
  || !e2e.includes('expect(persistedCheckout.status).toBe("PAID")')) {
  fail("l’E2E #700 doit couvrir le paiement historique APPROVED, la nouvelle caisse et la convergence PAID");
}

console.log("PASS #700 cash-session binding, pending-close reopening and historical payment recovery contracts.");
