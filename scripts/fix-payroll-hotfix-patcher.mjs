import fs from "node:fs";

const path = "scripts/apply-payroll-hotfix-once.mjs";
const lines = fs.readFileSync(path, "utf8").split("\n");

const loopIndex = lines.findIndex((line) => line.includes("for (const check of checks) {"));
if (loopIndex < 0 || !lines[loopIndex + 1]?.includes("console.log")) {
  throw new Error("QA loop log anchor not found");
}
lines[loopIndex + 1] = '  console.log((check.ok ? "✓" : "✗") + " " + check.label);';

const summaryIndex = lines.findIndex((line) => line.includes("Payroll hotfix QA:"));
if (summaryIndex < 0) throw new Error("QA summary log anchor not found");
lines[summaryIndex] = 'console.log("\\nPayroll hotfix QA: " + (checks.length - failed) + "/" + checks.length + " checks passed.");';

fs.writeFileSync(path, lines.join("\n"), "utf8");
console.log("Payroll hotfix patcher syntax repaired.");
