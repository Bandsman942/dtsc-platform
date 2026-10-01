import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };

const paymentService = read("lib/enterprise/accounting/payments-service.ts");
const paymentRoute = read("app/api/enterprise/[organizationId]/payments/route.ts");
const workspace = read("components/enterprise/professional/enterprise-finance-payments-workspace.tsx");
const financeUi = read("components/enterprise/professional/finance-professional-ui.ts");
const health = read("lib/enterprise/sector-convergence/health-billing-service.ts");
const pharmacy = read("lib/enterprise/sector-convergence/pharmacy-finance-service.ts");

for (const token of [
  "export const CASH_SESSION_BINDING_CUTOVER_AT",
  "export function isLegacyCashSessionBinding",
  "paymentCashSessionConfirmationBlocker",
  "paymentCashSessionConfirmationNotice",
  "PAYMENT_CASH_SESSION_BINDING_REQUIRED",
  "PAYMENT_CASH_SESSION_LEGACY_RECOVERY",
]) check(paymentService.includes(token), `payment cash policy missing: ${token}`);

check(
  paymentService.includes("payment.cashSession.financialAccountId !== payment.financialAccountId"),
  "payment cash readiness must reject a cash session bound to another financial account",
);

for (const token of [
  'cashSession: { select: { status: true, financialAccountId: true } }',
  "confirmationBlocker",
  "confirmationNotice",
  "ready: canConfirm",
  "blockerCode: confirmationBlocker",
  "noticeCode: confirmationNotice",
  '!confirmationBlocker',
  '"REFUND_PAYMENT_SELF_CONFIRMATION_FORBIDDEN"',
]) check(paymentRoute.includes(token), `payment API guidance missing: ${token}`);

check(
  paymentRoute.includes('items.map(({ cashSession, ...item }) =>'),
  "payment API must not serialize the cash-session relation directly",
);

for (const token of [
  "PaymentConfirmationState",
  "financePaymentConfirmationCopy",
  "financeErrorMessage",
  "data-payment-confirmation-guidance",
  "detail.confirmation?.blockerCode",
  "detail.confirmation?.noticeCode",
  "detail.confirmation?.ready",
]) check(workspace.includes(token), `payments workspace guidance missing: ${token}`);

for (const token of [
  "PAYMENT_CASH_SESSION_LEGACY_RECOVERY",
  "Confirmation disponible",
  "Confirmation indisponible",
  "Confirmation available",
  "Confirmation unavailable",
]) check(financeUi.includes(token), `finance confirmation copy missing: ${token}`);

check(
  health.includes("catalogNameById") && !health.includes("description: item.description"),
  "Health Finance must keep controlled Catalog labels and exclude clinical free text",
);
check(
  pharmacy.includes("catalogNameById") && !pharmacy.includes("description: `Pharmacy item ${line.productId}`"),
  "Pharmacy Finance must keep business Catalog labels instead of technical product IDs",
);

if (failures.length) {
  console.error("FAIL #745 Finance UI/backend convergence:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("PASS #745 Finance UI/backend convergence exposes server-derived confirmation readiness without weakening backend guards.");
