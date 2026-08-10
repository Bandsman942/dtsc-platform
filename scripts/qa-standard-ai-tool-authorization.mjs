import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const authorize = read("lib/ai/tools/authorize.ts");
const registry = read("lib/ai/tool-registry.ts");
const execute = read("lib/ai/tools/execute.ts");

for (const contract of ["getAiToolDefinition", "getAiToolInputSchema", "getAiToolOutputSchema", "getAiToolExecutor"]) {
  if (!authorize.includes(contract)) failures.push(`authorization must require ${contract}`);
}
if (!authorize.includes("definition.contexts.includes(activeContext)")) failures.push("active session context must be enforced");
if (!authorize.includes("context.session.activeOrganizationId !== organizationId")) failures.push("active organization must match requested organization");
if (!authorize.includes("getEnterpriseAiAccess")) failures.push("enterprise membership/AI entitlement must be revalidated server-side");
if (!authorize.includes("resolveEnterpriseModuleAccess")) failures.push("module entitlement and role/permission access must be revalidated");
if (!authorize.includes("planMeetsRequirement")) failures.push("minimum SaaS plan must be enforced");
if (!authorize.includes('context.dataClassifications?.includes("SECRET")')) failures.push("SECRET data must fail closed for tool execution");
if (!authorize.includes("allowedAssistantCodes")) failures.push("assistant allow-list must be enforced when configured");
if (!authorize.includes("allowedSectorCodes")) failures.push("sector allow-list must be enforced when configured");
if (!registry.includes("requiredPermissions")) failures.push("registry must preserve permission metadata");
if (!execute.includes("const authorization = await authorizeAiTool")) failures.push("executor must never run before centralized authorization");

if (failures.length) {
  console.error("AI tool authorization QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool authorization QA passed");
}
