import fs from "node:fs";

const registryPath = "lib/ai/tool-registry.ts";
let registry = fs.readFileSync(registryPath, "utf8");
const readIdempotencyAnchor = `    mode: "READ",\n    requiresConfirmation: false,\n    idempotent: true,\n    auditLevel: "STANDARD",`;
const readIdempotencyReplacement = `    mode: "READ",\n    requiresConfirmation: false,\n    idempotent: false,\n    auditLevel: "STANDARD",`;
if (!registry.includes(readIdempotencyAnchor)) throw new Error("PHARMACY_READ_IDEMPOTENCY_ANCHOR_NOT_FOUND");
registry = registry.replace(readIdempotencyAnchor, readIdempotencyReplacement);
fs.writeFileSync(registryPath, registry);

const executePath = "lib/ai/tools/execute.ts";
let execute = fs.readFileSync(executePath, "utf8");
const oldScope = `  const argumentsHash = hashAiToolArguments(parsedInput.data);\n  const idempotencyScopeKey = buildAiToolIdempotencyScopeKey({\n    userId: input.context.userId,\n    organizationId: input.context.organizationId,\n    conversationId: input.context.conversationId,\n    turnId: input.context.turnId,\n    toolCode: input.toolCode,\n    argumentsHash,\n  });`;
const newScope = `  const argumentsHash = hashAiToolArguments(parsedInput.data);\n  const executionId = randomUUID();\n  const idempotencyScopeKey = definition.idempotent\n    ? buildAiToolIdempotencyScopeKey({\n        userId: input.context.userId,\n        organizationId: input.context.organizationId,\n        conversationId: input.context.conversationId,\n        turnId: input.context.turnId,\n        toolCode: input.toolCode,\n        argumentsHash,\n      })\n    : \`execution:\${executionId}\`;`;
if (!execute.includes(oldScope)) throw new Error("EXECUTION_IDEMPOTENCY_SCOPE_ANCHOR_NOT_FOUND");
execute = execute.replace(oldScope, newScope);
const duplicateExecutionId = `\n  const executionId = randomUUID();\n  const inserted = await prisma.$queryRaw<InsertedExecutionRow[]>(Prisma.sql\``;
const singleExecutionId = `\n  const inserted = await prisma.$queryRaw<InsertedExecutionRow[]>(Prisma.sql\``;
if (!execute.includes(duplicateExecutionId)) throw new Error("DUPLICATE_EXECUTION_ID_ANCHOR_NOT_FOUND");
execute = execute.replace(duplicateExecutionId, singleExecutionId);
fs.writeFileSync(executePath, execute);

const qaPath = "scripts/qa-standard-ai-tool-gateway.mjs";
let qa = fs.readFileSync(qaPath, "utf8");
const qaAnchor = `if (!registry.includes('mode: "MUTATE"')) failures.push("mutation tools must use MUTATE mode");`;
const qaReplacement = `if (!registry.includes('mode: "MUTATE"')) failures.push("mutation tools must use MUTATE mode");\nif (!registry.includes('mode: "READ"') || !registry.includes("idempotent: false")) failures.push("live READ tools must not reuse mutation idempotency results as a cache");\nif (!execute.includes("definition.idempotent") || !execute.includes("execution:\${executionId}")) failures.push("non-idempotent READ executions must receive a unique execution scope");`;
if (!qa.includes(qaAnchor)) throw new Error("TOOL_GATEWAY_QA_ANCHOR_NOT_FOUND");
qa = qa.replace(qaAnchor, qaReplacement);
fs.writeFileSync(qaPath, qa);

console.log("AI06 READ idempotency semantics fixed: live reads execute fresh, mutations remain protected");
