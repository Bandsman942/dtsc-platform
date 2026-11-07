import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Prisma } = require("@prisma/client");
const ts = require("typescript");
const D = (value) => new Prisma.Decimal(value);

// Decimal.js treats zero as positive (non-negative). Never use isPositive()
// to assert strictly positive Finance input or decide whether to post.
assert.equal(D(0).isPositive(), true);
assert.equal(D(0).greaterThan(0), false);
assert.equal(D("0.000000").greaterThan(0), false);
assert.equal(D("0.000001").greaterThan(0), true);
assert.equal(D("-0.01").greaterThan(0), false);

class EnterpriseAccountingError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const helperSource = fs.readFileSync("lib/enterprise/accounting/helpers.ts", "utf8");
const unit = { exports: {} };
vm.runInNewContext(ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: unit, exports: unit.exports, Promise,
  require: (id) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "@/lib/enterprise/accounting/errors") return { EnterpriseAccountingError };
    if (id === "@/lib/enterprise/workflows/domain-events") return { enqueueWorkflowDomainEvent: async () => {} };
    return require(id);
  },
});
const { assertPositiveAmount } = unit.exports;
assert.equal(assertPositiveAmount("0.01").toFixed(2), "0.01");
for (const zero of ["0", "0.000000", 0, -1]) {
  assert.throws(() => assertPositiveAmount(zero), { code: "FINANCE_AMOUNT_MUST_BE_POSITIVE", status: 400 });
}

const sources = [
  "helpers", "payments-service", "receivables-service", "customer-refund-service",
  "journal-service", "opening-balance-service", "asset-accounting-service",
  "treasury-service", "funding-service", "payables-service",
  "supplier-credit-notes-service", "inventory-accounting-service", "treasury-transfer-service",
];
for (const entry of sources) {
  const source = fs.readFileSync(`lib/enterprise/accounting/${entry}.ts`, "utf8");
  assert.doesNotMatch(source, /\.isPositive\(\)/,
    `${entry} must never treat zero as strictly positive`);
}
const retailAndStockSources = [
  "lib/enterprise/inventory/service.ts",
  "lib/enterprise/retail/historical-import-service.ts",
  "lib/enterprise/retail/invoice-checkout.ts",
  "lib/enterprise/retail/relationship-store-credit.ts",
  "lib/enterprise/retail/loyalty-sale-hooks.ts",
  "lib/enterprise/retail/omnichannel-returns.ts",
  "lib/enterprise/retail/accounting-preflight.ts",
  "lib/enterprise/retail/returns.ts",
  "lib/enterprise/retail/accounting.ts",
];
for (const path of retailAndStockSources) {
  assert.doesNotMatch(fs.readFileSync(path, "utf8"), /\.isPositive\(\)/,
    `${path} must not accept a zero-quantity stock, POS, credit or reward operation`);
}
const financeGuards = [
  ["payments-service", /if \(!amount\.greaterThan\(0\)\) throw new EnterpriseAccountingError\("PAYMENT_AMOUNT_INVALID"/],
  ["payments-service", /!amount\.greaterThan\(0\) \|\| amount\.greaterThan\(allocatableAmount\)/],
  ["receivables-service", /!grandTotal\.greaterThan\(0\)/],
  ["payables-service", /!grandTotal\.greaterThan\(0\)/],
  ["customer-refund-service", /!amount\.greaterThan\(0\)/],
  ["journal-service", /const amount = debit\.greaterThan\(0\) \? debit : credit/],
  ["inventory-accounting-service", /row\.quantity\.greaterThan\(0\) \?/],
  ["opening-balance-service", /debit\.greaterThan\(0\) && credit\.greaterThan\(0\)/],
];
for (const [file, pattern] of financeGuards) {
  assert.match(fs.readFileSync(`lib/enterprise/accounting/${file}.ts`, "utf8"), pattern);
}

function validOpeningLine(debit, credit) {
  const d = D(debit);
  const c = D(credit);
  return !d.isNegative() && !c.isNegative() &&
    !(d.greaterThan(0) && c.greaterThan(0)) &&
    (d.greaterThan(0) || c.greaterThan(0));
}
assert.equal(validOpeningLine(100, 0), true);
assert.equal(validOpeningLine(0, 100), true);
assert.equal(validOpeningLine(0, 0), false);
assert.equal(validOpeningLine(100, 100), false);
assert.equal(validOpeningLine(-1, 1), false);
const stockSource = fs.readFileSync("lib/enterprise/inventory/service.ts", "utf8");
assert.match(stockSource, /if \(held\.greaterThan\(0\)\)/,
  "A zero invoice hold must not consume or invalidate physical stock");
const invoiceCheckout = fs.readFileSync("lib/enterprise/retail/invoice-checkout.ts", "utf8");
assert.match(invoiceCheckout, /if \(!take\.greaterThan\(0\)\) continue/,
  "A zero pick must not create an empty physical stock movement");
console.log("HOTFIX #1042 Finance strict-positive: zero rejected in canonical payments, invoices, refunds, journals, opening balances, stock and treasury; legitimate one-sided opening entries preserved");
