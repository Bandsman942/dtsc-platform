import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
class AccountingError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const state = {
  source: "EnterpriseSalesInvoice", invoiceId: "invoice-A", currencies: [{ currencyCode: "CDF" }],
  valuationCalls: [], rejectValuation: false,
};
const tx = {
  enterpriseStockMovement: { findFirst: async ({ where }) =>
    where.sourceEntityType === state.source && where.sourceEntityId === state.invoiceId
      ? { id: "movement-A", inventoryItemId: "stock-A", warehouseId: "warehouse-A" }
      : null },
  enterpriseInventoryCostLayer: { findMany: async ({ where }) => {
    assert.equal(where.organizationId, "tenant-A");
    assert.equal(where.inventoryItemId, "stock-A");
    assert.equal(where.warehouseId, "warehouse-A");
    return state.currencies;
  } },
};
const compiled = ts.transpileModule(fs.readFileSync("lib/enterprise/retail/accounting.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const unit = { exports: {} };
vm.runInNewContext(compiled, {
  module: unit, exports: unit.exports, Promise, Map, Set,
  require: (id) => {
    if (id === "@/lib/enterprise/accounting/errors") return { EnterpriseAccountingError: AccountingError };
    if (id === "@/lib/enterprise/accounting/inventory-accounting-service") return {
      valueInventoryIssueTx: async (_tx, org, movementId, actor, input) => {
        if (state.rejectValuation) throw new AccountingError("INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN", 409);
        state.valuationCalls.push({ org, movementId, actor, currencyCode: input.currencyCode });
        return { event: { id: "issue-A", status: "POSTED" } };
      },
    };
    if (id === "@/lib/enterprise/accounting/helpers") return {};
    if (id === "@/lib/enterprise/accounting/posting-service") return {};
    if (id === "@/lib/prisma") return {};
    return require(id);
  },
});
const { valueRetailInvoiceFulfillmentIssueTx: issue } = unit.exports;
assert.equal(typeof issue, "function");
const attempt = () => issue(tx, "tenant-A", "cashier-A", "movement-A", "invoice-A", "CDF");
state.source = "EnterpriseRetailSale";
await assert.rejects(attempt(), { code: "RETAIL_INVOICE_FULFILLMENT_MOVEMENT_INVALID" });
state.source = "EnterpriseSalesInvoice";
state.invoiceId = "invoice-B";
await assert.rejects(attempt(), { code: "RETAIL_INVOICE_FULFILLMENT_MOVEMENT_INVALID" });
state.invoiceId = "invoice-A";
state.currencies = [];
await assert.rejects(attempt(), { code: "RETAIL_INVENTORY_COST_LAYER_REQUIRED" });
state.currencies = [{ currencyCode: "USD" }, { currencyCode: "EUR" }];
await assert.rejects(attempt(), { code: "RETAIL_INVENTORY_VALUATION_CURRENCY_AMBIGUOUS" });
state.currencies = [{ currencyCode: "CDF" }, { currencyCode: "USD" }];
await attempt();
assert.deepEqual(state.valuationCalls.at(-1), { org: "tenant-A", movementId: "movement-A", actor: "cashier-A", currencyCode: "CDF" });
state.currencies = [{ currencyCode: "USD" }];
await attempt();
assert.equal(state.valuationCalls.at(-1).currencyCode, "USD", "A single cost-layer currency is an explicit source");
state.rejectValuation = true;
await assert.rejects(attempt(), { code: "INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN" });

const checkout = fs.readFileSync("lib/enterprise/retail/invoice-checkout.ts", "utf8");
assert.match(checkout, /const issued = await applyStockMovementTx\(/);
assert.match(checkout, /await valueRetailInvoiceFulfillmentIssueTx\([\s\S]*?issued\.movement\.id,[\s\S]*?checkout\.salesInvoiceId, checkout\.invoice\.currencyCode/);
assert.match(checkout, /await tx\.enterpriseRetailInvoiceCheckout\.update\(/);
const payment = fs.readFileSync("lib/enterprise/accounting/payments-service.ts", "utf8");
assert.match(payment, /postPaidRetailInvoiceStockTx\(tx, organizationId, receivable\.salesInvoiceId, actorUserId\)/);
const accounting = fs.readFileSync("lib/enterprise/retail/accounting.ts", "utf8");
assert.match(accounting, /eventType: "ISSUE",\s*status: "POSTED"/);
const retailHttp = fs.readFileSync("lib/enterprise/retail/http.ts", "utf8");
for (const code of ["RETAIL_ORIGINAL_ISSUE_VALUATION_REQUIRED", "RETAIL_INVENTORY_COST_LAYER_REQUIRED",
  "INVENTORY_ACCOUNTING_NEGATIVE_STOCK_FORBIDDEN", "INVENTORY_WEIGHTED_AVERAGE_REQUIRED",
  "OPEN_CASH_SESSION_REQUIRED", "PAYMENT_CASH_SESSION_AMBIGUOUS"]) {
  assert.match(retailHttp, new RegExp(`\\b${code}: "[^"\\n]{24,}"`), `${code} must surface a contextualized business error`);
}
console.log("✓ Retail invoice paid-stock original issue valuation: strict source, weighted-average cost currency, rollback on missing layers, return basis and same Finance transaction");
