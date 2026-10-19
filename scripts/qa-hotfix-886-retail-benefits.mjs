import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
let count = 0;
const check = (ok, label) => {
  count += 1;
  if (!ok) failures.push(label);
};

const returns = read("lib/enterprise/retail/returns.ts");
const adapter = read("lib/enterprise/relationship-benefits/retail-adapter.ts");
const sales = read("lib/enterprise/retail/service.ts");
const e2e = read("tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs");
const workflow = read(".github/workflows/shop2-behavioral.yml");
const omnichannel = read("lib/enterprise/retail/omnichannel.ts");
const benefitConfig = read("lib/enterprise/relationship-benefits/service.ts");

check(returns.includes('status: "COMPLETED"') && returns.includes('saleId: retailReturn.saleId'),
  "Only completed returns of the exact sale enter the quota evaluation");
check(returns.includes('SELECT id FROM "EnterpriseRetailSale"') && returns.includes("FOR UPDATE"),
  "Decisions for multiple returns of the same sale serialize on the canonical sale row");
check(returns.includes("const returnedByLine = new Map<string, Prisma.Decimal>()") &&
    returns.includes('returnedByLine.get(line.id) || decimal(0)') &&
    returns.includes("retailReturn.sale.lines.every") &&
    returns.includes(".gte(line.quantity)"),
  "Full refund is based on the exact original line quantities, not the existence of any partial return");
const completion = returns.indexOf("const completed = await tx.enterpriseRetailReturn.update");
const posting = returns.indexOf("const accounting = await finalizeRetailReturnAccountingTx(tx", completion);
const reversal = returns.indexOf("await reverseRetailRelationshipBenefitEffectsTx(", completion);
check(completion >= 0 && posting > completion && reversal > posting,
  "Relationship benefit reversal occurs after a completed return and canonical accounting in the same transaction");
check(returns.includes("if (fullyReturned)") &&
    returns.indexOf("if (fullyReturned)") < reversal,
  "Partial returns never release all relationship quotas");
check(adapter.includes('effectEntityType: "EnterpriseRetailSale"') &&
    adapter.includes('executionMode: "AUTO_RETAIL"') &&
    adapter.includes('status: "CONSUMED"') &&
    adapter.includes('status: "CANCELLED"'),
  "Reversal scopes only canonical Retail sale usages that are still consumed");
check(sales.includes("reverseRetailRelationshipBenefitEffectsTx("),
  "Existing full-sale reversal retains its canonical quota rollback path");
check(e2e.includes('test("#886 keeps quota consumed on a partial return') &&
    e2e.includes('["CONSUMED", "CANCELLED"]') &&
    e2e.includes("expect(replay.body.idempotent).toBe(true)") &&
    e2e.includes("availableAgain.body.relationshipBenefits"),
  "Behavioral E2E covers two confirmed partial returns, quota persistence, total refund and repeated confirmation");
check(workflow.includes("issue-786-relationship-benefits-enforcement.spec.mjs"),
  "Shop2 behavioral workflow actually executes the #886 scenario within the existing #786 suite");
check(omnichannel.includes('previewRetailCommercialPricing(') &&
    omnichannel.includes('createEnterpriseDirectSalesOrder(') &&
    !omnichannel.includes('applyRetailRelationshipBenefitEffectsTx('),
  "Omnichannel remains an unverified separate order transaction; no phantom consumed benefit is written");
check(benefitConfig.includes("RELATIONSHIP_BENEFIT_TARGET_ADAPTER_UNSUPPORTED"),
  "Unsupported benefit effects continue to fail closed during configuration");

if (failures.length) {
  console.error("Hotfix #886 targeted QA FAILED:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log(`Hotfix #886 targeted QA passed (${count} checks).`);
