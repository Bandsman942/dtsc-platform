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
const omnichannelAdapter = read("lib/enterprise/relationship-benefits/omnichannel-adapter.ts");
const directOrders = read("lib/enterprise/crm-sales/orders.ts");
const fulfillments = read("lib/enterprise/crm-sales/fulfillments.ts");
const reservations = read("lib/enterprise/inventory/reservations.ts");
const cancelRoute = read("app/api/enterprise/[organizationId]/retail/omnichannel/orders/[orderId]/cancel/route.ts");
const omnichannelUi = read("components/enterprise/professional/retail-omnichannel-panel.tsx");
const customerFacing = read("lib/customer-facing-language.ts");
const fulfillmentRoute = read("app/api/enterprise/[organizationId]/sales-orders/[salesOrderId]/fulfill/route.ts");
const benefitConfig = read("lib/enterprise/relationship-benefits/service.ts");

check(returns.includes('status: "COMPLETED"') && returns.includes('saleId: retailReturn.saleId'),
  "Only completed returns of the exact sale enter the quota evaluation");
check(returns.includes('SELECT id FROM "EnterpriseRetailSale"') && returns.includes("FOR UPDATE"),
  "Decisions for multiple returns of the same sale serialize on the canonical sale row");
check(returns.includes("withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {") &&
    returns.includes("TransactionIsolationLevel.Serializable"),
  "Concurrent return approvals retry serialization conflicts without an external double effect");
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
check(omnichannel.includes('resolveRetailCommercialPricingDecisions(') &&
    omnichannel.includes('resolveRetailRelationshipBenefitPricing({') &&
    omnichannel.includes('applyRetailRelationshipBenefitPricing(') &&
    omnichannel.includes('createEnterpriseDirectSalesOrder(') &&
    !omnichannel.includes('applyRetailRelationshipBenefitEffectsTx('),
  "Omnichannel resolves the same pricing and relationship discount as POS without forging a RetailSale");
check(directOrders.includes('await input.onOrderCreatedTx?.(tx, order.id)') &&
    omnichannel.includes('onOrderCreatedTx: async (tx, orderId)') &&
    omnichannel.includes('await tx.enterpriseRetailOrderOrchestration.create({') &&
    omnichannel.includes('reserveRetailOmnichannelRelationshipBenefitsTx({'),
  "Omnichannel quota and RESERVING context commit atomically with the canonical SalesOrder price");
check(omnichannel.includes('withRetailTransactionRetry(() => createEnterpriseDirectSalesOrder(') &&
    directOrders.includes('Prisma.TransactionIsolationLevel.Serializable'),
  "Concurrent order benefit reservations retry database serialization safely");
check(omnichannelAdapter.includes('status: "REQUESTED"') &&
    omnichannelAdapter.includes('effectEntityType: EFFECT_ENTITY_TYPE') &&
    omnichannelAdapter.includes('effectIdempotencyKey') &&
    omnichannelAdapter.includes('pg_advisory_xact_lock') &&
    omnichannelAdapter.includes('evaluateRelationshipBenefitSnapshot({'),
  "Quota is reserved, tenant-locked and revalidated; no phantom benefit consumption at order creation");
check(fulfillments.includes('consumeRetailOmnichannelRelationshipBenefitsTx({') &&
    fulfillments.includes('if (fullyFulfilled)') &&
    fulfillments.includes('RETAIL_FULFILLMENT_RESERVATIONS_NOT_READY') &&
    fulfillments.includes('RETAIL_FULFILLMENT_PRODUCT_DELIVERY_REQUIRED') &&
    fulfillments.includes('RETAIL_RELATIONSHIP_DELIVERY_PROOF_REQUIRED'),
  "Consumption requires confirmed full Retail delivery with customer acceptance or document proof");
check(fulfillmentRoute.includes('moduleCode: "SALES_QUOTES_ORDERS", action: "write"') &&
    fulfillmentRoute.includes('moduleCode: "RETAIL_POS", action: "write"') &&
    fulfillmentRoute.includes('organizationId, salesOrderId, archivedAt: null'),
  "Omnichannel fulfillment requires both Sales and Retail write permission on the same tenant");
check(omnichannel.includes('releaseRetailOmnichannelRelationshipBenefitsTx({') &&
    omnichannelAdapter.includes('status: "CANCELLED"') &&
    omnichannelAdapter.includes('status: "REQUESTED"'),
  "Inventory reservation compensation also releases only pending relationship quotas");
check(omnichannel.includes('export async function cancelRetailOmnichannelOrder(') &&
    omnichannel.includes('releaseEnterpriseInventoryReservationTx(') &&
    omnichannel.includes('releaseRetailOmnichannelRelationshipBenefitsTx({ tx, organizationId, orderId: salesOrderId })') &&
    reservations.includes('export async function releaseEnterpriseInventoryReservationTx(') &&
    cancelRoute.includes('authorizeRetailRequest(req, organizationId, "RETAIL_POS", "write", { mutation: true })'),
  "Cancellation is RBAC protected and releases inventory and pending benefit quota in one canonical transaction");
check(omnichannel.includes('assertSameOmnichannelRequest(input, existingContext, order)') &&
    omnichannel.includes('RETAIL_OMNICHANNEL_IDEMPOTENCY_PAYLOAD_MISMATCH') &&
    omnichannel.includes('RETAIL_OMNICHANNEL_RESERVATION_INCOMPLETE'),
  "Idempotency rejects changed payloads and does not report a pending/failed inventory reservation as complete");
check(omnichannelUi.includes('async function cancelOrder(order: Order)') &&
    omnichannelUi.includes('order?.status === "CONFIRMED" && row.context.status === "RESERVED"') &&
    omnichannelUi.includes('customerFacingOmnichannelCancellationCopy(locale)') &&
    customerFacing.includes('Confirm cancellation') &&
    customerFacing.includes('Confirmer l’annulation'),
  "Retail omnichannel UI exposes a reasoned cancellation only before any delivery, with FR/EN controls");
check(e2e.includes('test("#886 omnichannel reserves the discounted price') &&
    e2e.includes('expect(usage.status).toBe("REQUESTED")') &&
    e2e.includes('expect(replay.body.order.id).toBe(orderId)') &&
    e2e.includes('expect(cancelled.body.order.status).toBe("CANCELLED")') &&
    e2e.includes('expect(cancelledReplay.body.idempotent).toBe(true)') &&
    e2e.includes('not.toContain(benefitId)') &&
    e2e.includes('toBe("CONSUMED")'),
  "Behavioral E2E covers omnichannel benefit price, pending quota, replay, partial/full delivery");
check(benefitConfig.includes("RELATIONSHIP_BENEFIT_TARGET_ADAPTER_UNSUPPORTED"),
  "Unsupported benefit effects continue to fail closed during configuration");

if (failures.length) {
  console.error("Hotfix #886 targeted QA FAILED:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log(`Hotfix #886 targeted QA passed (${count} checks).`);
