import { spawnSync } from "node:child_process";

const checks = [
  ["AI policy routing", ["node", "scripts/qa-standard-ai-policy-routing.mjs"]],
  ["ERP stabilization final", ["node", "scripts/qa-erp-stabilization-final.mjs"]],
];

for (const [label, [command, ...args]] of checks) {
  console.log(`\n[ai00-integration] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`[ai00-integration] FAILED: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\n[ai00-integration] OK");
