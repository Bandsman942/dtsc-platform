import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const registry = read("lib/ai/tool-registry.ts");
const confirmation = read("lib/ai/tools/confirmation.ts");
const execution = read("lib/ai/tools/execute.ts");
const migration = read("prisma/migrations/20260810002000_ai_tool_gateway_confirmation_idempotency/migration.sql");
const standardSchema = read("prisma/standard-ai-governance.prisma");

for (const code of ["SUPPORT_TICKET_CREATE", "DTSC_CONTACT_EMAIL_SEND"]) {
  const blockStart = registry.indexOf(`code: \"${code}\"`);
  const block = blockStart >= 0 ? registry.slice(blockStart, blockStart + 900) : "";
  if (!block.includes("requiresConfirmation: true")) failures.push(`${code} must require confirmation`);
  if (!block.includes("idempotent: true")) failures.push(`${code} must be idempotent`);
}
for (const binding of ["argumentsHash", "expiresAt", "conversationId", "turnId", "userId", "organizationId", "toolCode"]) {
  if (!confirmation.includes(binding)) failures.push(`confirmation must bind ${binding}`);
}
if (!confirmation.includes('"status" = \'CONFIRMED\'')) failures.push("confirmation must have explicit CONFIRMED state");
if (!confirmation.includes('"status" = \'CONSUMED\'')) failures.push("confirmation must be single-use CONSUMED");
if (!confirmation.includes('"argumentsJson" = NULL')) failures.push("consumed sensitive arguments must be cleared");
if (!execution.includes("idempotencyScopeKey")) failures.push("execution must use idempotency scope");
if (!execution.includes("CONFIRMATION_INVALID_OR_EXPIRED")) failures.push("execution must reject invalid confirmation");
if (!execution.includes("existing?.status === \"SUCCESS\"")) failures.push("successful idempotent retry must reuse prior result");
if (!migration.includes('CREATE TABLE IF NOT EXISTS \"AiToolConfirmation\"')) failures.push("confirmation table migration missing");
if (!migration.includes('CREATE TABLE IF NOT EXISTS \"AiToolExecution\"')) failures.push("execution table migration missing");
if (!migration.includes('CREATE UNIQUE INDEX IF NOT EXISTS \"AiToolExecution_idempotencyScopeKey_key\"')) failures.push("idempotency unique constraint missing");
for (const model of ["model AiToolConfirmation {", "model AiToolExecution {"]) {
  if (!standardSchema.includes(model)) failures.push(`standard-ai-governance.prisma missing ${model}`);
}
if (!standardSchema.includes("idempotencyScopeKey String   @unique")) failures.push("Prisma Tool Gateway model must preserve idempotency uniqueness");
for (const field of ["argumentsHash", "argumentsJson", "expiresAt", "confirmedAt", "cancelledAt", "consumedAt"]) {
  if (!standardSchema.includes(field)) failures.push(`Prisma confirmation model missing ${field}`);
}

if (failures.length) {
  console.error("AI tool confirmation/idempotency QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool confirmation/idempotency QA passed");
}
