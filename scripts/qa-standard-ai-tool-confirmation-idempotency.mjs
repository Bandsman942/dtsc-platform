import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const registry = read("lib/ai/tool-registry.ts");
const confirmation = read("lib/ai/tools/confirmation.ts");
const execution = read("lib/ai/tools/execute.ts");
const migration = read("prisma/migrations/20260810002000_ai_tool_gateway_confirmation_idempotency/migration.sql");

for (const code of ["SUPPORT_TICKET_CREATE", "DTSC_CONTACT_EMAIL_SEND"]) {
  const blockStart = registry.indexOf(`code: \"${code}\"`);
  const block = blockStart >= 0 ? registry.slice(blockStart, blockStart + 900) : "";
  if (!block.includes("requiresConfirmation: true")) failures.push(`${code} must require confirmation`);
  if (!block.includes("idempotent: true")) failures.push(`${code} must be idempotent`);
}

if (!confirmation.includes("argumentsHash")) failures.push("confirmation must bind arguments hash");
if (!confirmation.includes("expiresAt")) failures.push("confirmation must expire");
if (!confirmation.includes("conversationId")) failures.push("confirmation must bind conversation");
if (!confirmation.includes("turnId")) failures.push("confirmation must bind turn");
if (!confirmation.includes("userId")) failures.push("confirmation must bind user");
if (!execution.includes("idempotencyScopeKey")) failures.push("execution must use idempotency scope");
if (!execution.includes("CONFIRMATION_INVALID_OR_EXPIRED")) failures.push("execution must reject invalid confirmation");
if (!migration.includes('CREATE TABLE IF NOT EXISTS \"AiToolConfirmation\"')) failures.push("confirmation table migration missing");
if (!migration.includes('CREATE UNIQUE INDEX IF NOT EXISTS \"AiToolExecution_idempotencyScopeKey_key\"')) failures.push("idempotency unique constraint missing");

if (failures.length) {
  console.error("AI tool confirmation/idempotency QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool confirmation/idempotency QA passed");
}
