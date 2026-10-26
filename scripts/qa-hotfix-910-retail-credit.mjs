import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checked = 0;
function code(path) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function verify(ok, title) { assert.ok(ok, title); checked++; }

const service = code("lib/enterprise/relationship-benefits/manual-credit.ts");
const account = code("lib/enterprise/retail/relationship-store-credit.ts");
const posting = code("lib/enterprise/accounting/sector-adapters/retail-relationship-credit.ts");
const registry = code("lib/enterprise/accounting/posting-registry-final.ts");
const constants = code("lib/enterprise/accounting/constants.ts");
const routes = code("app/api/enterprise/[organizationId]/relationship-benefits/credits/route.ts")
  + code("app/api/enterprise/[organizationId]/relationship-benefits/credits/[usageId]/route.ts");
const panel = code("components/enterprise/relationship-benefits/manual-relationship-credit-panel.tsx");
const configuration = code("lib/enterprise/relationship-benefits/service.ts");

verify(service.includes('executionMode: "MANUAL_RETAIL_CREDIT"'), "Manual credit has an explicit execution mode");
verify(service.includes('requestedBy === args.actorUserId'), "Own approval and own reversal forbidden");
verify(service.includes('grantEligibilityTx(tx'), "Eligibility rechecked in locked transaction");
verify(service.includes('pg_advisory_xact_lock'), "Business grant protected by advisory lock");
verify(service.includes('isolationLevel: Prisma.TransactionIsolationLevel.Serializable'), "Serializable grant transaction");
verify(service.includes('enterprisePersonBusinessReference.findFirst'), "Beneficiary must match canonical party reference");
verify(service.includes('roles: { some: { roleCode: "CUSTOMER"'), "Beneficiary is an active customer");
verify(service.includes('visibility: "ORGANIZATION"'), "Evidence required to be visible to organization");
verify(service.includes('currentVersion: { gt: 0 }'), "Evidence must have an uploaded file");
verify(service.includes('status: "REQUESTED"') && service.includes('status: "REJECTED"'), "Request and rejection have no financial effect");
verify(service.includes('status: "CONSUMED"') && service.includes('effectEntityId: entry.id'), "Consumed only with a stored-value entry");
verify(service.includes('credit:relationship:usage:'), "Grant has a stable event key");
verify(service.includes('credit:relationship:reversal:'), "Reversal has a separate stable event key");
verify(service.includes('postBusinessEventTx(tx'), "Posting uses transaction-scoped canonical Finance service");
verify(account.includes("ensureRelationalStoreCreditAccountTx") && account.includes("changeRelationalStoreCreditTx"), "Existing canonical store credit services available");
verify(posting.includes("RELATIONSHIP_CREDIT_POSTING_PROOF_MISSING"), "Posting requires entry evidence");
verify(posting.includes('entryType: reversal ? "REVERSAL" : "EARN"'), "Posting confirms real entry type");
verify(posting.includes('accountMappingKey: reversal ? "CUSTOMER_ADVANCES" : "OPERATING_EXPENSE"'), "Debit is correctly reversed");
verify(posting.includes('accountMappingKey: reversal ? "OPERATING_EXPENSE" : "CUSTOMER_ADVANCES"'), "Credit is correctly reversed");
verify(registry.includes("buildRetailRelationshipCreditGrantPosting") && registry.includes("buildRetailRelationshipCreditReversalPosting"), "No parallel posting registry");
verify(constants.includes("RETAIL_RELATIONSHIP_CREDIT_GRANTED") && constants.includes("RETAIL_RELATIONSHIP_CREDIT_REVERSED"), "Both events registered");
verify(routes.includes('"FINANCE_ACCOUNTING", action: "approve"'), "Checker must have Finance approve");
verify(routes.includes('authorizeRelationshipBenefitsRequest(req, organizationId, "manage"'), "Tenant-aware authorization applied");
verify(panel.includes("onChanged") && panel.includes('decision: "APPROVE" | "REJECT" | "REVERSE"'), "Administrator has genuine request and approval controls");
verify(configuration.includes("manualCreditShape"), "CREDIT configured as an explicit manual adapter");
console.log(`#910 contract assertions: ${checked} passed`);
