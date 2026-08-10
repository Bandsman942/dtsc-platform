import fs from "node:fs";

const policy = fs.readFileSync("lib/ai/policy.ts", "utf8");
const catalog = fs.readFileSync("lib/ai/catalog.ts", "utf8");
const orchestrator = fs.readFileSync("lib/ai/orchestrator.ts", "utf8");
const openRouter = fs.readFileSync("lib/ai/providers/openrouter-chat-completions.ts", "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(policy.includes("SECRET_NEVER_EXTERNAL"), "SECRET data must remain blocked before all external providers");
expect(policy.includes("SENSITIVE_EXTERNAL_NOT_ALLOWED"), "Sensitive external routing must require explicit server policy");
expect(catalog.includes("evaluateAiModelPolicy"), "Every fallback candidate must originate from policy-filtered availability");
expect(orchestrator.includes("listAvailableAiModels"), "Router fallback candidates must pass canonical availability policy");
expect(orchestrator.includes("allowSensitiveExternalModel: false"), "Runtime must keep AI00 sensitive external override disabled");
expect(openRouter.includes('data_collection: "deny"'), "OpenRouter must deny collecting providers by default");
expect(openRouter.includes("zdr: true"), "OpenRouter ZDR baseline must remain always enabled");
expect(openRouter.includes("requireZeroDataRetention") && openRouter.includes("routing.zdr = true"), "Routing constraints may reaffirm but never weaken ZDR");
expect(openRouter.includes("max_price"), "Server routing may impose OpenRouter provider price ceilings");
expect(openRouter.includes("allow_fallbacks: false"), "OpenRouter must not hide cross-provider fallbacks from DTSC");

if (failures.length) {
  console.error("AI data-policy fallback QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("AI data-policy fallback QA passed");