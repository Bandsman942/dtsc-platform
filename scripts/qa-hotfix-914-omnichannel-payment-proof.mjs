import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/enterprise/relationship-benefits/omnichannel-payment-proof.ts", "utf8");
const cashier = readFileSync("lib/enterprise/relationship-benefits/omnichannel-cashback.ts", "utf8");
const retail = readFileSync("lib/enterprise/retail/omnichannel.ts", "utf8");
const deliveries = readFileSync("lib/enterprise/crm-sales/fulfillments.ts", "utf8");
const payments = readFileSync("lib/enterprise/accounting/payments-service.ts", "utf8");
const returns = readFileSync("lib/enterprise/retail/omnichannel-returns.ts", "utf8");
const posting = readFileSync("lib/enterprise/accounting/sector-adapters/retail-relationship-credit.ts", "utf8");
const e2e = readFileSync("tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs", "utf8");
const checks = [
  ["canonical Sales order is scoped and fully delivered", 'status: "FULFILLED", archivedAt: null'],
  ["order line quantities are checked", "line.quantityFulfilled.lt(line.quantityOrdered)"],
  ["canonical omnichannel orchestration is required", "enterpriseRetailOrderOrchestration.findFirst"],
  ["delivery proof is required", "hasCustomerAcceptance"],
  ["versioned enterprise document is validated", 'sourceEntityType: "EnterpriseSalesOrder"'],
  ["active document and version count", 'currentVersion: { gt: 0 }'],
  ["returns stop new cashback before settlement", 'status: { not: "REJECTED" }'],
  ["canonical sales invoice is used", "enterpriseSalesInvoice.findMany"],
  ["invoice and order totals are equal", "invoices[0].grandTotal.equals(order.totalAmount)"],
  ["only fully paid invoices qualify", 'invoices[0].status !== "PAID"'],
  ["invoice issued before using it as paid evidence", "!invoices[0].issuedAt"],
  ["invoice accounting posted before using it as evidence", "!invoices[0].postedAt"],
  ["invoices with credit notes cannot earn new cashback", "!invoices[0].amountCredited.isZero()"],
  ["duplicate invoices fail closed", "invoices.length !== 1"],
  ["wrong customer invoice is not accepted", "invoices[0].businessPartyId !== order.businessPartyId"],
  ["wrong currency invoice is not accepted", "invoices[0].currencyCode !== order.currency"],
  ["canonical receivable payment allocations", "paymentAllocations:"],
  ["allocation must be confirmed", 'row.status !== "CONFIRMED"'],
  ["payment must be confirmed or reconciled", '"RECONCILED"'],
  ["customer inbound payment required", 'payment.paymentType !== "CUSTOMER_PAYMENT"'],
  ["customer identity and currency match order", "payment.businessPartyId !== order.businessPartyId"],
  ["financial account required", "!payment.financialAccountId"],
  ["no payment source beyond canonical methods", '"MOBILE_MONEY"'],
  ["payments actually cover full invoice", "paidAmount.lt(invoice.grandTotal)"],
  ["service does not issue or update store credit on read", "!EARN" ],
];
for (const [label, token] of checks) {
  if (label === "service does not issue or update store credit on read") {
    assert.doesNotMatch(source, /enterpriseRetailStoredValueAccount\.(?:create|update|upsert)|enterpriseRetailStoredValueEntry\.(?:create|update)|changeRelationalStoreCreditTx\(/);
  } else assert.ok(source.includes(token), label);
}

const implementationChecks = [
  [retail, "resolveRetailRelationshipCashbackEffects", "order pricing resolves cashback from canonical retail rules"],
  [retail, "reserveRetailOmnichannelCashbackTx({", "order creation reserves a benefit in its transaction"],
  [retail, 'executionMode: "AUTO_RETAIL_OMNICHANNEL_CASHBACK"', "canceling orders releases reserved cashback"],
  [cashier, 'const MODE = "AUTO_RETAIL_OMNICHANNEL_CASHBACK"', "cashback has its own execution identity"],
  [cashier, 'status: "REQUESTED"', "reservation never mints credit"],
  [cashier, "pg_advisory_xact_lock", "reservation quotas are locked"],
  [cashier, "evaluateRelationshipBenefitSnapshot", "customer eligibility is evaluated server-side"],
  [cashier, "relationType: link.requestedRelationType", "proof needs the exact consented customer role"],
  [cashier, 'status: "ACTIVE", archivedAt: null', "archived identity links cannot mint credit"],
  [cashier, 'SELECT id FROM "EnterpriseSalesOrder"', "order locking serializes credit"],
  [cashier, "resolvePaidDeliveredOmnichannelOrderTx", "grant requires real combined Finance/Sales proof"],
  [cashier, "changeRelationalStoreCreditTx({", "all money entries use canonical store credit ledger"],
  [cashier, 'entryType: "EARN"', "grant is a single positive store-credit entry"],
  [cashier, 'entryType: "REVERSAL"', "refunds append inverse ledger entries"],
  [cashier, "alreadyReversed", "refunds cannot exceed original credit"],
  [cashier, "refundedEligible", "refund reversion uses eligible item lines only"],
  [cashier, "postBusinessEventTx(tx, organizationId, actorUserId", "ledger and GL posting are transactional"],
  [deliveries, "tryGrantRetailOmnichannelCashbackTx({", "full fulfillment rechecks paid status"],
  [deliveries, '"AUTO_RETAIL_OMNICHANNEL_CASHBACK"', "proof requirement applies to reserved cashback"],
  [payments, "tryGrantRetailOmnichannelCashbackTx({", "confirmed allocation rechecks delivery status"],
  [returns, "reverseRetailOmnichannelCashbackTx({", "confirmed refund reverses cashback atomically"],
  [posting, 'sourceEntityType === "EnterpriseRetailStoredValueEntry"', "existing canonical Finance registry handles cashback entries"],
  [posting, 'journalType: "ADJUSTMENT" as const', "cashback uses canonical adjustment journal"],
  [posting, 'reversal ? "CUSTOMER_ADVANCES" : "OPERATING_EXPENSE"', "journal debit side follows liability rules"],
  [posting, 'reversal ? "OPERATING_EXPENSE" : "CUSTOMER_ADVANCES"', "journal credit side balances the liability"],
  [posting, 'status: "COMPLETED"', "reversal posting requires actual refund settlement"],
  [e2e, '#914 cashback only credits once after BOTH paid and delivered', "behavioral E2E covers both event orders"],
  [e2e, '"RETAIL_RELATIONSHIP_CREDIT_GRANTED"', "behavioral E2E checks posted ledger"],
];
for (const [file, needle, description] of implementationChecks) {
  assert.ok(file.includes(needle), description);
}
console.log(`HOTFIX #914: ${checks.length + implementationChecks.length} structural checks passed; browser/Finance E2E and OWNER_E2E remain separate gates.`);
