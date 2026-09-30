import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`FAIL #724: ${message}`);
  process.exitCode = 1;
};
const check = (condition, message) => {
  if (!condition) fail(message);
};

const payments = read("lib/enterprise/accounting/payments-service.ts");
const refunds = read("lib/enterprise/accounting/customer-refund-service.ts");
const route = read("app/api/enterprise/[organizationId]/payments/route.ts");
const http = read("lib/enterprise/accounting/http.ts");
const ui = read("components/enterprise/professional/finance-professional-ui.ts");
const e2e = read("tests/e2e/issue-693-gaming-checkout-invoice.spec.mjs");
const architecture = read("docs/ERP_FINANCE_ARCHITECTURE.md");

for (const token of [
  'CASH_SESSION_BINDING_CUTOVER_AT',
  '2026-09-29T08:30:00.000Z',
  'isLegacyCashSessionBinding',
  'PAYMENT_CASH_SESSION_BINDING_REQUIRED',
  'PAYMENT_APPROVER_CONFIRMATION_FORBIDDEN',
]) {
  check(payments.includes(token), `payments service must include ${token}`);
}

check(
  payments.includes('if (!isLegacyCashSessionBinding(payment))') &&
  payments.includes('"PAYMENT_CASH_SESSION_PENDING_VALIDATION"') &&
  payments.includes('"PAYMENT_CASH_SESSION_CLOSED"'),
  "post-cutover linked Cash payments must fail closed instead of rebinding",
);
check(
  payments.includes('"CASH_SESSION_RECOVERED"') &&
  payments.includes('"CASH_SESSION_REBOUND"') &&
  payments.includes("legacyCutoverAt"),
  "legacy recovery must remain explicit and audited",
);
check(
  payments.includes('payment.approvedByUserId === actorUserId') &&
  payments.includes('"PAYMENT_APPROVER_CONFIRMATION_FORBIDDEN"'),
  "payment confirmer must be distinct from approver",
);
check(
  refunds.includes('current.approvedByUserId === actorUserId') &&
  refunds.includes('"REFUND_PAYMENT_APPROVER_CONFIRMATION_FORBIDDEN"'),
  "refund confirmer must be distinct from approver",
);
check(
  route.includes("item.initiatedByUserId !== auth.session.userId") &&
  route.includes("item.approvedByUserId !== auth.session.userId"),
  "payment list capability must not advertise confirmation to maker or approver",
);

for (const code of [
  "PAYMENT_APPROVER_CONFIRMATION_FORBIDDEN",
  "REFUND_PAYMENT_APPROVER_CONFIRMATION_FORBIDDEN",
  "PAYMENT_CASH_SESSION_BINDING_REQUIRED",
]) {
  check(http.includes(code), `server message catalog must expose ${code}`);
  check(ui.includes(code), `FR/EN Finance UI must expose ${code}`);
}

for (const marker of [
  "erp-finance-confirmer@example.test",
  'sameApproverConfirmBody?.error).toBe("PAYMENT_APPROVER_CONFIRMATION_FORBIDDEN")',
  'modernRecoveryBody?.error).toBe("PAYMENT_CASH_SESSION_BINDING_REQUIRED")',
  'createdAt: new Date("2026-09-28T12:00:00.000Z")',
  'expect(persistedPayment.cashSessionId).toBe(opened.session.id)',
]) {
  check(e2e.includes(marker), `Gaming/Finance E2E must cover ${marker}`);
}

check(
  architecture.includes("three independent duties") &&
  architecture.includes("20260929083000_payment_cash_session_binding") &&
  architecture.includes("fail closed"),
  "Finance architecture must document SoD and legacy-only Cash recovery",
);

if (!process.exitCode) console.log("PASS #724 Finance three-party duties and legacy-only cash-session recovery contracts.");
