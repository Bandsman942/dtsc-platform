import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { Prisma } = require("@prisma/client");
const d = (value) => new Prisma.Decimal(value);
class EnterpriseRetailError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
let checked = 0;
function contract(file, tokens) {
  const text = fs.readFileSync(file, "utf8");
  for (const token of tokens) {
    assert.ok(text.includes(token), "Missing contract: " + token + " in " + file);
    checked++;
  }
}
contract("prisma/enterprise-retail-invoice-checkout.prisma", ["refundPayoutAmount Decimal?", "financeApproverUserId String?"]);
contract("prisma/migrations/20261115194500_retail_partial_credit_refund_split/migration.sql", ['"refundPayoutAmount" DECIMAL(20,6)', '"financeApproverUserId" TEXT']);
contract("prisma/migrations/20261116072500_retail_credit_disposition_constraints/migration.sql", ["retail_invoice_return_line_disposition_check", "'SERVICE_CREDIT'", "'UNDELIVERED_CREDIT'", "retail_invoice_return_finance_pending_check", "retail_invoice_return_completed_finance_check", 'COALESCE("refundPayoutAmount" = 0, FALSE)']);
contract("lib/enterprise/retail/invoice-returns.ts", ["UNDELIVERED_CREDIT", "SERVICE_CREDIT", "requiresPhysicalInspection", "independentFinanceVerifier"]);
contract("lib/enterprise/retail/invoice-return-finance.ts", ["refundPayoutAmount: payoutAmount", "financeApproverUserId", "postPaidRetailInvoiceStockTx", "TransactionIsolationLevel.Serializable"]);
contract("lib/enterprise/retail/invoice-checkout.ts", ["returnLines", "fulfilableLines", "remaining"]);
contract("lib/enterprise/retail/invoice-stock-holds.ts", ['status: "COMPLETED"', "decimalMax"]);
contract("components/enterprise/professional/retail-invoice-return-dialog.tsx", ["UNDELIVERED_CREDIT", "SERVICE_CREDIT", "financeApproverUserId", "requiresPhysicalInspection"]);
contract("components/enterprise/professional/retail-invoice-flow-workbench.tsx", ['"PARTIALLY_PAID", "PAID", "CREDIT_NOTE"', "RetailInvoiceReturnDialog"]);
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/enterprise/retail/invoice-return-settlement-preflight.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise, Set, Map, Date,
  require: (id) => id === "@prisma/client" ? { Prisma } : id === "@/lib/enterprise/retail/errors"
    ? { EnterpriseRetailError } : require(id),
});
const preflight = unit.exports.assertRetailInvoiceReturnSettlementReadinessTx;
function fixture({ paid = "40", outstanding = "60", credit = "100", gross = "100",
  stock = false, goods = false, disposition, snapshot = null, completed = [],
  status = "PARTIALLY_PAID" } = {}) {
  const line = { id: "cl", invoiceItemId: "il", inventoryItemId: goods ? "inventory" : null,
    stockLotId: goods ? "lot" : null, invoiceItem: { quantity: d(1), totalAmount: d(credit),
      netAmount: d(credit).times("0.9"), taxAmount: d(credit).times("0.1") } };
  const request = {
    id: "ret", checkoutId: "checkout", status: "APPROVED", refundAmount: d(credit),
    refundPayoutAmount: snapshot === null ? null : d(snapshot),
    requestedByUserId: "requester", approverUserId: "approver", decidedByUserId: "approver",
    inspectedByUserId: "inspector", inspectedAt: new Date(), inspectionNotes: "Contrôle indépendant documenté",
    lines: [{ id: "rl", checkoutLineId: "cl", quantity: d(1), refundAmount: d(credit),
      refundNetAmount: d(credit).times("0.9"), refundTaxAmount: d(credit).times("0.1"),
      stockDisposition: disposition || (goods ? stock ? "RESTOCK" : "UNDELIVERED_CREDIT" : "SERVICE_CREDIT") }],
    checkout: { id: "checkout", siteId: "site", warehouseId: "warehouse",
      stockPostedAt: stock ? new Date() : null,
      invoice: { id: "inv", status, grandTotal: d(gross), amountPaid: d(paid),
        amountCredited: d(0), outstandingAmount: d(outstanding),
        currencyCode: "CDF", businessPartyId: "customer", receivable: { id: "rec" } },
      lines: [line] },
  };
  const allocations = d(paid).gt(0) ? [{ id: "alloc", paymentId: "pay", amount: d(paid),
    payment: { status: "CONFIRMED", direction: "INBOUND", paymentType: "CUSTOMER_PAYMENT",
      businessPartyId: "customer", currencyCode: "CDF", financialAccountId: "cash" } }] : [];
  return {
    enterpriseRetailInvoiceReturnRequest: { findFirst: async () => request },
    enterprisePaymentAllocation: { findMany: async () => allocations },
    enterpriseStockMovement: { findMany: async () => stock && goods ? [{
      id: "move", sourceLineId: "il", warehouseId: "warehouse",
      inventoryItemId: "inventory", stockLotId: "lot", storageLocationId: "shelf", quantity: d(1),
    }] : [] },
    enterpriseRetailInvoiceReturnLine: { findMany: async () => completed },
    enterpriseFinancialAccount: { findMany: async () => allocations.length
      ? [{ id: "cash", siteId: "site", currencyCode: "CDF" }] : [] },
  };
}
async function success(label, input, payout, stockLines) {
  const result = await preflight(fixture(input), "org", "inv", "ret");
  assert.equal(result.refundAmount.toFixed(2), d(input.credit ?? 100).toFixed(2), label);
  assert.equal(result.payoutAmount.toFixed(2), d(payout).toFixed(2), label);
  assert.equal(result.stockSourcePlan.length, stockLines, label);
  const allocated = result.financeSourcePlan.reduce((sum, value) => sum.plus(value.amount), d(0));
  assert.equal(allocated.toFixed(2), d(payout).toFixed(2), label);
  checked++;
}
await success("Partial payment, full cancellation: credit 100 / refund 40",
  { paid: "40", outstanding: "60", credit: "100" }, "40", 0);
