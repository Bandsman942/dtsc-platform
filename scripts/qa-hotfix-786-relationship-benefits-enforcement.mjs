import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (condition, message) => { if (!condition) failures.push(message); };
const hasAll = (source, tokens, label) => {
  for (const token of tokens) check(source.includes(token), `${label}: missing ${token}`);
};

const identityContracts = read("lib/enterprise/identity-links/contracts.ts");
const identityAccess = read("lib/enterprise/identity-links/access.ts");
const contracts = read("lib/enterprise/relationship-benefits/contracts.ts");
const enforcement = read("lib/enterprise/relationship-benefits/enforcement.ts");
const adapter = read("lib/enterprise/relationship-benefits/retail-adapter.ts");
const service = read("lib/enterprise/relationship-benefits/service.ts");
const commercialEngine = read("lib/enterprise/retail/commercial-engine.ts");
const saleExecution = read("lib/enterprise/retail/sale-execution.ts");
const retailService = read("lib/enterprise/retail/service.ts");
const retailHttp = read("lib/enterprise/retail/http.ts");
const previewRoute = read("app/api/enterprise/[organizationId]/retail/pricing/preview/route.ts");
const saleRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
const accountRoute = read("app/api/account/enterprise-relationships/[organizationId]/benefits/route.ts");
const adminUi = read("components/enterprise/relationship-benefits/relationship-benefits-admin-workspace.tsx");
const userUi = read("components/enterprise/relationship-benefits/relationship-benefits-user-panel.tsx");
const posUi = read("components/enterprise/professional/retail-pos-dtsc-workspace.tsx");
const schema = read("prisma/enterprise-relationship-benefits.prisma");
const migration = read("prisma/migrations/20261008124500_hotfix_786_relationship_benefit_enforcement/migration.sql");
const contextMigration = read("prisma/migrations/20261008131000_hotfix_786_relationship_benefit_request_context/migration.sql");
const retailFr = read("locales/retail-workspace.fr.json");
const retailEn = read("locales/retail-workspace.en.json");

const relationTypes = [
  "PROSPECT", "CUSTOMER", "CUSTOMER_CONTACT", "SUPPLIER_REPRESENTATIVE",
  "EMPLOYEE", "COLLABORATOR", "CONTRACTOR", "PARTNER", "PATIENT", "STUDENT",
  "PARENT_GUARDIAN", "POLICYHOLDER", "BENEFICIARY", "DONOR", "VOLUNTEER",
  "TENANT", "OWNER_CLIENT", "DISTRIBUTOR", "RESELLER", "ALUMNI", "VIP", "OTHER",
];
for (const relationType of relationTypes) {
  check(identityContracts.includes(`"${relationType}"`), `Relationship type missing: ${relationType}`);
  const mapping = new RegExp(`${relationType}: \\\[([^\\\]]+)\\\]`).exec(identityAccess)?.[1] || "";
  check(mapping.includes("ENTERPRISE_BENEFITS"), `${relationType} must have an explicit ENTERPRISE_BENEFITS contract`);
}
check(relationTypes.length === 22, "Expected the 22 supported relationship types");

hasAll(contracts, [
  "relationshipBenefitConditionsSchema",
  ".strict()",
  "channelCodes",
  "siteIds",
  "catalogItemIds",
  "categoryIds",
  "weekdays",
  "minimumQuantity",
  "relationshipBenefitExecutionContextSchema",
  "transactionAmount",
  "businessPartyId",
  "context: relationshipBenefitExecutionContextSchema",
], "Controlled benefit contracts");
check(!contracts.includes("conditions: z.record(z.string(), z.unknown())"), "Benefit conditions must not accept arbitrary JSON");

hasAll(enforcement, [
  "evaluateRelationshipBenefitSnapshot",
  "evaluateRelationshipBenefit",
  "resolveEnterpriseIdentityRelationshipAccess",
  "canUseModule",
  "MINIMUM_AMOUNT_NOT_MET",
  "CURRENCY_MISMATCH",
  "TARGET_MODULE_DENIED",
  "CONDITIONS_UNSUPPORTED",
  "TOTAL_LIMIT_REACHED",
  "PERIOD_LIMIT_REACHED",
  "benefitConditionsSupported",
  "matchesRelationshipBenefitConditions",
  "automaticRetailEffectSupported",
  "calculateRetailRelationshipDiscount",
  "excludeUsageId",
  "findActiveRelationshipsForBusinessParty",
], "Authoritative enforcement engine");

hasAll(schema, [
  "requestContextJson",
  "executionMode",
  "effectModuleCode",
  "effectEntityType",
  "effectEntityId",
  "effectAmount",
  "effectCurrencyCode",
  "effectIdempotencyKey",
  "effectMetadataJson",
  "executedAt",
  "@@unique([organizationId, effectIdempotencyKey])",
], "Verified effect ledger");
hasAll(migration, [
  'ADD COLUMN "executionMode"',
  'ADD COLUMN "effectModuleCode"',
  'ADD COLUMN "effectEntityId"',
  'ADD COLUMN "effectAmount"',
  'ADD COLUMN "executedAt"',
  "effectIdempotencyKey_key",
], "Additive effect migration");
hasAll(contextMigration, ['ADD COLUMN "requestContextJson" JSONB'], "Additive request-context migration");

