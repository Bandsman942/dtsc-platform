import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const models = JSON.parse(read("config/ai/openrouter-certified-models-20261030.json"));
const codes = new Set(models.map((model) => model.code));
const upstreamIds = new Set(models.map((model) => model.providerModelId));
const providers = new Set(models.map((model) => model.providerModelId.split("/")[0]));
const health = read("lib/ai/health.ts");
const orchestrator = read("lib/ai/orchestrator.ts");
const catalog = read("lib/ai/catalog.ts");
const adapter = read("lib/ai/providers/openrouter-chat-completions.ts");
const openai = read("lib/ai/providers/openai-responses.ts");
const execute = read("lib/ai/tools/execute.ts");
const access = read("lib/enterprise-ai/access.ts");
const settings = read("app/api/enterprise/ai/settings/route.ts");
const chatPage = read("app/chat/page.tsx");
const chatRoute = read("app/api/chat/v2/route.ts");
const conversations = read("app/api/conversations/[id]/route.ts");
const enterpriseConversations = read("app/api/enterprise/ai/conversations/[id]/route.ts");
const audit = read("scripts/ai/audit-openrouter-catalog.mjs");

expect(models.length >= 6, "At least six additional certified OpenRouter models are required");
expect(codes.size === models.length && upstreamIds.size === models.length, "Certified model identifiers must be unique");
expect(providers.size >= 4, "Fallback portfolio must span at least four upstream model families");
expect(!upstreamIds.has("google/gemini-2.5-flash"), "Gemini 2.5 Flash without a ZDR endpoint must not be recertified");
expect(catalog.includes('REVOKED_NON_ZDR_OPENROUTER_MODEL_IDS = new Set(["google/gemini-2.5-flash"])'), "Current non-ZDR legacy model must be revoked at runtime");
expect(catalog.includes("!REVOKED_NON_ZDR_OPENROUTER_MODEL_IDS.has(model.providerModelId)"), "Revocation must apply to old environment certification");
for (const model of models) {
  expect(model.providerCode === "OPENROUTER" && model.status === "ACTIVE", `${model.code}: must be an explicit OpenRouter model`);
  expect(model.certificationVersion === "DTSC-ZDR-20261030" && model.certifiedAt === "2026-10-30", `${model.code}: certification metadata missing`);
  expect(["STARTER", "BUSINESS", "ENTERPRISE"].includes(model.minimumPlan), `${model.code}: plan restriction missing`);
  expect(model.dataPolicyCode === "INHERIT_PROVIDER", `${model.code}: do not override provider privacy policy`);
  expect(model.allowedContexts.includes("PERSONAL") && model.allowedContexts.includes("ORGANIZATION"), `${model.code}: missing required contexts`);
  expect(model.capabilities?.tools && model.capabilities?.structuredOutput, `${model.code}: must support certified tools and structured output`);
  expect(model.capabilities?.vision === false && model.capabilities?.audioInput === false, `${model.code}: multimodal adapter certification is not included`);
  expect(model.costProfile?.inputPerMillion >= 0 && model.costProfile?.outputPerMillion >= 0 && model.costProfile.currency === "USD", `${model.code}: cost profile missing`);
  expect(model.fallbackModelCodes.length >= 2 && model.fallbackModelCodes.every((code) => code !== model.code && codes.has(code)), `${model.code}: fallback portfolio incomplete`);
}

expect(health.includes("contextCode: context") && health.includes("taskType,"), "Health telemetry must be scoped by execution context and task");
expect(health.includes("PROVIDER_PROTOCOL_INVALID") && health.includes("TOOL_CALL_INVALID"), "Application tool schema failures must not poison provider health");
expect(health.includes("{ reasonCode: null }") && health.includes("reasonCode: { notIn:"), "Successful attempts with nullable reason codes must remain in health evidence");
expect(orchestrator.includes("context: request.context, taskType: request.taskType"), "Orchestrator must pass health scope");
expect(orchestrator.includes('reasonCode: "PROVIDER_UNAVAILABLE"'), "No-healthy-provider and model-not-authorized must be distinguishable");
expect(orchestrator.includes('upstreamStatusCode: error.upstreamStatusCode ?? null'), "Safe upstream HTTP diagnostics must be emitted");
expect(adapter.includes("upstreamStatusCode: response.status"), "OpenRouter HTTP failures must retain sanitized numeric status");
expect(adapter.includes("allow_fallbacks: false, data_collection: \"deny\", zdr: true"), "OpenRouter privacy routing must remain fail-closed");
expect(openai.includes("strict: false"), "Non-strict OpenAI tool transport must support optional fields");
expect(execute.includes("inputSchema.safeParse(input.args)") && execute.includes("authorizeAiTool(input.toolCode"), "Tool execution must still validate inputs and RBAC on the server");
expect(access.includes("enterpriseAiSetting.createMany") && access.includes("skipDuplicates: true"), "First access settings provision must avoid duplicate unique-key errors");
expect(settings.includes("enterpriseAiSetting.findUnique"), "Read settings route must not perform a second empty-update upsert");
expect(chatPage.includes('context: "PERSONAL"') && chatPage.includes("personalPlanCode"), "General chatbot catalog must use its real PERSONAL plan");
expect(chatRoute.includes("availableSavedModel") && chatRoute.includes('context: "PERSONAL"'), "Stale model overrides must fall back without bypassing policy");
expect(conversations.includes('context: "PERSONAL"'), "General chat preference validation must use PERSONAL");
expect(enterpriseConversations.includes("normalizePlanRequirement(access.planCode)"), "Enterprise model preference must enforce plan");
for (const file of ["app/chat/page.tsx", "app/api/models/route.ts", "app/enterprise-modules/[moduleCode]/page.tsx", "app/settings/page.tsx"]) {
  expect(read(file).includes("filterPlatformAllowedAiModels") && read(file).includes("getAiPlatformPolicy"), `${file}: selector must respect administrator disabled models and providers`);
}
expect(read("app/enterprise-modules/[moduleCode]/page.tsx").includes("getCanonicalAiUsageLimits"), "Enterprise selector must honor the real organization plan");
expect(audit.includes('process.argv.indexOf("--catalog-file")') && audit.includes("/models?zdr=true"), "Versioned certified portfolio must be remotely auditable under ZDR");

if (failures.length) {
  console.error("P0 AI reliability QA failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`P0 AI reliability QA passed: ${models.length} certified ZDR candidates, ${providers.size} model families, and routing safeguards.`);
