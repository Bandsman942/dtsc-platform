import fs from "node:fs";

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => fs.readFileSync(path, "utf8");

const prismaModel = read("prisma/standard-ai-governance.prisma");
const migration = read("prisma/migrations/20260810065000_ai_provider_attempt_observability/migration.sql");
const observability = read("lib/ai/observability.ts");
const orchestrator = read("lib/ai/orchestrator.ts");

expect(prismaModel.includes("model AiProviderAttempt"), "AiProviderAttempt model must exist");
for (const field of ["routeRequestId", "providerCode", "modelCode", "providerModelId", "attemptIndex", "reasonCode", "durationMs"]) {
  expect(prismaModel.includes(field), `AiProviderAttempt must include ${field}`);
}
expect(prismaModel.includes("@@unique([routeRequestId, attemptIndex])"), "A route attempt index must be unique inside one route request");
expect(migration.includes('CREATE TABLE "AiProviderAttempt"'), "Additive AiProviderAttempt migration must exist");
expect(migration.includes('CREATE UNIQUE INDEX "AiProviderAttempt_routeRequestId_attemptIndex_key"'), "Migration must enforce route attempt uniqueness");
expect(observability.includes("startAiProviderAttempt"), "Provider attempt start service must exist");
expect(observability.includes("completeAiProviderAttempt"), "Provider attempt completion service must exist");
expect(observability.includes("observeAiProviderAttemptStream"), "Provider attempt must stay observable until the provider stream terminates");
expect(orchestrator.includes("startAiProviderAttempt"), "Orchestrator must persist provider attempts before provider execution");
expect(orchestrator.includes("observeAiProviderAttemptStream"), "Orchestrator must observe provider attempt terminal state through the returned stream");
expect(!prismaModel.includes("promptContent"), "Provider attempt model must not store prompt content");
expect(!prismaModel.includes("messageContent"), "Provider attempt model must not store message content");

if (failures.length) {
  console.error("AI provider attempts QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("AI provider attempts QA passed");
