import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const catalog = read("lib/ai/catalog.ts");
const policy = read("lib/ai/policy.ts");
const orchestrator = read("lib/ai/orchestrator.ts");
const modelsRoute = read("app/api/models/route.ts");
const usageLimits = read("lib/billing/ai-usage-limits.ts");

expect(policy.includes("planMeetsRequirement"), "AI policy must enforce canonical SaaS plan ordering");
expect(policy.includes("PLAN_NOT_ALLOWED"), "AI policy must expose a stable PLAN_NOT_ALLOWED reason");
expect(catalog.includes("planCode"), "AI catalog availability must receive planCode");
expect(modelsRoute.includes("getCanonicalAiUsageLimits"), "/api/models must resolve the effective plan server-side");
expect(modelsRoute.includes("const planCode ="), "/api/models must derive one effective plan before listing models");
expect(
  modelsRoute.includes("listCatalogAiModelsForUi({ context, locale, planCode })"),
  "/api/models must pass the effective plan to the catalog",
);
expect(usageLimits.includes("planCode"), "Canonical AI usage limits must expose normalized planCode");
expect(orchestrator.includes("getCanonicalAiUsageLimits"), "Runtime router must resolve the effective plan server-side");
expect(orchestrator.includes("DTSC_INTERNAL") && orchestrator.includes("ENTERPRISE"), "DTSC internal context must preserve full internal model entitlement");
expect(orchestrator.includes("The requested AI model is not allowed by the active plan or policy"), "Explicitly requested forbidden models must be rejected instead of silently downgraded");

if (failures.length) {
  console.error("AI plan enforcement QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI plan enforcement QA passed");
