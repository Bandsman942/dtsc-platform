import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let checks = 0;
function verify(test, label) { assert.ok(test, label); checks++; }
const delivery = read("lib/enterprise/relationship-benefits/delivery.ts");
const configuration = read("lib/enterprise/relationship-benefits/service.ts");
const route = read("app/api/enterprise/[organizationId]/relationship-benefits/usages/[usageId]/delivery/route.ts");
const page = read("app/enterprise-relationship-benefits/page.tsx");
const ui = read("components/enterprise/relationship-benefits/relationship-benefits-admin-workspace.tsx");

verify(configuration.includes('config.benefitType === "DELIVERY"'), "Delivery has dedicated config validation");
verify(configuration.includes('normalizeEnterpriseModuleCode(config.targetModuleCode || "") === "SALES_QUOTES_ORDERS"'), "Only canonical Sales module can apply delivery");
verify(configuration.includes('config.valueType === "NONE"'), "No monetary shortcut");
verify(configuration.includes('config.actionCode === "REQUEST"'), "Delivery is request-led");
verify(configuration.includes('resolved.benefit?.benefitType !== "DELIVERY"'), "Approval does not pretend business execution exists");
verify(page.includes('canUseModule(organizationId, "SALES_QUOTES_ORDERS")'), "Sales availability exposed to admin");
verify(route.includes('authorizeRelationshipBenefitsRequest(req, organizationId, "manage"'), "Benefit manage permission required");
verify(route.includes('getEnterpriseCommonDomainAccess'), "Separate Sales authorization");
verify(route.includes('moduleCode: "SALES_QUOTES_ORDERS", action: "write"'), "Sales write permission required");
verify(route.includes('deliveryAttestationSchema.safeParse'), "Strict business input validation");
verify(route.includes("replayed: result.replayed"), "API exposes idempotent replay explicitly");
verify(route.includes('writeAuditLog(') && route.includes('writeApiLog('), "API and business audit");
verify(delivery.includes("resolveEnterpriseIdentityRelationshipAccess"), "Consent/capability checked at attestation");
verify(delivery.includes("pg_advisory_xact_lock"), "Concurrent attestations are locked");
verify(delivery.includes("Prisma.TransactionIsolationLevel.Serializable"), "Serializable delivery transaction");
verify(delivery.includes('usage.status === "CONSUMED"') && delivery.includes('usage.effectIdempotencyKey === effectKey'), "Idempotent replay without double consumption");
verify(delivery.includes('fulfillmentType: "PRODUCT_DELIVERY"') && delivery.includes('status: "COMPLETED"'), "Only actual completed product delivery is eligible");
verify(delivery.includes('order.status !== "FULFILLED"'), "Partial orders are not eligible");
verify(delivery.includes("fulfillment.fulfilledAt < usage.decidedAt"), "Proof cannot predate approval");
verify(delivery.includes("fulfilledByUserId === actorUserId"), "Independent checker separate from fulfiller");
verify(delivery.includes("proofDocumentId") && delivery.includes('status: "ACTIVE"'), "Real versioned document required");
verify(delivery.includes('sourceEntityType: "EnterpriseSalesOrder"'), "Proof linked to actual order");
verify(delivery.includes("enterprisePersonBusinessReference.findFirst"), "Sales party matches consented person");
verify(delivery.includes("evaluateRelationshipBenefitSnapshot"), "Eligibility and quotas reevaluated under lock");
verify(delivery.includes('id: { not: usage.id }'), "Own reserved quota excluded from evaluation");
verify(delivery.includes("enterpriseRetailOmnichannelReturn.count"), "Previously returned order blocked");
verify(delivery.includes('status: "CONSUMED"') && delivery.includes('effectEntityType: "EnterpriseFulfillment"'), "Consumption includes canonical effect reference");
verify(delivery.includes("effectIdempotencyKey: effectKey"), "Unique business event idempotency");
verify(ui.includes("attestDelivery(usage)") && ui.includes("fulfillmentReference"), "Member request can be attested from real UI");
verify(ui.includes('benefit?.benefitType === "DELIVERY"'), "Delivery displayed distinctly from monetary benefits");
verify(ui.includes('value === "DELIVERY"') && ui.includes('setTargetModuleCode("SALES_QUOTES_ORDERS")'), "Delivery config selects certified target");

console.log(`HOTFIX #912 DELIVERY contract: ${checks} checks passed (structural; behavioral E2E and OWNER_E2E still required).`);
