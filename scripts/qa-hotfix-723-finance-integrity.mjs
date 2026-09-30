import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`FAIL #723: ${message}`);
  process.exitCode = 1;
};
const check = (condition, message) => {
  if (!condition) fail(message);
};

const payments = read("lib/enterprise/accounting/payments-service.ts");
const refunds = read("lib/enterprise/accounting/customer-refund-service.ts");
const architecture = read("docs/ERP_FINANCE_ARCHITECTURE.md");

const confirmStart = payments.indexOf("async function confirmEnterprisePayment");
const allocationStart = payments.indexOf("export async function allocateEnterprisePayment");
const confirmSection = payments.slice(confirmStart, allocationStart);
const reverseStart = payments.indexOf('if (action === "REVERSE")');
const reverseEnd = payments.indexOf("const updated = await tx.enterprisePayment.update", reverseStart);
const reverseSection = payments.slice(reverseStart, reverseEnd);

check(confirmStart >= 0 && allocationStart > confirmStart, "payment confirmation section must remain discoverable");
check(confirmSection.includes("postBusinessEventTx(tx"), "payment confirmation must post inside the same Prisma transaction");
check(!confirmSection.includes("await postBusinessEvent("), "payment confirmation must not post after the financial transaction commits");
check(confirmSection.includes('["CONFIRMED", "RECONCILED"].includes(payment.status)'), "idempotent confirmation must preserve confirmed/reconciled recovery");
check(confirmSection.includes("existingPostingEvent"), "idempotent confirmation must repair a missing canonical posting");

for (const token of [
  "balanceAdjustments",
  'status: "CONFIRMED"',
  'movementType: "PAYMENT_REVERSAL"',
  'movement.direction === "INBOUND" ? "OUTBOUND" : "INBOUND"',
  'status: "REVERSED"',
  "reverseJournalEntryTx(",
  'authorization: "DOMAIN_INVERSE"',
  'sourceEntityType: "EnterprisePayment"',
]) {
  check(reverseSection.includes(token), `payment reversal must include ${token}`);
}
check(reverseSection.includes('"EnterpriseFinancialAccount"') && reverseSection.includes("FOR UPDATE"), "payment reversal must lock impacted financial accounts before balance compensation");
check(reverseSection.includes("organizationId") && reverseSection.includes("financialAccountId"), "payment reversal must keep tenant/account scope explicit");

const refundConfirmStart = refunds.indexOf("export async function confirmCustomerRefundPayment");
const refundConfirmSection = refunds.slice(refundConfirmStart);
check(refundConfirmStart >= 0, "customer refund confirmation must remain discoverable");
check(refundConfirmSection.includes("postBusinessEventTx(tx"), "customer refund confirmation must post atomically");
check(!refundConfirmSection.includes("await postBusinessEvent("), "customer refund confirmation must not post after commit");

check(
  architecture.includes("Payment confirmation and posting are atomic") &&
  architecture.includes("operational balance") &&
  architecture.includes("compensating cash movement"),
  "Finance architecture must document the #723 integrity invariants",
);

if (!process.exitCode) console.log("PASS #723 Finance payment reversal, balance compensation and atomic posting contracts.");
