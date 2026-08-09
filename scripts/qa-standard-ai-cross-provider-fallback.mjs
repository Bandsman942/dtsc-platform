import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const orchestrator = read("lib/ai/orchestrator.ts");
const catalog = read("lib/ai/catalog.ts");
const policy = read("lib/ai/policy.ts");
const adapter = read("lib/ai/providers/openrouter-chat-completions.ts");

expect(orchestrator.includes("listAvailableAiModels"), "Fallback candidates must originate from the policy-filtered available model list");
expect(orchestrator.includes("fallbackModelCodes"), "Declared fallback model codes must remain under DTSC orchestration");
expect(catalog.includes("evaluateAiModelPolicy"), "Every available candidate must pass the canonical policy engine");
expect(policy.includes("SECRET_NEVER_EXTERNAL"), "Cross-provider fallback must preserve SECRET boundary");
expect(policy.includes("SENSITIVE_EXTERNAL_NOT_ALLOWED"), "Cross-provider fallback must preserve sensitive-data boundary");
expect(adapter.includes("allow_fallbacks: false"), "OpenRouter must not perform hidden provider fallbacks outside DTSC observability");

if (failures.length) {
  console.error("Cross-provider fallback QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Cross-provider fallback QA passed");
