import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const registry = read("lib/ai/tool-registry.ts");
const authorize = read("lib/ai/tools/authorize.ts");
const execute = read("lib/ai/tools/execute.ts");
const executors = read("lib/ai/tools/executors/index.ts");

for (const code of [
  "PHARMACY_DASHBOARD_READ",
  "PHARMACY_LOW_STOCK_READ",
  "PHARMACY_EXPIRY_READ",
  "PHARMACY_OPEN_ALERTS_READ",
  "PHARMACY_TODAY_SALES_READ",
  "PHARMACY_CASH_SESSIONS_READ",
  "PHARMACY_OPEN_PURCHASES_READ",
  "PHARMACY_QUALITY_INCIDENTS_READ",
  "PHARMACY_DOCUMENTS_SUMMARY_READ",
]) {
  if (!registry.includes(code)) failures.push(`missing registry tool ${code}`);
}

if (!authorize.includes("getEnterpriseAiAccess")) failures.push("tool authorization must reuse Enterprise AI access");
if (!authorize.includes("resolveEnterpriseModuleAccess")) failures.push("tool authorization must reuse enterprise module access");
if (!authorize.includes("planMeetsRequirement")) failures.push("tool authorization must enforce minimum plan");
if (!execute.includes("safeParse(input.args)")) failures.push("tool inputs must be runtime validated");
if (!execute.includes("outputSchema.safeParse")) failures.push("tool outputs must be runtime validated");
if (!execute.includes("authorizeAiTool")) failures.push("execution must pass centralized authorization");
if (!executors.includes("PHARMACY_AI_TOOL_EXECUTORS")) failures.push("pharmacy executors must be explicit");

if (failures.length) {
  console.error("AI tool gateway QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool gateway QA passed");
}
