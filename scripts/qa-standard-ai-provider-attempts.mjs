import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

const prismaModel = read("prisma/standard-ai-governance.prisma");
const migration = read("prisma/migrations/20260809225500_ai_provider_attempt_observability/migration.sql");
const observability = read("lib/ai/observability.ts");
const orchestrator = read("lib/ai/orchestrator.ts");

expect(prismaModel.includes("model AiProviderAttempt"), "AiProviderAttempt model must exist");
for (const field of ["routeRequestId", "providerCode", "modelCode", "attemptIndex", "reasonCode", "durationMs"]) {
  expect(prismaModel.includes(field), `AiProviderAttempt must include ${field}`);
}
expect(migration.includes('CREATE TABLE "AiProviderAttempt"'), "Additive AiProviderAttempt migration must exist");
expect(observability.includes("startAiProviderAttempt"), "Provider attempt start service must exist");
expect(observability.includes("completeAiProviderAttempt"), "Provider attempt completion service must exist");
expect(orchestrator.includes("startAiProviderAttempt"), "Orchestrator must persist provider attempts before provider execution");
expect(orchestrator.includes("completeAiProviderAttempt"), "Orchestrator must persist provider attempt outcomes");
expect(!prismaModel.includes("promptContent"), "Provider attempt model must not store prompt content");
expect(!prismaModel.includes("messageContent"), "Provider attempt model must not store message content");

if (failures.length) {
  console.error("AI provider attempts QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI provider attempts QA passed");
