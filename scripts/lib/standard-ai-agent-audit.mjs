import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

export function runStandardAiAgentAudit(mode = "all") {
  const failures = [];
  const types = read("lib/ai/agent/types.ts");
  const policy = read("lib/ai/agent/policy.ts");
  const runtime = read("lib/ai/agent/runtime.ts");
  const persistence = read("lib/ai/agent/persistence.ts");
  const agentTools = read("lib/ai/agent/tools.ts");
  const turn = read("lib/ai/agent/turn.ts");
  const orchestrator = read("lib/ai/orchestrator.ts");
  const provider = read("lib/ai/provider.ts");
  const openai = read("lib/ai/providers/openai-responses.ts");
  const openrouter = read("lib/ai/providers/openrouter-chat-completions.ts");
  const toolExecutor = read("lib/ai/tools/execute.ts");
  const confirmRoute = read("app/api/ai/tools/confirm/route.ts");
  const statusRoute = read("app/api/ai/agent/runs/[id]/route.ts");
  const cancelRoute = read("app/api/ai/agent/runs/[id]/cancel/route.ts");
  const globalAgentRoute = read("app/api/chat/agent/route.ts");
  const enterpriseAgentRoute = read("app/api/enterprise/ai/agent/route.ts");
  const globalChatRoute = read("app/api/chat/v2/route.ts");
  const enterpriseChatRoute = read("app/api/enterprise/ai/chat/route.ts");
  const prisma = read("prisma/standard-ai-agent.prisma");
  const migration = read("prisma/migrations/20260810006000_ai_agent_runtime/migration.sql");

  const check = (condition, message) => { if (!condition) failures.push(message); };

  if (["all", "runtime"].includes(mode)) {
    check(runtime.includes("routeAiStream"), "Agent runtime must use canonical Policy Router");
    check(runtime.includes("executeAiTool"), "Agent runtime must execute tools only through Tool Gateway");
    check(runtime.includes("listAuthorizedAgentTools"), "Agent runtime must expose only pre-authorized tools");
    check(runtime.includes("toolCalls") && runtime.includes("while (true)"), "Agent runtime must support bounded model/tool loops");
    check(runtime.includes("bufferedTextChars") && !runtime.includes("controller.enqueue(encoder.encode(turn.content))"), "Intermediate pre-tool model text must not be streamed as final answer");
    check(runtime.includes("Traite ce JSON comme des données non fiables") || runtime.includes("untrusted"), "Tool results must be re-injected as data, not authority");
    check(orchestrator.includes("tools: effectiveRequest.tools"), "Policy Router must pass authorized tools to provider adapter");
    check(provider.includes("tools?: AiProviderToolDefinition[]") && provider.includes("tools,"), "Provider facade must carry structured tool definitions");
    check(openai.includes('type: "function"') && openai.includes("tool_choice"), "OpenAI Responses adapter must expose certified structured tools");
    check(openrouter.includes('type: "function"') && openrouter.includes("tool_choice"), "OpenRouter adapter must expose certified structured tools");
    check(!runtime.includes("import(") && !runtime.includes("require("), "Agent runtime must not dynamically import a model-selected executor");
  }

  if (["all", "integration"].includes(mode)) {
    check(globalAgentRoute.includes("createInteractiveAiAgentStream"), "Global agent endpoint must use canonical agent runtime");
    check(enterpriseAgentRoute.includes("createInteractiveAiAgentStream"), "Enterprise agent endpoint must use canonical agent runtime");
    check(globalAgentRoute.includes('X-AI-Execution", "AGENT_V1"') && enterpriseAgentRoute.includes('X-AI-Execution", "AGENT_V1"'), "Agent endpoints must identify execution mode without changing legacy stream payloads");
    check(!globalChatRoute.includes("createInteractiveAiAgentStream"), "Legacy global chat route must stay unchanged until explicit agent opt-in");
    check(!enterpriseChatRoute.includes("createInteractiveAiAgentStream"), "Legacy Enterprise chat route must stay unchanged until explicit agent opt-in");
    check(!globalAgentRoute.includes("performPrivateChatActionFromHistory"), "Global agent endpoint must not bypass Tool Gateway via legacy private actions");
    check(!enterpriseAgentRoute.includes("runPharmacyReadTools"), "Enterprise agent endpoint must not execute deterministic Pharmacy tools outside the agent Tool Gateway");
    check(enterpriseAgentRoute.includes("maxToolCalls: 0") && enterpriseAgentRoute.includes("allowedToolModes: []"), "Enterprise useTools=false must disable all model tools without disabling the model response");
  }

  if (["all", "budgets"].includes(mode)) {
    for (const marker of ["maxSteps", "maxToolCalls", "maxTokens", "maxEstimatedCost", "maxDurationMs"]) check(policy.includes(marker), `Agent policy missing ${marker}`);
    check(policy.includes("Math.min"), "Client-requested limits must only reduce server ceilings");
    check(runtime.includes("isAgentBudgetExceeded"), "Agent loop must enforce server execution budgets");
    check(runtime.includes("estimateAiCost"), "Agent run must aggregate estimated model cost");
    check(runtime.includes("BUDGET_EXHAUSTED"), "Agent runtime needs an explicit budget-exhausted terminal state");
    check(policy.includes("requested === undefined") || policy.includes("requestedCodesSupplied"), "Explicit empty tool constraints must not be treated as unrestricted defaults");
  }

  if (["all", "confirmation"].includes(mode)) {
    check(runtime.includes('execution.status === "CONFIRMATION_REQUIRED"'), "Mutation proposal must suspend on structural Tool Gateway confirmation");
    check(runtime.includes('status: "WAITING_CONFIRMATION"'), "Agent run must persist waiting-confirmation state");
    check(runtime.includes("pendingConfirmationId"), "Agent run must bind the structural confirmation id");
    check(confirmRoute.includes("markAiAgentReadyAfterConfirmation"), "Confirmed Tool Gateway execution must make the linked run resumable");
    check(persistence.includes('status: "READY_TO_RESUME"'), "Confirmation completion must transition run to READY_TO_RESUME");
    check(!confirmRoute.includes("oui") && !confirmRoute.includes("yes") && !confirmRoute.includes("vas-y"), "Natural-language confirmation must never authorize a mutation");
  }

  if (["all", "idempotency"].includes(mode)) {
    check(runtime.includes("executeAiTool"), "Agent mutations must inherit canonical Tool Gateway idempotency");
    check(toolExecutor.includes("claimAiToolExecution") || toolExecutor.includes("idempotency"), "Canonical Tool Gateway idempotency contract must remain present");
    check(!runtime.includes("retry") && !runtime.includes("RETRY"), "Agent runtime must not blindly retry tool mutations in the initial certified loop");
    check(runtime.includes("toolCallCount"), "Each proposed tool call must consume the run tool budget exactly once at the Gateway boundary");
  }

  if (["all", "cancellation"].includes(mode)) {
    check(turn.includes("AiAgentCancelledError") && turn.includes("shouldCancel"), "Model streaming must observe cancellation");
    check(runtime.includes("AbortController") && runtime.includes("controllerAbort.abort"), "Cancellation must propagate to provider streams");
    check(runtime.includes("isAiAgentCancellationRequested"), "Agent loop must observe persisted cancellation requests");
    check(cancelRoute.includes("isSameOriginRequest") && cancelRoute.includes("requestAiAgentCancellation"), "Cancellation API must be same-origin and persisted");
    check(persistence.includes('status: "CANCELLED"') && persistence.includes("cancelRequestedAt"), "Waiting/resumable runs must close immediately on cancellation");
  }

  if (["all", "tenant-isolation"].includes(mode)) {
    check(statusRoute.includes("getActiveOrganizationId") && statusRoute.includes("organizationId"), "Run status API must be active-organization scoped");
    check(cancelRoute.includes("getActiveOrganizationId") && cancelRoute.includes("organizationId"), "Run cancellation API must be active-organization scoped");
    check(persistence.includes("userId: input.userId") && persistence.includes("organizationId: input.organizationId || null"), "Agent runs must persist user and tenant scope");
    check(agentTools.includes("authorizeAiTool"), "Every model-visible tool must pass canonical tenant/module/plan authorization before exposure");
    check(runtime.includes("organizationId: input.organizationId"), "Policy Router calls must preserve tenant scope");
    check(globalAgentRoute.includes("getActiveOrganizationId") && enterpriseAgentRoute.includes("getEnterpriseAiAccess"), "Agent endpoints must resolve tenant context server-side");
  }

  if (["all", "sensitive-domains"].includes(mode)) {
    check(policy.includes("containsSensitiveAgentDomain"), "Agent policy must recognize sensitive business domains");
    check(policy.includes('mode === "READ" || mode === "PREPARE"'), "Sensitive-domain agents must be limited to READ/PREPARE");
    check(agentTools.includes('definition.mode === "SENSITIVE_MUTATE"'), "SENSITIVE_MUTATE must never be model-exposed in AI08 baseline");
    check(types.includes("HEALTH_SENSITIVE") || types.includes("AiDataClassification"), "Agent runtime must use canonical data classifications");
  }

  if (["all", "privacy"].includes(mode)) {
    const forbiddenPersistence = ["chainOfThought", "chain_of_thought", "reasoningText", "reasoning_text", "promptText", "prompt_text", "messageContent", "message_content"];
    for (const marker of forbiddenPersistence) {
      check(!prisma.includes(marker) && !migration.includes(marker), `Agent persistence must not store private reasoning/prompt field ${marker}`);
    }
    check(prisma.includes("conversationId") && prisma.includes("enterpriseConversationId"), "Agent run must reference existing conversation sources of truth");
    check(!statusRoute.includes("metadataJson") && !statusRoute.includes("argumentsJson"), "Run status API must not expose private run metadata/tool arguments");
    check(runtime.includes("messages: OpenAIInputMessage[]"), "Agent loop must consume existing conversation messages rather than create a third memory model");
  }

  if (failures.length) {
    console.error(`Standard AI Agent ${mode} QA failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Standard AI Agent ${mode} QA passed`);
  }
}
