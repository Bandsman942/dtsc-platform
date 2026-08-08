import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const prisma = read("prisma/enterprise-retail.prisma");
for (const model of [
  "EnterpriseRetailPriceCondition",
  "EnterpriseRetailPromotion",
  "EnterpriseRetailPromotionRedemption",
  "EnterpriseRetailPricingDecision",
  "EnterpriseRetailReturn",
  "EnterpriseRetailReturnLine",
  "EnterpriseRetailRefund",
]) check(prisma.includes(`model ${model}`), `Missing Shop 2 commercial model ${model}`);
check(exists("prisma/migrations/20260808180000_shop2_commercial_engine/migration.sql"), "Shop 2 commercial engine migration is missing");

const engine = read("lib/enterprise/retail/commercial-engine.ts");
for (const marker of [
  "enterpriseCatalogPrice.findMany",
  "enterpriseTaxCode.findMany",
  "enterpriseTaxRate.findMany",
  "enterpriseRetailPriceCondition.findMany",
  "enterpriseRetailPromotion.findMany",
  "enterpriseRetailPricingDecision.createMany",
  "enterpriseRetailPromotionRedemption.upsert",
  "taxIncluded",
  "serviceUnitPrice",
  "serviceDiscountAmount",
  "RETAIL_TAX_INCLUDED_OVERRIDE_FORBIDDEN",
]) check(engine.includes(marker), `Shop 2 commercial engine missing ${marker}`);
check(!engine.includes("EnterpriseCoreRecord"), "Shop 2 pricing must not write legacy EnterpriseCoreRecord");
check(!engine.includes("PROMOTIONS"), "Shop 2 pricing must not depend on legacy PROMOTIONS");

const admin = read("lib/enterprise/retail/commercial-admin.ts");
for (const marker of ["enterpriseCatalogPrice.findFirst", "enterpriseRetailPriceCondition", "enterpriseRetailPromotion", "organizationId"]) check(admin.includes(marker), `Shop 2 commercial administration missing ${marker}`);

const returns = read("lib/enterprise/retail/returns.ts");
for (const marker of [
  "createRetailReturnRequest",
  "decideRetailReturn",
  "PENDING_APPROVAL",
  "RETAIL_RETURN_SELF_APPROVAL_FORBIDDEN",
  "RETAIL_RETURN_QUANTITY_EXCEEDED",
  'movementType: "RETURN_IN"',
  "enterpriseTreasuryTransaction.create",
  "enterpriseCashMovement.create",
  "ORIGINAL_TENDER",
  "exchangeSaleId",
  "productCondition",
]) check(returns.includes(marker), `Shop 2 return workflow missing ${marker}`);

const schemas = read("lib/enterprise/retail/commercial-schemas.ts");
for (const marker of ["PERCENTAGE", "FIXED_AMOUNT", "QUANTITY_BREAK", "BUY_X_GET_Y", "BUNDLE", "retailReturnDecisionSchema", "retailReturnProductConditions"]) check(schemas.includes(marker), `Shop 2 commercial schema missing ${marker}`);
check(!schemas.includes('"STORE_CREDIT"'), "Store credit must remain outside the iteration 2 commercial schema; later iterations may add a dedicated spendable-balance domain");

const permissions = read("lib/enterprise/retail/permissions.ts");
for (const marker of ["canManagePricing", "canOverridePrice", "canOverrideDiscount", "canOverrideTax", "canManagePromotions", "canCreateReturns", "canManageRefunds"]) check(permissions.includes(marker), `Granular Retail permission missing ${marker}`);
const constants = read("lib/enterprise/retail/constants.ts");
for (const permission of [
  "enterprise.retail.pos.pricing.manage",
  "enterprise.retail.pos.price_override.manage",
  "enterprise.retail.pos.discount_override.manage",
  "enterprise.retail.pos.tax_override.manage",
  "enterprise.retail.pos.promotions.manage",
  "enterprise.retail.pos.returns.create",
  "enterprise.retail.pos.refunds.manage",
]) check(constants.includes(permission), `Retail permission catalog missing ${permission}`);

