import fs from "node:fs";

const route = fs.readFileSync("app/api/models/route.ts", "utf8");
const catalog = fs.readFileSync("lib/ai/catalog.ts", "utf8");
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

if (failures.length) {
  console.error("AI model UI policy QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("AI model UI policy QA passed");
