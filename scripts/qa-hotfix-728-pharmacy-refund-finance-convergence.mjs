import fs from "node:fs";

const failures = [];
const read = (path) => fs.readFileSync(path, "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens) => tokens.every((token) => source.includes(token));

const sectorSchema = read("prisma/enterprise-sector-convergence.prisma");
const migration = read("prisma/migrations/20261001110000_pharmacy_refund_finance_convergence/migration.sql");
const pharmacyFinance = read("lib/enterprise/sector-convergence/pharmacy-finance-service.ts");
const pharmacyCash = read("lib/pharmacy-cash.ts");
const cashRoute = read("app/api/enterprise/[organizationId]/pharmacy/cash/[entity]/[id]/route.ts");
const salesRoute = read("app/api/enterprise/[organizationId]/pharmacy/sales/[saleId]/route.ts");
const commonRefund = read("lib/enterprise/accounting/customer-refund-service.ts");
const payments = read("lib/enterprise/accounting/payments-service.ts");
const receivables = read("lib/enterprise/accounting/receivables-service.ts");
const assignedCredit = read("lib/enterprise/accounting/accounting-document-approval-orchestration.ts");
const backfill = read("scripts/lib/sector-backfill-handlers.mjs");
const workspace = read("components/enterprise/pharmacy-cash-workspace.tsx");
const e2e = read("tests/e2e/pharmacy-refund-finance-convergence.spec.mjs");
const accountingWorkflow = read(".github/workflows/accounting-acceptance.yml");
const gamingCheckout = read("lib/enterprise/gaming/checkout-commands.ts");

for (const token of [
  "model PharmacyRefundExtension",
  "pharmacyRefundId",
  "pharmacySaleRefundId",
  "paymentId",
  "salesCreditNoteId",
]) check(sectorSchema.includes(token), `refund mapping schema missing: ${token}`);

for (const token of [
  'CREATE TABLE "PharmacyRefundExtension"',
  '"PharmacyRefundExtension_paymentId_fkey"',
  'REFERENCES "EnterprisePayment"("organizationId", "id")',
  '"PharmacyRefundExtension_salesCreditNoteId_fkey"',
  'REFERENCES "EnterpriseSalesCreditNote"("organizationId", "id")',
]) check(migration.includes(token), `refund mapping migration missing: ${token}`);

for (const token of [
  "convergePharmacyRefund",
  "settlePharmacyRefund",
  'paymentType: "REFUND"',
  'direction: "OUTBOUND"',
  "PHARMACY_REFUND_SELF_VALIDATION_FORBIDDEN",
  "PHARMACY_REFUND_SELF_SETTLEMENT_FORBIDDEN",
  "PHARMACY_REFUND_SOURCE_PAYMENT_AMBIGUOUS",
  "PHARMACY_REFUND_REQUESTER_MUST_MATCH_CASHIER",
  "pharmacyRefundExtension",
  "reverseCustomerPaymentAllocationsForRefundAmount",
  "prepareSalesCreditNoteForRefundAmount",
  "confirmCustomerRefundPayment",
  "submitPaymentForAssignedApproval",
  "approvePaymentAssignedApproval",
  "submitSalesCreditNoteForAssignedApproval",
  "decideSalesCreditNoteAssignedApproval",
  "assertSalesCreditNoteStillPostable",
]) check(pharmacyFinance.includes(token), `Pharmacy refund convergence missing: ${token}`);

check(
  hasAll(pharmacyFinance, ["pharmacyCashExtension", "commonCashSessionId", 'status: "OPEN"', "financialAccountId: originalPayment.financialAccountId"]),
  "Cash refund must use the mapped open common cash session and original financial account",
);
check(
  !pharmacyFinance.includes("transitionEnterprisePayment(") && !pharmacyFinance.includes("approveAndPostSalesCreditNote("),
  "Pharmacy refund convergence must not bypass assigned Finance approval orchestration",
);
check(
  pharmacyFinance.indexOf("confirmCustomerRefundPayment") < pharmacyFinance.lastIndexOf('status: "PAID"'),
  "Pharmacy PAID must be written only after common refund confirmation",
);

for (const token of [
  "reverseCustomerPaymentAllocationsForRefundAmount",
  "Prisma.Decimal.min",
  "nextAllocationAmount",
  "PAYMENT_ALLOCATION_CONFIRMED",
  "postingVersion:",
  "REFUND_ALLOCATIONS_REVERSED",
  "prepareSalesCreditNoteForRefundAmount",
  "CREDIT_NOTE_EXCEEDS_REFUNDABLE_INVOICE",
  "consumeCustomerPaymentRefundAvailability",
  "REFUND_SOURCE_AVAILABILITY_CONSUMED",
  "REFUND_AVAILABILITY_CONSUMED",
  "paymentAmounts",
]) check(commonRefund.includes(token), `bounded common refund primitive missing: ${token}`);

check(
  commonRefund.includes("resolveCashSessionForConfirmation(tx, current, actorUserId)"),
  "Customer refund Cash settlement must reuse canonical cash-session binding rules",
);
check(
  payments.includes("cashSessionId?: string | null") && payments.includes("id: input.cashSessionId"),
  "Internal payment creation must support exact mapped Cash session binding",
);
check(
  payments.includes("reservedForRefund")
    && payments.includes("ALLOCATION_REVERSED_FOR_REFUND")
    && payments.includes("REFUND_AVAILABILITY_CONSUMED"),
  "Common payment allocation must exclude amounts reserved for customer refunds",
);
check(
  gamingCheckout.includes("consumeCustomerPaymentRefundAvailability")
    && gamingCheckout.includes("refundReason, refund.id"),
  "Gaming full refunds must use the same source-payment reservation lifecycle",
);
check(
  receivables.includes('throw new EnterpriseAccountingError("CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE", 409)')
    && assignedCredit.includes('throw new EnterpriseAccountingError("CREDIT_NOTE_EXCEEDS_OPEN_RECEIVABLE", 409)'),
  "Both legacy and assigned credit-note posting paths must fail closed against negative receivable balances",
);

check(
  pharmacyCash.includes('status: "SUBMITTED"') && !pharmacyCash.includes('cashSettings.refundRequiresValidation ? "SUBMITTED" : "VALIDATED"'),
  "New Pharmacy monetary refunds must always require independent validation",
);
check(
  !cashRoute.includes('data: { status: "PAID", paidAt: new Date() }') && cashRoute.includes("settlePharmacyRefund"),
  "Cash route must not mark Pharmacy refunds paid directly",
);
check(
  !salesRoute.includes("pharmacySaleRefund.create") && salesRoute.includes("PHARMACY_REFUND_USE_CASH_WORKFLOW"),
  "Sales route must retire direct monetary PharmacySaleRefund creation",
);
check(
  backfill.includes("LEGACY_REFUND_REQUIRES_EXPLICIT_PAYMENT_MAPPING")
    && backfill.includes("LEGACY_SALE_REFUND_REQUIRES_MANUAL_RECONCILIATION")
    && backfill.includes('status: "LEGACY_UNMAPPED"'),
  "Legacy nondeterministic Pharmacy refunds must be flagged for manual reconciliation",
);
check(
  workspace.includes("Finance :") && workspace.includes("Payer le remboursement"),
  "Pharmacy UI must surface common Finance refund state and settlement wording",
);
for (const token of [
  "partial refund is bounded",
  "total refund fully reverses",
  "closed mapped Cash session",
  "active tenant cannot mutate a foreign Pharmacy refund",
  "PHARMACY_REFUND_SELF_VALIDATION_FORBIDDEN",
  "PHARMACY_REFUND_SELF_SETTLEMENT_FORBIDDEN",
  "PAYMENT_ALLOCATION_EXCEEDS_UNALLOCATED",
  "sourcePaymentAfterRefund.unallocatedAmount",
]) check(e2e.includes(token), `#728 E2E coverage missing: ${token}`);
check(
  accountingWorkflow.includes("pharmacy-refund-finance-convergence.spec.mjs")
    && accountingWorkflow.includes("qa-hotfix-728-pharmacy-refund-finance-convergence.mjs"),
  "Accounting acceptance must execute #728 static and browser gates",
);

if (failures.length) {
  console.error("FAIL #728 Pharmacy refund Finance convergence:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("PASS #728 Pharmacy refunds converge to common Finance with bounded partial inverses, durable mappings and legacy fail-closed handling.");
