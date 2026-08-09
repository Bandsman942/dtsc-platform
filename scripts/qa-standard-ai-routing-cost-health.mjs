import fs from "node:fs";

const scoring = fs.readFileSync("lib/ai/routing-score.ts", "utf8");
const health = fs.readFileSync("lib/ai/health.ts", "utf8");
const orchestrator = fs.readFileSync("lib/ai/orchestrator.ts", "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(scoring.includes("estimateAiCost"), "Candidate scoring must consume canonical cost estimates");
expect(scoring.includes("averageFirstTokenLatencyMs"), "Candidate scoring must consume observed latency");
expect(scoring.includes('health.status === "DEGRADED"'), "Degraded health must affect score");
expect(health.includes('status: "UNAVAILABLE"'), "Health registry must support UNAVAILABLE state");
expect(orchestrator.includes('health.status === "UNAVAILABLE"'), "Unavailable candidates must be excluded before provider execution");
expect(orchestrator.includes("maximumEstimatedInputCost"), "Router must support a strict maximum estimated input cost");
expect(orchestrator.includes("score.estimatedInputCost == null"), "Unknown cost must not pass a strict cost ceiling");

if (failures.length) {
  console.error("AI routing cost/health QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("AI routing cost/health QA passed");
