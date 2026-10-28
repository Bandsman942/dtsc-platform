import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/enterprise/relationship-benefits/omnichannel-payment-proof.ts", "utf8");
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
console.log(`HOTFIX #914 canonical payment proof: ${checks.length} structural checks passed. Financial issuance, behavioral E2E and OWNER_E2E NOT_EXECUTED.`);
