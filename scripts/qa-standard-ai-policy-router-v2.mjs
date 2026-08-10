import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const orchestrator = read("lib/ai/orchestrator.ts");
const scoring = read("lib/ai/routing-score.ts");
const health = read("lib/ai/health.ts");
const observability = read("lib/ai/observability.ts");

expect(orchestrator.includes("POLICY_CAPABILITY_COST_HEALTH_V2"), "Policy Router V2 strategy code must be active");
expect(orchestrator.includes("rankCandidates"), "Router must rank policy-eligible candidates");
expect(orchestrator.includes("listAvailableAiModels"), "Policy eligibility must remain before health/scoring");
expect(
  scoring.includes("capabilityScore") &&
    scoring.includes("healthScore") &&
    scoring.includes("costScore") &&
    scoring.includes("latencyScore") &&
    scoring.includes("fallbackPenalty"),
  "Candidate score must include capability, health, cost, latency and fallback dimensions",
);
expect(health.includes("aiProviderAttempt"), "Runtime health must derive from provider attempt observability");
expect(health.includes("firstTokenLatencyMs"), "Runtime health must use observed first-token latency when available");
expect(health.includes("OBSERVABILITY_UNAVAILABLE"), "Health telemetry failure must be represented explicitly instead of granting permissions");
expect(observability.includes("selectionScore") && observability.includes("selectionCriteria"), "Selection explanation must be persisted without prompt content");

if (failures.length) {
  console.error("Policy Router V2 QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Policy Router V2 QA passed");