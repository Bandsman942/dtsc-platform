import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const contracts = read("lib/enterprise/relationship-benefits/contracts.ts");
const management = read("lib/enterprise/relationship-benefits/service.ts");
const adapter = read("lib/enterprise/relationship-benefits/retail-adapter.ts");
const ledger = read("lib/enterprise/relationship-benefits/retail-loyalty.ts");
const sale = read("lib/enterprise/retail/sale-execution.ts");
const retail = read("lib/enterprise/retail/service.ts");
const returns = read("lib/enterprise/retail/returns.ts");
const loyaltyHooks = read("lib/enterprise/retail/loyalty-sale-hooks.ts");
const decision = read("app/api/enterprise/[organizationId]/retail/returns/[returnId]/decision/route.ts");
const form = read("components/enterprise/relationship-benefits/relationship-benefits-admin-workspace.tsx");
const e2e = read("tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs");
let checks = 0;
function verify(condition, explanation) {
  checks += 1;
  assert.ok(condition, explanation);
}

verify(contracts.includes("loyaltyProgramId: z.string().trim().min(1).max(191).optional().nullable()"), "Program IDs are explicitly validated");
verify(management.includes('config.benefitType === "LOYALTY"') && management.includes('config.valueType === "POINTS"') &&
  management.includes('config.actionCode === "NONE"') && management.includes("config.stackable"),
"Loyalty is exclusively an automatic, stackable Retail points benefit");
verify(management.includes("enterpriseRetailLoyaltyProgram.findFirst") && management.includes('status: "ACTIVE"') &&
  management.includes("currencyCode: config.currencyCode!.toUpperCase()") && management.includes(".autoEarn === true"),
"Only active, tenant-scoped, same-currency non-auto-earn programs are accepted");
verify(management.includes("settingsJson: input.benefitType === \"LOYALTY\"") &&
  management.includes("retailLoyaltyProgramId: mergedLoyaltyProgramId"), "Program configuration is persisted without a parallel table");
verify(adapter.includes("resolveRetailRelationshipLoyaltyEffects") &&
  adapter.includes("findActiveRelationshipsForBusinessParty") && adapter.includes("evaluateRelationshipBenefit"),
"Loyalty eligibility requires a live, consented business relationship and server-side conditions");
verify(sale.includes("decisions: finalDecisions") && sale.includes("relationshipResolution.effects, loyaltyEffects"),
"Award is based on final Retail commercial pricing, not list price");
verify(retail.includes("applyRetailRelationshipLoyaltyTx") && retail.includes("reverseRetailRelationshipLoyaltyTx") &&
  retail.indexOf("await applyRetailRelationshipLoyaltyTx") > retail.indexOf("return prisma.$transaction(async (tx) => {"),
"Earn/reversal execute within canonical sale transactions");
verify(ledger.includes('idempotencyKey = `loyalty:relationship:${sale.id}:${effect.benefitId}`') &&
  ledger.includes("organizationId_effectIdempotencyKey") && ledger.includes("RELATIONSHIP_LOYALTY_IDEMPOTENCY_COLLISION"),
"Usage and ledger share a stable sale/benefit idempotency identity");
verify(ledger.includes("pg_advisory_xact_lock") && ledger.includes("FOR UPDATE") &&
  ledger.includes("evaluateRelationshipBenefitSnapshot"),
"Quota and customer account are rechecked under database locks");
verify(ledger.includes("enterprisePersonBusinessReference.findFirst") && ledger.includes("personIdentityId: link.personIdentityId") &&
  ledger.includes("businessPartyId: sale.customerBusinessPartyId"),
"An active identity link cannot be used to credit an unrelated party");
verify(ledger.includes("enterpriseRetailLoyaltyAccount") && ledger.includes("enterpriseRetailLoyaltyEntry.create") &&
  ledger.includes('entryType: "EARN"') && ledger.includes('executionMode: "AUTO_RETAIL_LOYALTY"'),
"No fictional financial usage: canonical Retail EARN and relationship CONSUMED are both written");
verify(ledger.includes("!money(effect.context.transactionAmount || 0).eq(money(sale.grandTotal))"),
"Persisted ticket value is authoritative at commit time");
verify(loyaltyHooks.includes("reverseRetailLoyaltyForCompletedReturnTx") &&
  loyaltyHooks.includes('earned.idempotencyKey.startsWith("loyalty:relationship:")') &&
  loyaltyHooks.includes("earned.points.minus(alreadyReversed)"),
"Refund reversal is proportional, limited to the original award and replay-safe");
verify(returns.includes("reverseRetailLoyaltyForCompletedReturnTx(tx") &&
  returns.includes("reverseRetailRelationshipLoyaltyTx({ tx") &&
  returns.includes("if (fullyReturned)"),
"Refund, accounting, loyalty entries and full-return quota cancellation share one database transaction");
verify(decision.includes("const loyalty = result.loyalty") &&
  !decision.includes("reverseRetailLoyaltyForCompletedReturn("),
"Refund route never creates an independent post-commit loyalty reversal");
verify(retail.includes("reverseRetailRelationshipLoyaltyTx({ tx") &&
  ledger.includes('entryType: "REVERSAL"') && ledger.includes('status: "CANCELLED"'),
"Full sale reversal removes the award and releases the relationship quota");
verify(form.includes('valueType: benefitType === "LOYALTY" ? "POINTS"') &&
  form.includes('value === "LOYALTY"') && form.includes('name="loyaltyProgramId"'),
"Admin form submits POINTS and requires an active program rather than an unusable disabled select");
verify(e2e.includes('test("#906 earns relation-linked Retail points once') &&
  e2e.includes('expect(asNumber(account.pointsBalance)).toBeCloseTo(0') &&
  e2e.includes('expect(usage.executionMode).toBe("AUTO_RETAIL_LOYALTY")'),
"Browser/API coverage checks original award, partial/full returns and one ledger usage");

console.log(`Hotfix #906: ${checks} source-contract checks passed. Browser/E2E and DB execution remain separate CI/owner gates.`);
