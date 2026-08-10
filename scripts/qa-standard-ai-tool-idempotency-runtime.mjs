import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const registry = read("lib/ai/tool-registry.ts");
const execute = read("lib/ai/tools/execute.ts");
const security = read("lib/ai/tools/security.ts");
const migration = read("prisma/migrations/20260810002000_ai_tool_gateway_confirmation_idempotency/migration.sql");
const prismaFragment = read("prisma/standard-ai-governance.prisma");

for (const code of ["SUPPORT_TICKET_CREATE", "DTSC_CONTACT_EMAIL_SEND"]) {
  const start = registry.indexOf(`code: \"${code}\"`);
  const block = start >= 0 ? registry.slice(start, start + 900) : "";
  if (!block.includes("idempotent: true")) failures.push(`${code} must be idempotent`);
}
if (!security.includes("buildAiToolIdempotencyScopeKey")) failures.push("canonical idempotency scope builder missing");
for (const part of ["userId", "organizationId", "conversationId", "turnId", "toolCode", "argumentsHash"]) {
  if (!security.includes(part)) failures.push(`idempotency scope missing ${part}`);
}
if (!execute.includes('ON CONFLICT ("idempotencyScopeKey") DO NOTHING')) failures.push("database race protection missing");
if (!execute.includes('RETURNING "id"')) failures.push("execution claim must identify the winning request");
if (!execute.includes("existing?.status === \"SUCCESS\"")) failures.push("safe retry must reuse prior successful result");
if (!execute.includes("TOOL_EXECUTION_IN_PROGRESS")) failures.push("concurrent retry must not invoke second executor");
if (!migration.includes('AiToolExecution_idempotencyScopeKey_key')) failures.push("unique idempotency migration missing");
if (!prismaFragment.includes("idempotencyScopeKey String   @unique")) failures.push("Prisma idempotency uniqueness missing");

if (failures.length) {
  console.error("AI tool idempotency runtime QA failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("AI tool idempotency runtime QA passed");
}