hasAll(service, [
  "validateRelationshipBenefitConfiguration",
  "listEnterpriseCurrencies",
  "assertReferenceSet",
  "normalizeEnterpriseModuleCode",
  "evaluateRelationshipBenefitSnapshot",
  "evaluateRelationshipBenefit",
  "RELATIONSHIP_BENEFIT_EFFECT_REQUIRED",
  "RELATIONSHIP_BENEFIT_TARGET_ADAPTER_UNSUPPORTED",
  "RELATIONSHIP_BENEFIT_AMOUNT_CURRENCY_REQUIRED",
  "RELATIONSHIP_BENEFIT_CONTEXT_REQUIRED",
  'executionMode: "REQUEST"',
  "requestContextJson",
  'canUseModule(organizationId, "RETAIL_POS")',
], "Benefit service enforcement");
check(!service.includes('where: { organizationId, moduleCode: "RETAIL_POS", isEnabled: true }'), "Retail snapshot must not rely only on isEnabled");
check(!service.includes('"Marquer utilisé"'), "Server service must not encode UI-only manual consumption");

hasAll(adapter, [
  'canUseModule(args.organizationId, "RELATIONSHIP_BENEFITS")',
  'canUseModule(args.organizationId, "RETAIL_POS")',
  "findActiveRelationshipsForBusinessParty",
  "resolveEnterpriseIdentityRelationshipAccess",
  "eligibleLinks",
  "evaluateRelationshipBenefitSnapshot",
  "REPLACE_RETAIL_RULES",
  "STACK_WITH_RETAIL_RULES",
  "applyRetailRelationshipBenefitEffectsTx",
  "pg_advisory_xact_lock",
  'executionMode: "AUTO_RETAIL"',
  'effectEntityType: "EnterpriseRetailSale"',
  "effectIdempotencyKey",
  "RELATIONSHIP_BENEFIT_EFFECT_BUSINESS_PARTY_MISMATCH",
  "reverseRetailRelationshipBenefitEffectsTx",
], "Retail relationship adapter");
check(!adapter.includes("enterpriseRetailLoyaltyAccount.create"), "Adapter must not duplicate Retail loyalty accounts");
check(!adapter.includes("enterpriseRetailStoredValueAccount.create"), "Adapter must not duplicate Retail stored value accounts");
check(!adapter.includes("enterpriseRetailPromotion.create"), "Adapter must not duplicate the Retail promotions engine");

hasAll(commercialEngine, [
  "applyRetailRelationshipBenefitPricing",
  "relationshipBenefitIds",
  "relationshipBenefitDiscount",
  "resolveRetailCommercialPricingDecisions",
  "serializeRetailPricingPreview",
  "RETAIL_RELATIONSHIP_BENEFIT_ZERO_TOTAL_UNSUPPORTED",
], "Retail pricing integration");
hasAll(retailHttp, ["RETAIL_RELATIONSHIP_BENEFIT_ZERO_TOTAL_UNSUPPORTED"], "Retail zero-total error contract");

hasAll(saleExecution, [
  "resolveRetailRelationshipBenefitPricing",
  "applyRetailRelationshipBenefitPricing",
  "relationshipResolution.effects",
  "createRetailSale(",
  "relationshipBenefits",
  "notifyUser",
], "Canonical sale execution");
hasAll(retailService, [
  "applyRetailRelationshipBenefitEffectsTx",
  "relationshipBenefitEffects",
  "reverseRetailRelationshipBenefitEffectsTx",
  "Prisma.TransactionIsolationLevel.Serializable",
], "Atomic sale and reversal");
const createSaleStart = retailService.indexOf("export async function createRetailSale(");
const reverseSaleStart = retailService.indexOf("export async function reverseRetailSale(");
const createSaleBlock = retailService.slice(createSaleStart, reverseSaleStart);
check(
  createSaleBlock.indexOf("applyRetailRelationshipBenefitEffectsTx") < createSaleBlock.indexOf("finalizeRetailSaleAccountingTx"),
  "Benefit effect must be persisted before sale transaction finalization",
);

hasAll(previewRoute, [
  "getRetailActiveCustomerIdFromCookieHeader",
  "resolveRetailCommercialPricingDecisions",
  "resolveRetailRelationshipBenefitPricing",
  "applyRetailRelationshipBenefitPricing",
  "relationshipBenefits",
], "Retail pricing preview");
hasAll(saleRoute, [
  "relationshipBenefits",
  "relationshipBenefitCount",
  "relationshipBenefitIds",
], "Retail sale audit/API response");

hasAll(accountRoute, [
  "relationshipBenefitUsageSchema",
  "createRelationshipBenefitUsage",
], "Account benefit request API");
hasAll(adminUi, [
  "supportedTargets",
  "currencyOptions",
  "conditionChannelCode",
  "conditionMinimumQuantity",
  "conditionWeekdays",
  "Business execution required",
  "Exécution métier requise",
], "Controlled admin UI");
check(!adminUi.includes('decideUsage(usage, "CONSUMED")'), "Admin UI must not fake a consumed state without verified business effect");
hasAll(userUi, [
  "AUTO_RETAIL",
  "requiresBusinessContext",
  "applied automatically by the server",
  "Appliqué par",
], "Member benefit UI");
hasAll(posUi, [
  "/retail/pricing/preview",
  "pricingPreview",
  "relationshipBenefits",
  "effectiveTotal",
  "pricingPreviewUnavailable",
], "POS server pricing UX");
for (const locale of [retailFr, retailEn]) {
  hasAll(locale, [
    "relationshipBenefitsApplied",
    "relationshipBenefitServerApplied",
    "pricingPreviewLoading",
    "pricingPreviewUnavailable",
  ], "Retail FR/EN benefit copy");
}

if (failures.length) {
  console.error("\nHotfix #786 relationship benefit enforcement QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Hotfix #786 relationship benefit enforcement QA passed.");
