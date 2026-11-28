import assert from "node:assert/strict";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { workflowTestLoader } from "./lib/workflow-test-loader.mjs";

const load = workflowTestLoader({});
const { buildMerchandiseChartDraft, previewMerchandisePolicyLines, SYSCOHADA_MERCHANDISE_DRAFT_REFERENCE, SYSCOHADA_MERCHANDISE_SOURCE } = load("@/lib/enterprise/accounting/syscohada-merchandise-policy-draft");
const { getDefaultChartTemplate, getChartTemplate, validateChartTemplate } = load("@/lib/enterprise/accounting/chart-template-registry");
const { validateTemplateSemanticCoverage } = load("@/lib/enterprise/accounting/semantic-account-registry");
const baseline = getDefaultChartTemplate();
const original = JSON.stringify(baseline);
const draft = buildMerchandiseChartDraft(baseline);
assert.equal(draft.status, "DRAFT");
assert.equal(draft.source.kind, "DTSC_INTERNAL");
assert.equal(JSON.stringify(baseline), original);
assert.equal(getDefaultChartTemplate().version, "0.1.0");
assert.equal(getChartTemplate(SYSCOHADA_MERCHANDISE_DRAFT_REFERENCE), undefined, "Partial draft must not be registered for runtime activation");
assert.equal(validateChartTemplate(draft).valid, true);
assert.equal(validateTemplateSemanticCoverage(draft).valid, true);
assert.equal(validateTemplateSemanticCoverage(baseline).valid, true);
assert.match(SYSCOHADA_MERCHANDISE_SOURCE.sha256, /^[a-f0-9]{64}$/);
assert.ok(fs.readFileSync("docs/AUDIT_1228_SYSCOHADA_INVENTORY.md", "utf8").includes(SYSCOHADA_MERCHANDISE_SOURCE.sha256));
assert.throws(() => buildMerchandiseChartDraft(draft), /BASELINE_INVALID/);
assert.equal(draft.accounts.length, baseline.accounts.length + 1);
assert.equal(draft.semanticMappings.length, baseline.semanticMappings.length + 2);
assert.ok(draft.financialStatementMappings.find(row => row.lineCode === "IS_PURCHASES").accountCodes.includes("6031"));

const mappings = new Map(draft.semanticMappings.map(row => [row.mappingKey, row.accountCode]));
const balances = new Map();
const Decimal = Prisma.Decimal.clone({ precision: 48 });
const preview = (event, amount, extra = {}) => previewMerchandisePolicyLines({
  event, amount, merchandiseClass: "MERCHANDISE", valuationMethod: "WEIGHTED_AVERAGE", currencyCode: "CDF",
  ...extra,
});
const append = (lines) => {
  let net = new Decimal(0);
  for (const line of lines) {
    const account = mappings.get(line.accountMappingKey);
    assert.ok(account);
    const signed = new Decimal(line.debit || 0).minus(line.credit || 0);
    net = net.plus(signed);
    balances.set(account, (balances.get(account) || new Decimal(0)).plus(signed));
  }
  assert.equal(net.toFixed(), "0");
};
const balance = account => (balances.get(account) || new Decimal(0)).toFixed();
const origin = { originPolicyReference: SYSCOHADA_MERCHANDISE_DRAFT_REFERENCE };
append(preview("RECEIPT", "100.000001"));
assert.equal(balance("311"), "100.000001");
assert.equal(balance("601"), "100.000001");
assert.equal(balance("6031"), "-100.000001");
append(preview("SUPPLIER_INVOICE", "100.000001"));
assert.equal(balance("471"), "0");
append(preview("ISSUE", "60.000001"));
assert.equal(balance("311"), "40");
assert.equal(balance("6031"), "-40");
append(preview("CUSTOMER_RETURN", "10", origin));
append(preview("SUPPLIER_RETURN", "20", origin));
append(preview("SUPPLIER_CREDIT", "20", origin));
assert.equal(balance("311"), "30");
assert.equal(balance("601"), "80.000001");
assert.equal(balance("6031"), "-30");
assert.equal(balance("471"), "0");
assert.equal(new Decimal(balance("601")).plus(balance("6031")).toFixed(), "50.000001");
assert.throws(() => preview("CUSTOMER_RETURN", "10"), /ORIGIN_POLICY_REQUIRED/);
assert.throws(() => preview("SUPPLIER_RETURN", "10", { originPolicyReference: "OHADA_SYSCOHADA@0.1.0" }), /ORIGIN_POLICY_REQUIRED/);
for (const amount of ["0", "-1", "0.0000001", "NaN", "1000000000000000"]) assert.throws(() => preview("ISSUE", amount), /AMOUNT_INVALID/);
assert.throws(() => preview("ISSUE", "1", { merchandiseClass: "RAW_MATERIALS" }), /SCOPE_UNSUPPORTED/);
assert.throws(() => preview("ISSUE", "1", { valuationMethod: "FIFO" }), /SCOPE_UNSUPPORTED/);
assert.throws(() => preview("TRANSFER", "1"), /SCOPE_UNSUPPORTED/);
console.log("PASS #1228: isolated merchandise policy draft, baseline unchanged, balanced preview and refusal of unsupported cases");