await success("Unpaid goods: credit 100 / refund 0 / no restocking",
  { paid: "0", outstanding: "100", credit: "100", goods: true, status: "ISSUED" }, "0", 0);
await success("Partly paid service: credit 25 / refund 0",
  { paid: "40", outstanding: "60", credit: "25" }, "0", 0);
await success("Delivered goods, paid: credit 100 / refund 100 / restock",
  { paid: "100", outstanding: "0", credit: "100", goods: true, stock: true, status: "PAID" }, "100", 1);
await assert.rejects(preflight(fixture({ paid: "0", outstanding: "100", credit: "100",
  goods: true, disposition: "RESTOCK", status: "ISSUED" }), "org", "inv", "ret"),
  { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID" });
checked++;
await assert.rejects(preflight(fixture({ snapshot: "20" }), "org", "inv", "ret"),
  { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_PAYOUT_CONFLICT" });
checked++;
await assert.rejects(preflight(fixture({ completed: [{ checkoutLineId: "cl", quantity: d(1),
  refundAmount: d("100"), refundNetAmount: d("90"), refundTaxAmount: d("10") }] }), "org", "inv", "ret"),
  { code: "RETAIL_INVOICE_RETURN_SETTLEMENT_LINE_INVALID" });
checked++;
for (const file of ["lib/enterprise/retail/invoice-returns.ts", "lib/enterprise/retail/invoice-checkout.ts",
  "lib/enterprise/retail/invoice-stock-holds.ts", "lib/enterprise/retail/invoice-return-settlement-preflight.ts"]) {
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), new RegExp("Prisma[.]Decimal[.](min|max)[(]"), "Unsupported static Decimal minimum/maximum: " + file);
  checked++;
}
console.log("#1187 " + checked + " static and real Decimal-preflight tests passed; PostgreSQL and owner E2E still required.");
