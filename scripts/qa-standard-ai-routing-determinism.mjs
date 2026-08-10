import fs from "node:fs";

const orchestrator = fs.readFileSync("lib/ai/orchestrator.ts", "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(orchestrator.includes("right.score.total - left.score.total"), "Routing must sort by deterministic score first");
expect(orchestrator.includes("leftCost - rightCost"), "Equal scores must use deterministic cost tie-break");
expect(orchestrator.includes("leftLatency - rightLatency"), "Equal score/cost must use deterministic latency tie-break");
expect(orchestrator.includes("left.model.code.localeCompare(right.model.code)"), "Final routing tie-break must use stable model code ordering");
expect(!orchestrator.includes("Math.random"), "Routing must never use random candidate ordering");

if (failures.length) {
  console.error("AI routing determinism QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("AI routing determinism QA passed");