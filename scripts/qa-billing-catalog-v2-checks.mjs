import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const failures = [];
function expect(condition, message) {
  if (!condition) failures.push(message);
}
function containsAll(source, values, label) {
  for (const value of values) expect(source.includes(value), `${label}: contrat absent ${value}`);
}

const bootstrap = JSON.parse(read("config/billing-plans.bootstrap.json"));
const catalog = read("lib/billing/commercial-catalog.ts");
const entitlements = read("lib/billing/entitlements.ts");
const featureEntitlements = read("lib/billing/module-entitlements.ts");
const planLimits = read("lib/billing/plan-limits.ts");
const commercialOverrides = JSON.parse(read("lib/enterprise/module-registry-commercial-overrides.json"));
const pricingPage = read("app/tarifs/page.tsx");
const billingPage = read("app/billing/page.tsx");
const consoleBilling = read("lib/console/console-billing.ts");
const billingManager = read("components/admin/billing-plan-manager.tsx");
const cagRegistry = read("lib/ai/cag-registry.ts");
const personalChat = read("app/api/chat/v2/route.ts");
const publicAgent = read("app/api/public/dtsc-agent/route.ts");
const enterpriseAgent = read("app/api/enterprise/ai/agent/route.ts");
const enterpriseAiAccess = read("lib/enterprise-ai/access.ts");
const enterpriseAiContext = read("lib/enterprise-ai/context.ts");
const regressionAdapter = read("scripts/qa-regression-checks.mjs");

const expected = new Map([
  ["freemium", { price: 0, messages: 5, tokens: 15_000, sources: 1 }],
  ["starter", { price: 2, messages: 40, tokens: 120_000, sources: 2 }],
  ["growth", { price: 15, messages: 200, tokens: 750_000, sources: 20 }],
  ["premium", { price: 50, messages: 1_000, tokens: 3_000_000, sources: 100 }],
  ["org-starter", { price: 25, messages: 500, tokens: 1_500_000, sources: 50 }],
  ["org-growth", { price: 75, messages: 2_000, tokens: 6_000_000, sources: 250 }],
  ["org-premium", { price: 180, messages: 10_000, tokens: 30_000_000, sources: 1_000 }],
]);

expect(bootstrap.length === expected.size, `bootstrap: ${expected.size} offres canoniques attendues, ${bootstrap.length} trouvées`);
for (const plan of bootstrap) {
  const contract = expected.get(plan.id);
  expect(Boolean(contract), `bootstrap: offre non canonique ${plan.id}`);
  if (!contract) continue;
  expect(Number(plan.priceUsd) === contract.price, `${plan.id}: prix attendu ${contract.price}`);
  expect(plan.dailyMessageLimit === contract.messages, `${plan.id}: quota messages incohérent`);
  expect(plan.dailyTokenLimit === contract.tokens, `${plan.id}: quota tokens incohérent`);
  expect(plan.maxDocuments === contract.sources, `${plan.id}: quota sources IA incohérent`);
}

containsAll(catalog, [
  'BILLING_CATALOG_RELEASE = "2026.09"',
  "PUBLISHED_BILLING_OFFER_IDS",
  "getPublishedBillingCatalog",
  "prisma.billingPlan.findMany",
  "maxKnowledgeSources",
  "organizationLimitsForOffer",
  "formatPublishedBillingCatalogForAi",
], "catalogue commercial");
for (const id of expected.keys()) expect(catalog.includes(`"${id}"`), `catalogue commercial: offre ${id} absente`);

containsAll(planLimits, [
  "maxMonthlyCallMinutes: 300",
  "maxDocuments: 1_000",
  "maxDocuments: 20_000",
  "maxDocuments: 250_000",
  "enterpriseAiReadToolsEnabled: true",
  "enterpriseAiActionDraftsEnabled: false",
], "limites organisation");

