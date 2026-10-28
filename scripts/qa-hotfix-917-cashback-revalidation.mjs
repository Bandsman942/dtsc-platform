import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const service = read("lib/enterprise/relationship-benefits/omnichannel-cashback.ts");
const proof = read("lib/enterprise/relationship-benefits/omnichannel-payment-proof.ts");
const execution = read("lib/enterprise/retail/omnichannel-returns.ts");
const posting = read("lib/enterprise/accounting/sector-adapters/retail-relationship-credit.ts");
const allocation = read("lib/enterprise/accounting/payments-service.ts");
const fulfillment = read("lib/enterprise/crm-sales/fulfillments.ts");
const retry = read("lib/enterprise/retail/transaction-retry.ts");
const behavioral = read("tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs");

const grantStart = service.indexOf("export async function tryGrantRetailOmnichannelCashbackTx(");
const grantEnd = service.indexOf("export async function reverseRetailOmnichannelCashbackTx(", grantStart);
assert.ok(grantStart >= 0 && grantEnd > grantStart, "Canonical earn path must remain explicit");
const grant = service.slice(grantStart, grantEnd);

const expected = [
  ["canUseModule(organizationId, \"RETAIL_POS\")", "Retail entitlement must be renewed at grant"],
  ["canUseModule(organizationId, \"RELATIONSHIP_BENEFITS\")", "Relationship entitlement must be renewed at grant"],
  ["include: { audiences: true }", "Current benefit audiences required at grant"],
  ["enterpriseRelationshipBenefitAssignment.findFirst", "Current assignment required at grant"],
  ["id: { not: usage.id }", "Current reserved quota must not self-block issuance"],
  ["evaluateRelationshipBenefitSnapshot({", "Full eligibility must be revalidated at grant"],
  ["context: contexts, now: new Date(), requireBusinessContext: true", "Use current date and immutable source context"],
  ["if (!reevaluated.allowed) continue", "Fail closed on withdrawn/expired benefits"],
  ["changeRelationalStoreCreditTx({", "Use canonical store credit ledger"],
  ["postBusinessEventTx(tx", "GL must be posted atomically with EARN"],
];
for (const [needle, message] of expected) assert.ok(grant.includes(needle), message);
assert.ok(service.includes("reservationContext: {"), "Order must record a safe context snapshot");
assert.ok(service.includes("effect.context.occurredAt.toISOString()"), "Store JSON-safe original timestamp");
assert.ok(proof.includes('status: "PAID"') || proof.includes('status !== "PAID"'), "Real paid invoice proof required");
assert.ok(proof.includes("paymentAllocations"), "Confirmed Finance allocations required");
assert.ok(execution.includes("reverseRetailOmnichannelCashbackTx({"), "Return must invoke canonical reversal");
assert.ok(!execution.includes("({ organizationId, salesOrderItemId: line.salesOrderItemId"), "Nested return lines must inherit tenant scope through Prisma parent relation");
assert.ok(posting.includes("EnterpriseRetailStoredValueEntry"), "Financial journal must follow Store Credit source");
assert.ok(behavioral.includes("audienceWithdrawn"), "Real E2E must withdraw audience before earning");
assert.ok(behavioral.includes("benefitExpired"), "Real E2E must refuse expired late benefits");
assert.ok(behavioral.includes("concurrentSettlement"), "E2E must race Finance allocation and fulfillment");
assert.ok(behavioral.includes("partialSettlement"), "E2E must refuse partially allocated customer payments");
assert.ok(behavioral.includes("initiallyUnconfirmed"), "E2E must deny unconfirmed customer payment before allocation");
assert.ok(behavioral.includes("returnPending"), "E2E must block credit if a return is pending");
assert.ok(behavioral.includes('#917 real partial then full omnichannel refunds reverse only earned cashback'), "Real refund scenario missing");
assert.ok(behavioral.includes('omnichannel/returns/${ret.id}/prepare'), "Finance refund preparation API must be exercised");
assert.ok(behavioral.includes('omnichannel/returns/${ret.id}/settle'), "Confirmed refund settlement API must be exercised");
assert.ok(behavioral.includes('status).toBe("COMPLETED")'), "Return must complete only after financial settlement");
assert.ok(behavioral.includes('returnId:') || behavioral.includes("idempotent).toBe(true)"), "Refund replay must be idempotent");
assert.ok(behavioral.includes('postingEvent: "RETAIL_RELATIONSHIP_CREDIT_REVERSED"'), "Refund must verify double-entry posted reversal");
assert.ok(behavioral.includes('index === 0 ? "CONSUMED" : "CANCELLED"'), "Partial/full refund must preserve/release usage in sequence");
assert.ok(behavioral.includes('status: "PENDING_APPROVAL", currencyCode: fixture.currencyCode'), "E2E refund request must have canonical pending status");
assert.ok(behavioral.includes('expect(pending.response.status()).toBeGreaterThanOrEqual(400)'), "Unconfirmed payments must be rejected by Finance");
assert.ok(behavioral.includes("amount: String(half)"), "Actual partial allocation must use the canonical Finance API");
assert.ok(behavioral.includes("Promise.all([allocate(), fulfill()])"), "Concurrent settlement must use two real HTTP operations");
assert.ok(service.includes("RELATIONSHIP_OMNI_CASHBACK_REVERSAL_OVERFLOW"), "Over-reversed ledger must fail closed");
assert.ok(service.includes("alreadyReversed.gt(earned.amount)"), "Reversal must never exceed original EARN");
assert.ok(allocation.includes("await withRetailTransactionRetry(() => prisma.$transaction("), "Finance allocation must retry serializable clashes");
assert.ok(fulfillment.includes("return withRetailTransactionRetry(() => prisma.$transaction("), "Sales fulfillment must retry serializable clashes");
assert.ok(retry.includes('"P2034"'), "Retries must be restricted to Prisma serializable conflicts");
assert.ok(retry.includes("maxAttempts"), "Retry attempts must be bounded");
assert.ok(behavioral.includes('data: { relationType: "OTHER" }'), "E2E must mutate the canonical audience");
assert.ok(behavioral.includes('expect(withheld.status).toBe("REQUESTED")'), "E2E must prove no consumed status");
console.log("HOTFIX #917: structural late-eligibility, concurrency and reversal-integrity checks passed. Owner E2E and financial refund suite remain independent.");
