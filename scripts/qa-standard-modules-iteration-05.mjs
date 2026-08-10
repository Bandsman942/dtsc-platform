import { spawnSync } from "node:child_process";
import { runStandardAiIteration05Audit } from "./lib/standard-ai-iteration05-audit.mjs";

runStandardAiIteration05Audit("all");

const checks = [
  ["AI00 integration", "scripts/qa-ai00-integration-gate.mjs"],
  ["AI plan enforcement", "scripts/qa-standard-ai-plan-enforcement.mjs"],
  ["AI provider bypass inventory", "scripts/qa-standard-ai-provider-bypass-inventory.mjs"],
];

for (const [label, script] of checks) {
  console.log(`\n[standard-ai-iteration-05] ${label}`);
  const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[standard-ai-iteration-05] FAILED: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[standard-ai-iteration-05] AI00 gates passed");