for (const feature of ["collaboration-calls", "calendar", "enterprise-admin"]) {
  const position = featureEntitlements.indexOf(`feature: "${feature}"`);
  expect(position >= 0, `entitlements: ${feature} absent`);
  if (position >= 0) {
    const snippet = featureEntitlements.slice(position, position + 220);
    expect(snippet.includes('requiredPlan: "STARTER"'), `entitlements: ${feature} doit être inclus dans Essentielle`);
    expect(snippet.includes("requiresActiveSubscription: true"), `entitlements: ${feature} doit exiger un abonnement actif`);
  }
}

const aiOverride = commercialOverrides.overrides?.find((item) => item.code === "AI_ASSISTANT");
expect(aiOverride?.minimumPlan === "STARTER", "registre ERP: IA Assistant Entreprise doit être incluse à partir d’Essentielle");

containsAll(entitlements, [
  "const knowledgeSources = Math.max(0, offer.maxDocuments",
  "maxEnterpriseAiKnowledgeSources: knowledgeSources",
  "...defaults",
], "projection des limites");
expect(!entitlements.includes("maxDocuments: documents"), "projection des limites: le quota de sources IA ne doit jamais remplacer les documents métier");

containsAll(pricingPage, ["getPublishedBillingCatalog", "catalog.offers.filter", "sources de connaissance IA", "documents métier", "storageLabel"], "site public /tarifs");
containsAll(billingPage, ["getPublishedBillingCatalog", "catalog.releaseId", "Sources de connaissance IA", "Documents métier", "Sources IA"], "/billing");
containsAll(consoleBilling, ["getPublishedBillingCatalog({ includeInactive: true })", "publishedById", "catalogReleaseId", "aiModeFr"], "Console DTSC");
containsAll(billingManager, ["catalogReleaseId", "sources de connaissance IA", "documents métier", "aiModeFr"], "Console DTSC UI");

containsAll(cagRegistry, [
  "getPublishedBillingCatalog",
  "formatPublishedBillingCatalogForAi",
  'code: "billing-catalog"',
  "releaseId",
  "Quotas effectifs",
], "CAG IA");
containsAll(personalChat, ["preparedTurn.cag.content", "catalogue commercial versionné", "n’invente jamais un tarif"], "chatbot général");
containsAll(publicAgent, [
  "getPublishedBillingCatalog",
  "formatPublishedBillingCatalogForAi",
  "CATALOGUE COMMERCIAL DTSC PUBLIÉ",
  "/tarifs",
  "ne cite que les prix présents dans le catalogue publié",
], "assistant public");
for (const hardcodedPrice of ["25 USD", "75 USD", "180 USD", "50 USD/mois", "15 USD/mois"]) {
  expect(!publicAgent.includes(hardcodedPrice), `assistant public: tarif codé en dur interdit (${hardcodedPrice})`);
}

containsAll(enterpriseAiAccess, ["offerName", "subscriptionStatus", "dailyMessageLimit", "dailyTokenLimit", "maxKnowledgeSources", "canUseReadTools", "canUseActionDrafts"], "accès IA Entreprise");
containsAll(enterpriseAiContext, ["CONTRAT COMMERCIAL", "offerName: access.offerName", "maxKnowledgeSources", "maxBusinessDocuments", "canUseReadTools", "canUseActionDrafts"], "prompt IA Entreprise");
containsAll(enterpriseAgent, [
  "commercialToolModes",
  'access.planCode === "ENTERPRISE"',
  '["READ", "PREPARE", "MUTATE"]',
  'access.planCode === "BUSINESS"',
  '["READ", "PREPARE"]',
  ': ["READ"]',
  "allowedToolModes: commercialToolModes",
], "modes outils IA Entreprise");

expect(regressionAdapter.includes('await import("./qa-billing-catalog-v2-checks.mjs")'), "qa:regression: Billing Catalog v2 n’est pas intégré à la gate canonique");

if (failures.length) {
  console.error(`Billing Catalog v2 QA failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Billing Catalog v2 QA passed.");
