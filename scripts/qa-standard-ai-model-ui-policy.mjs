import fs from "node:fs";

const route = fs.readFileSync("app/api/models/route.ts", "utf8");
const catalog = fs.readFileSync("lib/ai/catalog.ts", "utf8");
const chatPage = fs.readFileSync("app/chat/page.tsx", "utf8");
const conversationRoute = fs.readFileSync("app/api/conversations/[id]/route.ts", "utf8");
const accountPreferencesRoute = fs.readFileSync("app/api/account/preferences/route.ts", "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(route.includes("listCatalogAiModelsForUi"), "/api/models must use the canonical policy-filtered UI catalog");
expect(route.includes("getCanonicalAiUsageLimits"), "/api/models must resolve plan server-side");
expect(route.includes("profileCodes"), "/api/models must expose safe certified model profiles");
expect(route.includes("certificationVersion"), "/api/models must expose the non-sensitive certification version");
expect(catalog.includes("listAvailableAiModels(input)"), "UI catalog must derive from runtime availability filtering");
expect(!route.includes("OPENROUTER_API_KEY"), "/api/models must never expose or read provider secrets directly");
expect(!route.includes("AI_OPENROUTER_CERTIFIED_MODELS_JSON"), "/api/models must not parse provider certification config directly");
expect(!route.includes("openrouter.ai"), "/api/models must never proxy the remote provider catalog");

expect(chatPage.includes("getCanonicalAiUsageLimits"), "Chat page must resolve canonical AI usage limits server-side");
expect(chatPage.includes("planCode: aiContext === \"DTSC_INTERNAL\" ? \"ENTERPRISE\" : usageLimits.planCode"), "Chat page model catalog must receive the canonical plan and preserve DTSC_INTERNAL enterprise entitlement");
expect(conversationRoute.includes("getCanonicalAiUsageLimits"), "Conversation model override validation must resolve plan server-side");
expect(conversationRoute.includes("isCatalogAiModelAllowed({ modelCode: modelOverride, context, locale: userLocale?.locale || \"fr\", planCode })"), "Conversation model override validation must pass canonical planCode to the catalog policy");
expect(accountPreferencesRoute.includes("getCanonicalAiUsageLimits"), "Account preferred-model validation must resolve plan server-side");
expect(accountPreferencesRoute.includes("isCatalogAiModelAllowed({ modelCode: preferredModel, context: aiContext, locale: body.data.locale, planCode })"), "Account preferred-model validation must pass canonical planCode to the catalog policy");
expect(!conversationRoute.includes("body.data.planCode"), "Conversation model validation must never trust a client-supplied planCode");
expect(!accountPreferencesRoute.includes("body.data.planCode"), "Account model validation must never trust a client-supplied planCode");

if (failures.length) {
  console.error("AI model UI policy QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("AI model UI policy QA passed");
