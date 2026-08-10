import { spawnSync } from "node:child_process";
import { runStandardAiIteration05Audit } from "./lib/standard-ai-iteration05-audit.mjs";

runStandardAiIteration05Audit("all");

const checks = [
  ["AI00 integration", "scripts/qa-ai00-integration-gate.mjs"],
  ["AI plan enforcement", "scripts/qa-standard-ai-plan-enforcement.mjs"],
  ["AI provider bypass inventory", "scripts/qa-standard-ai-provider-bypass-inventory.mjs"],
  ["AI provider adapters", "scripts/qa-standard-ai-provider-adapters.mjs"],
  ["AI normalized stream", "scripts/qa-standard-ai-normalized-stream.mjs"],
  ["AI stream cancellation", "scripts/qa-standard-ai-stream-cancellation.mjs"],
  ["AI provider attempts", "scripts/qa-standard-ai-provider-attempts.mjs"],
  ["AI OpenRouter provider", "scripts/qa-standard-ai-openrouter-provider.mjs"],
  ["AI certified models", "scripts/qa-standard-ai-certified-models.mjs"],
  ["AI cross-provider fallback", "scripts/qa-standard-ai-cross-provider-fallback.mjs"],
  ["AI external provider default", "scripts/qa-standard-ai-external-provider-default.mjs"],
  ["AI model UI policy", "scripts/qa-standard-ai-model-ui-policy.mjs"],
  ["AI Policy Router V2", "scripts/qa-standard-ai-policy-router-v2.mjs"],
  ["AI routing determinism", "scripts/qa-standard-ai-routing-determinism.mjs"],
  ["AI routing cost/health", "scripts/qa-standard-ai-routing-cost-health.mjs"],
  ["AI data policy fallbacks", "scripts/qa-standard-ai-data-policy-fallbacks.mjs"],
];

for (const [label, script] of checks) {
  console.log(`\n[standard-ai-iteration-05] ${label}`);
  const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[standard-ai-iteration-05] FAILED: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[standard-ai-iteration-05] AI00 + AI01 + AI02 + AI03 gates passed");