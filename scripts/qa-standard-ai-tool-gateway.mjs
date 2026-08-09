import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const registry = read("lib/ai/tool-registry.ts");
const authorize = read("lib/ai/tools/authorize.ts");
const execute = read("lib/ai/tools/execute.ts");
const executors = read("lib/ai/tools/executors/index.ts");
const privateExecutors = read("lib/ai/tools/executors/private-actions.ts");
const confirmationDock = read("components/chat/ai-tool-confirmation-dock.tsx");
const chatPage = read("app/chat/page.tsx");

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

for (const code of ["SUPPORT_TICKET_CREATE", "DTSC_CONTACT_EMAIL_SEND"]) {
  if (!registry.includes(code)) failures.push(`missing mutation registry tool ${code}`);
  if (!privateExecutors.includes(code)) failures.push(`missing mutation executor ${code}`);
}

if (!registry.includes('mode: "MUTATE"')) failures.push("mutation tools must use MUTATE mode");
if (!registry.includes("requiresConfirmation: true")) failures.push("mutation tools must require structured confirmation");
if (!registry.includes("idempotent: true")) failures.push("mutation tools must be idempotent");
if (!authorize.includes("getEnterpriseAiAccess")) failures.push("tool authorization must reuse Enterprise AI access");
if (!authorize.includes("resolveEnterpriseModuleAccess")) failures.push("tool authorization must reuse enterprise module access");
if (!authorize.includes("planMeetsRequirement")) failures.push("tool authorization must enforce minimum plan");
if (!execute.includes("safeParse(input.args)")) failures.push("tool inputs must be runtime validated");
if (!execute.includes("outputSchema.safeParse")) failures.push("tool outputs must be runtime validated");
if (!execute.includes("authorizeAiTool")) failures.push("execution must pass centralized authorization");
if (!execute.includes('ON CONFLICT ("idempotencyScopeKey") DO NOTHING')) failures.push("execution must protect the idempotency key at database level");
if (!execute.includes('RETURNING "id"')) failures.push("execution must know whether it won the idempotency insert race");
if (!execute.includes("TOOL_EXECUTION_IN_PROGRESS")) failures.push("concurrent duplicate execution must be rejected while the first is running");
if (!executors.includes("PHARMACY_AI_TOOL_EXECUTORS")) failures.push("pharmacy executors must be explicit");
if (!executors.includes("PRIVATE_ACTION_AI_TOOL_EXECUTORS")) failures.push("private mutation executors must be explicit");
if (!confirmationDock.includes("/api/ai/tools/confirm")) failures.push("chat confirmation UI must call the structured confirmation endpoint");
if (!confirmationDock.includes("/api/ai/tools/cancel")) failures.push("chat confirmation UI must provide cancellation");
if (!confirmationDock.includes("Typing yes in the chat never authorizes this action")) failures.push("confirmation UI must state that natural language is not authorization");
if (!chatPage.includes("<AiToolConfirmationDock")) failures.push("chat page must mount the confirmation UI");

if (failures.length) {
  console.error("AI tool gateway QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool gateway QA passed");
}
