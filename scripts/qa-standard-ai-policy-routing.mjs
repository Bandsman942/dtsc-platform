import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const policy = read("lib/ai/policy.ts");
const orchestrator = read("lib/ai/orchestrator.ts");
const catalog = read("lib/ai/catalog.ts");
const types = read("lib/ai/types.ts");

expect(types.includes("dataClassifications?: AiDataClassification[]"), "AiRouteRequest must carry data classifications");
expect(types.includes("allowSensitiveExternalModel?: boolean"), "AiRouteRequest must carry the explicit sensitive-data policy flag");
expect(policy.includes("SECRET_NEVER_EXTERNAL"), "Policy must reject SECRET data on external providers");
expect(policy.includes("SENSITIVE_EXTERNAL_NOT_ALLOWED"), "Policy must reject sensitive data externally by default");
expect(policy.includes('"RESTRICTED"'), "RESTRICTED data must be part of the sensitive classification barrier");
expect(policy.includes("const TRUSTED_LOCAL_PROVIDER_CODES = new Set<string>([]);"), "Local provider trust must be an explicit allow-list");
expect(policy.includes("!TRUSTED_LOCAL_PROVIDER_CODES.has(provider.code)"), "Unknown provider codes must fail closed as external");
expect(policy.includes("evaluateAiModelPolicy"), "Policy engine must expose a single model-policy evaluator");
expect(catalog.includes("evaluateAiModelPolicy"), "Catalog availability must be filtered by the policy engine");
expect(catalog.includes("listCatalogAiModelsForUi"), "UI model catalog must derive from policy-filtered availability");
expect(orchestrator.includes("getCanonicalAiUsageLimits"), "Runtime must resolve plan entitlement server-side");
expect(orchestrator.includes("planCode: await resolveServerPlanCode(request)"), "Caller-provided planCode must not be authoritative");
expect(orchestrator.includes("resolveServerDataClassifications"), "Runtime must resolve a server-side default data classification");
expect(orchestrator.includes('return ["CONFIDENTIAL"]'), "Organization-bound AI requests must default to CONFIDENTIAL");
expect(orchestrator.includes("allowSensitiveExternalModel: false"), "AI00 must not permit a caller to weaken sensitive external policy");
expect(orchestrator.includes('strategyCode: "POLICY_CAPABILITY_PLAN_DATA_V1"'), "Routing strategy must expose the policy/capability/plan/data strategy code");
expect(orchestrator.includes("if (!(error instanceof AiProviderError) || !error.retryable) throw error"), "Fallback must only continue for retryable provider failures");

if (failures.length) {
  console.error("[standard-ai-policy-routing] FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("[standard-ai-policy-routing] OK");
