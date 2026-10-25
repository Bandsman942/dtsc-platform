import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const service = read("lib/enterprise/retail/omnichannel-returns.ts");
const model = read("prisma/enterprise-retail-offline-omnichannel.prisma");
const migration = read("prisma/migrations/20261025100000_retail_omnichannel_order_returns/migration.sql");
const request = read("app/api/enterprise/[organizationId]/retail/omnichannel/orders/[orderId]/returns/route.ts");
const decision = read("app/api/enterprise/[organizationId]/retail/omnichannel/returns/[returnId]/decision/route.ts");
const prepare = read("app/api/enterprise/[organizationId]/retail/omnichannel/returns/[returnId]/prepare/route.ts");
const settle = read("app/api/enterprise/[organizationId]/retail/omnichannel/returns/[returnId]/settle/route.ts");
const ui = read("components/enterprise/professional/retail-omnichannel-panel.tsx");
const dictionary = read("lib/customer-facing-language.ts");
const e2e = read("tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs");
const fulfillment = read("lib/enterprise/crm-sales/fulfillments.ts");
const inventoryAccounting = read("lib/enterprise/retail/accounting.ts");
let checks = 0;
const check = (predicate, reason) => { checks += 1; assert.ok(predicate, reason); };

check(model.includes("model EnterpriseRetailOmnichannelReturn") && model.includes("model EnterpriseRetailOmnichannelReturnLine") &&
  model.includes("@@unique([organizationId, idempotencyKey])"), "Tenant scoped operational return model with persisted idempotency");
check(migration.includes('REFERENCES "EnterpriseSalesOrder"') && migration.includes('REFERENCES "EnterpriseSalesOrderItem"'), "Additive FK migration preserves tenant-scoped order sources");
check(service.includes('SELECT id FROM "EnterpriseSalesOrder"') && service.includes("FOR UPDATE") &&
  service.includes("TransactionIsolationLevel.Serializable") && service.includes("withRetailTransactionRetry"),
"Return quantities and full quota resolution are serialized on canonical order");
check(service.includes('retailReturn: { salesOrderId, status: { not: "REJECTED" } }') &&
  service.includes("source.quantityFulfilled.minus(usedQuantity)") && service.includes("isFinal"),
"Partial returns reserve quantities, final residual uses exact original price");
check(service.includes("invoiceMatches.length !== 1") && service.includes("!invoiceMatches[0].grandTotal.equals(order.totalAmount)"),
"Orders with no matching canonical invoice fail closed");
check(service.includes('payment.direction !== "INBOUND"') && service.includes('payment.paymentType !== "CUSTOMER_PAYMENT"') &&
  service.includes('allocation.status !== "CONFIRMED"') && service.includes("assertEligiblePaymentSource(invoice, amount)"),
"Only actual confirmed allocated customer payments are refundable");
check(service.includes("current.validatorUserId !== actorUserId") && service.includes("current.requestedByUserId === actorUserId") &&
  service.includes("validatorPayments.canApprove") && service.includes("validatorReceivables.canApprove") &&
  service.includes("listEnterpriseApprovalCandidates") && service.includes("!candidate.selfApprovalOverride"),
"Independent Retail + Finance validator is mandatory");
check(service.includes("prepareSalesCreditNoteForRefundAmount") && service.includes("createEnterprisePayment") &&
  service.includes("submitSalesCreditNoteForAssignedApproval") && service.includes("submitPaymentForAssignedApproval"),
"Preparation reuses canonical Finance workflow and no automatic approval");
check(service.includes("reverseCustomerPaymentAllocationsForRefundAmount") && service.includes("postApprovedSalesCreditNote") &&
  service.includes("markCustomerRefundFinancialInverseReady") && service.includes("confirmCustomerRefundPayment") &&
  service.includes("consumeCustomerPaymentRefundAvailability"),
"Settlement posts canonical credit, reverses customer allocations, confirms payment");
check(service.indexOf("await consumeCustomerPaymentRefundAvailability") < service.indexOf("return withRetailTransactionRetry(() => prisma.$transaction(async (tx) => {", service.indexOf("export async function settleRetailOmnichannelReturnFinance")) &&
  service.includes('where: { id: payment.id, organizationId, status: { in: ["CONFIRMED", "RECONCILED"] } }'),
"Inventory and quota cannot finalize before actual confirmed refund");
check(service.includes('movementType: "RETURN_IN"') && service.includes('idempotencyKey: `omni-return:${current.id}:${line.id}:${movement.id}`') &&
  service.includes('sourceEntityType: "EnterpriseFulfillment"'), "Stock returns reverse canonical outbound fulfillment locations idempotently");
check(fulfillment.includes("valueRetailOmnichannelFulfillmentIssuesTx") &&
  inventoryAccounting.includes("valueInventoryIssueTx(tx, organizationId, movementId, actorUserId") &&
  inventoryAccounting.includes('sourceEntityType: "EnterpriseFulfillment"'),
"Omnichannel fulfillment values physical issues through canonical accounting in the same transaction");
check(service.includes("RETAIL_OMNICHANNEL_RETURN_ORIGINAL_STOCK_UNVALUED") &&
  service.includes("valueRetailInventoryReturnTx(tx, organizationId, stockReturn.movement.id") &&
  inventoryAccounting.includes('postingEvent: "RETAIL_POS_INVENTORY_RETURN"') &&
  inventoryAccounting.includes('status: "POSTED"'),
"Restock requires a previously posted original issue and posts canonical COGS reversal");
check(service.includes('executionMode: "AUTO_RETAIL_OMNICHANNEL", status: "CONSUMED"') &&
  service.includes("order.items.every") && service.includes("sum.eq(item.quantityOrdered)"),
"Only fully refunded original line quantities release consumed quotas");
for (const [file, source] of [["request", request], ["decision", decision], ["prepare", prepare], ["settle", settle]]) {
  check(source.includes("authorizeRetailRequest") && source.includes("mutation: true") && source.includes("writeAuditLog") && source.includes("writeApiLog"),
    `${file} route enforces membership, origin, rate limit, permissions and audit`);
}
check(ui.includes("customerFacingOmnichannelReturnCopy") && ui.includes("role=\"dialog\"") &&
  ui.includes("returnMutation") && dictionary.includes("RETAIL_OMNICHANNEL_RETURN_INVOICE_REQUIRED"),
"Retail workspace offers a bilingual actionable return workflow, not dead-end buttons");
check(e2e.includes('e2e-904-self-validation') && e2e.includes("enterpriseRetailOmnichannelReturn.count") &&
  e2e.includes("invalidReturn.response.status()"), "Browser/API E2E guards rejected self-validation after completed delivery");
console.log(`Hotfix #904: ${checks} structural checks passed. Database/E2E/Finance posting still require runtime acceptance.`);
