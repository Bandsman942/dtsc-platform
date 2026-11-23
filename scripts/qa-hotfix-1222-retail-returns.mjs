import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const read = path => fs.readFileSync(path, "utf8");
const code = ts.transpileModule(read("lib/enterprise/retail/invoice-return-policy.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, {
  exports,
  require: id => {
    if (id === "@prisma/client" || id === "zod") return require(id);
    throw new Error("Unexpected import: " + id);
  },
}, { filename: "invoice-return-policy.ts" });

const {
  readRetailInvoiceReturnPolicy,
  readRetailInvoiceReturnPolicySnapshot,
  retailRefundDecision,
  canSelfInspectRetailReturn,
  mergeRetailInvoiceReturnPolicy,
} = exports;
const { Prisma } = require("@prisma/client");
const money = n => new Prisma.Decimal(n);
const standard = readRetailInvoiceReturnPolicy(null);
assert.equal(standard.mode, "STANDARD", "No legacy tenant can enter simplified settlement implicitly");
assert.equal(standard.allowRequesterInspection, false);
assert.equal(readRetailInvoiceReturnPolicy({ retailInvoiceReturnPolicy: { mode: "SIMPLIFIED" } }).mode, "STANDARD",
  "Malformed policy must fail closed");
const simple = {
  version: 1, mode: "SIMPLIFIED", allowRequesterInspection: true,
  allowDelegatedSelfApproval: true, autoPostCreditNote: true,
  promptImmediateRefund: true, scope: "ALL_SITES",
  expressRefundLimitAmount: 100, expressRefundLimitCurrency: "USD",
};
const stored = mergeRetailInvoiceReturnPolicy({ invoiceCheckoutEnabled: true }, simple);
assert.equal(stored.invoiceCheckoutEnabled, true, "Existing Retail settings preserved");
assert.equal(readRetailInvoiceReturnPolicy(stored).mode, "SIMPLIFIED");
assert.equal(readRetailInvoiceReturnPolicySnapshot(simple).mode, "SIMPLIFIED");
assert.equal(readRetailInvoiceReturnPolicySnapshot(null).mode, "STANDARD");
assert.equal(canSelfInspectRetailReturn(simple, "requester", "requester", true, true), true);
assert.equal(canSelfInspectRetailReturn(simple, "requester", "requester", false, true), false);
assert.equal(canSelfInspectRetailReturn(simple, "requester", "another", true, true), false);
assert.equal(canSelfInspectRetailReturn(simple, "requester", "requester", true, false), false);
assert.equal(canSelfInspectRetailReturn(standard, "requester", "requester", true, true), false);
for (const [credit, due, canceled, payout] of [
  ["100", "100", "100", "0"],
  ["25", "100", "25", "0"],
  ["100", "60", "60", "40"],
  ["25", "60", "25", "0"],
  ["20", "0", "0", "20"],
]) {
  const result = retailRefundDecision(money(credit), money(due));
  assert.equal(result.creditAgainstReceivable.toFixed(2), money(canceled).toFixed(2));
  assert.equal(result.payoutAmount.toFixed(2), money(payout).toFixed(2));
}
const service = read("lib/enterprise/retail/invoice-returns.ts");
assert.match(service, /returnPolicySnapshot: returnPolicy/, "Request must freeze policy");
assert.match(service, /inspectionMode: selfInspector \? "SELF_ATTESTED" : "INDEPENDENT"/, "Inspection evidence");
assert.match(service, /canSelfDecideReturnTx/, "Must still check designated decision maker");
assert.match(service, /requireRetailSiteCapability/, "Site boundary must remain in service");
const settlement = read("lib/enterprise/retail/invoice-return-settlement-preflight.ts");
assert.match(settlement, /requesterInspection/, "Self inspection must be recognized by settlement preflight");
assert.match(settlement, /verifiedDecisionChain/, "Invalid historical request must remain blocked");
const unpaidExpress = read("lib/enterprise/retail/invoice-return-unpaid-express.ts");
assert.match(unpaidExpress, /plan\.payoutAmount\.isZero\(\)/, "Express must remain strictly zero-payout even for partially paid invoices");
assert.match(unpaidExpress, /checkout\.stockPostedAt/, "Express must not return already shipped stock without canonical settlement");
assert.match(unpaidExpress, /plan\.payoutAmount\.isZero\(\)/, "Zero refund payout is mandatory");
assert.match(service, /settleUnpaidRetailInvoiceCreditTx\(/, "Decision service must invoke atomic zero-payout settlement inside its own transaction");
assert.match(unpaidExpress, /postBusinessEventTx/, "Use the canonical journal posting");
assert.match(unpaidExpress, /"COMPLETED"/, "Return should be completed in the same transaction");
assert.match(unpaidExpress, /refundPayoutAmount: new Prisma\.Decimal\(0\)/, "Never create a phantom refund");
const e2eSource = read("tests/e2e/shop2-invoice-finance-lifecycle.spec.mjs");
assert.match(e2eSource, /exerciseExpressUnpaidCredit/, "HTTP and PostgreSQL acceptance must cover unpaid invoices");
assert.match(e2eSource, /quantity: "0\.5"/, "HTTP and PostgreSQL acceptance must cover partial credits");
assert.match(e2eSource, /financePayload\.items\[0\]\.retailOrigin/, "HTTP and PostgreSQL acceptance must check Finance provenance");
const creditRoute = read("app/api/enterprise/[organizationId]/sales-credit-notes/route.ts");
assert.match(creditRoute, /retailOrigin:/, "Finance must surface canonical Retail source");
assert.match(creditRoute, /!retailByInvoice\.has\(item\.salesInvoiceId\)/, "Finance direct posting must be hidden");
const finance = read("components/enterprise/professional/enterprise-finance-invoices-workspace.tsx");
assert.match(finance, /data-retail-credit-provenance/, "Finance return detail must be actionable");
assert.match(finance, /retailCreditOriginAction/, "Finance must show a Retail deep link");
const schema = read("prisma/enterprise-retail-invoice-checkout.prisma");
assert.match(schema, /returnPolicySnapshot Json\?/, "Snapshot schema required");
assert.match(read("prisma/migrations/20261123160000_retail_express_return_inspection_policy/migration.sql"), /ADD COLUMN IF NOT EXISTS "returnPolicySnapshot"/);
const route = read("app/api/enterprise/[organizationId]/retail/return-policy/route.ts");
assert.match(route, /hasRecentStepUp/, "Owner changes require step-up");
assert.match(route, /RETAIL_OWNER_ROLES/, "Never grant owner controls to store MANAGER");
assert.match(route, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/, "Optimistic revision and serialized update");
console.log("HOTFIX #1222 policy/inspection/credit-source QA: PASS (source + pure behavior; not PostgreSQL/browser E2E)");