const accountingConstants = read("lib/enterprise/accounting/constants.ts");
check(accountingConstants.includes("RETAIL_POS_RETURN_POSTED"), "Common accounting events must include RETAIL_POS_RETURN_POSTED");
const postingRegistry = read("lib/enterprise/accounting/posting-registry-final.ts");
check(postingRegistry.includes("buildRetailPosReturnPosting"), "Common accounting registry must wire partial Retail returns");
const returnAdapter = read("lib/enterprise/accounting/sector-adapters/retail-return.ts");
for (const marker of ["SALES_REVENUE", "TAX_PAYABLE", "ACCOUNT_ID:", "EnterpriseRetailReturn"]) check(returnAdapter.includes(marker), `Retail return posting adapter missing ${marker}`);
const accounting = read("lib/enterprise/retail/accounting.ts");
for (const marker of ["finalizeRetailReturnAccounting", "RETAIL_POS_RETURN_POSTED", "valueRetailInventoryReturn"]) check(accounting.includes(marker), `Retail return accounting orchestration missing ${marker}`);

for (const route of [
  "app/api/enterprise/[organizationId]/retail/pricing/preview/route.ts",
  "app/api/enterprise/[organizationId]/retail/pricing/conditions/route.ts",
  "app/api/enterprise/[organizationId]/retail/promotions/route.ts",
  "app/api/enterprise/[organizationId]/retail/sales/[saleId]/returns/route.ts",
  "app/api/enterprise/[organizationId]/retail/returns/[returnId]/decision/route.ts",
]) check(exists(route), `Missing Shop 2 iteration 2 API route ${route}`);

const salesRoute = read("app/api/enterprise/[organizationId]/retail/sales/route.ts");
const saleExecution = read("lib/enterprise/retail/sale-execution.ts");
check(salesRoute.includes("executeCanonicalRetailSale"), "POS sale route must delegate authoritative commercial execution to the canonical sale service");
for (const marker of ["previewRetailCommercialPricing", "prepareCommercialRetailSaleV2", "persistRetailCommercialDecisions", "finalizeRetailSaleAccounting"]) {
  check(saleExecution.includes(marker), `Canonical POS sale service missing authoritative commercial marker ${marker}`);
}
const executeStart = saleExecution.indexOf("export async function executeCanonicalRetailSale");
const executeBlock = executeStart >= 0 ? saleExecution.slice(executeStart) : "";
const prepareIndex = executeBlock.indexOf("await prepareCommercialRetailSaleV2");
const createIndex = executeBlock.indexOf("createRetailSale(args.organizationId");
const persistIndex = executeBlock.indexOf("await persistRetailCommercialDecisions");
const accountingIndex = executeBlock.indexOf("await finalizeRetailSaleAccounting");
const loyaltyIndex = executeBlock.indexOf("await autoEarnRetailLoyaltyForSale");
check(
  prepareIndex >= 0 && createIndex > prepareIndex && persistIndex > createIndex && accountingIndex > persistIndex && loyaltyIndex > accountingIndex,
  "Canonical POS sale service must prepare pricing, create the sale, persist decisions, finalize accounting and apply loyalty before returning",
);
const decisionRoute = read("app/api/enterprise/[organizationId]/retail/returns/[returnId]/decision/route.ts");
check(decisionRoute.includes("finalizeRetailReturnAccounting"), "Return approval must post common accounting before successful response");

const readiness = JSON.parse(read("lib/enterprise/sector-onboarding-readiness.json"));
const retail = readiness.profiles.find((profile) => profile.sectorCode === "COMMERCE_RETAIL");
const iteration2OrLater = new Set(["ITERATION_2_IN_PROGRESS", "ITERATION_3_IN_PROGRESS", "ITERATION_4_IN_PROGRESS", "COMMERCIAL_READY_GLOBAL"]);
check(iteration2OrLater.has(retail?.shop2ProgramStatus), "Shop 2 readiness must remain at iteration 2 or later after the commercial engine ships");

if (failures.length) {
  console.error("Shop 2 commercial engine QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 commercial engine QA passed.");
