import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, "utf8");
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const continuation = read("lib/ai/provider-continuation.ts");
const types = read("lib/ai/types.ts");
const events = read("lib/ai/provider-events.ts");
const provider = read("lib/ai/provider.ts");
const format = read("lib/ai/providers/message-format.ts");
const openai = read("lib/ai/providers/openai-responses.ts");
const openrouter = read("lib/ai/providers/openrouter-chat-completions.ts");
const turn = read("lib/ai/agent/turn.ts");
const runtime = read("lib/ai/agent/runtime.ts");
const persistence = read("lib/ai/agent/persistence.ts");
const resume = read("lib/ai/agent/resume.ts");
const errors = read("lib/ai/errors.ts");
const failures = read("lib/ai/agent/failures.ts");
const runRoute = read("app/api/ai/agent/runs/[id]/route.ts");
const regressionRunner = read("scripts/run-regression-qa-ci.mjs");

assert(continuation.includes('protocol: "OPENAI_RESPONSES"'), "Continuation state must be protocol-scoped to OpenAI Responses");
assert(continuation.includes('type: "reasoning"') && continuation.includes("encryptedContent: string"), "Continuation state must retain opaque encrypted reasoning when the provider emits it");
assert(continuation.includes('type: "function_call"') && continuation.includes("outputIndex: number") && continuation.includes("callId: string"), "Continuation state must retain ordered function calls and call ids");
assert(continuation.includes("itemId?: string") && continuation.includes("id: item.itemId"), "Responses function item ids must be preserved when the provider supplies them");
assert(continuation.includes("MAX_AI_REASONING_ENCRYPTED_CHARS") && continuation.includes("MAX_AI_PROVIDER_CONTINUATION_CHARS") && continuation.includes("MAX_AI_PROVIDER_CONTINUATION_ITEMS"), "Opaque provider continuation must be bounded");
assert(continuation.includes("toOpenAiResponsesContinuationInput") && continuation.includes("encrypted_content: item.encryptedContent"), "Opaque reasoning must be re-emitted to Responses input");
assert(!continuation.includes("reasoning_text") && !continuation.includes("summary_text"), "Continuation storage must not model plaintext chain-of-thought content");

assert(types.includes("providerContinuation?: AiProviderContinuationState") && types.includes('"PROVIDER_PROTOCOL_INVALID"'), "Canonical provider history must carry opaque continuation and a stable protocol failure code");
assert(events.includes('type: "CONTINUATION_STATE_ITEM"'), "Provider stream events must transport opaque continuation internally");

assert(openai.includes('include: ["reasoning.encrypted_content"]'), "Reasoning models must request encrypted reasoning continuation from OpenAI");
assert(openai.includes("model.capabilities.reasoning"), "Encrypted reasoning include must remain limited to reasoning-capable models");
assert(openai.includes("event.item?.type === \"reasoning\"") && openai.includes("event.item.encrypted_content"), "OpenAI stream parser must capture encrypted reasoning state when reasoning is emitted");
assert(openai.includes('return [{ type: "ERROR", reasonCode: "PROVIDER_PROTOCOL_INVALID" }]'), "An emitted reasoning item without encrypted state must fail closed before business tools run");
assert(openai.includes('type: "CONTINUATION_STATE_ITEM"') && openai.includes('type: "function_call"') && openai.includes("outputIndex: event.output_index"), "OpenAI stream parser must capture ordered function-call continuation items");
assert(openai.includes('store: false'), "OpenAI Responses must remain store:false");
assert(!openai.includes("reasoning_text.done") && !openai.includes("summary_text"), "Provider adapter must not capture plaintext reasoning events");
assert(openai.includes("readProviderErrorFingerprint") && openai.includes("slice(0, 8_000)") && !openai.includes("await response.json()"), "Provider diagnostics must remain bounded and sanitized instead of persisting a raw body");

assert(format.includes("validatedOpenAiContinuation") && format.includes("toOpenAiResponsesContinuationInput(state)"), "Responses formatter must validate and re-inject opaque continuation state");
assert(format.includes("expectedCallIds") && format.includes("continuationCallIds") && format.includes("PROVIDER_PROTOCOL_INVALID"), "Responses formatter must reject call-id mismatch before provider execution");
const assistantContinuationIndex = format.indexOf("input.push(...continuation)");
const toolOutputBranchIndex = format.indexOf('type: "function_call_output"');
assert(assistantContinuationIndex >= 0 && toolOutputBranchIndex >= 0, "Responses formatter must contain both continuation and function output paths");
assert(!openrouter.includes("providerContinuation") && !openrouter.includes("encrypted_content"), "OpenRouter/Chat Completions must not receive OpenAI Responses continuation state");
assert(provider.includes('reasonCode: "PROVIDER_PROTOCOL_INVALID"') && !provider.includes('reasonCode: "INVALID_REQUEST"'), "Unsupported provider protocols must be classified as internal protocol failures");

assert(turn.includes("createAiProviderContinuationState(continuationItems)"), "Agent model turn must assemble provider continuation state");
assert(turn.includes("requiresResponsesContinuation") && turn.includes("identitiesMatch"), "Reasoning-capable Responses tool turns must validate the complete function-call continuation state");
assert(turn.includes('reasonCode: "PROVIDER_PROTOCOL_INVALID"'), "Missing or inconsistent Responses continuation must have a stable internal protocol failure");
assert(!turn.includes("reasoningItems.length === 0"), "A zero-effort reasoning-capable model must not be forced to emit a reasoning item when the provider emitted none");
assert(turn.includes("toolCalls.length > 1") && turn.includes("requiresConfirmation") && turn.includes('reasonCode: "TOOL_CALL_INVALID"'), "A confirmation-required tool must be isolated before any multi-tool execution");

assert(runtime.includes("providerContinuation: turn.providerContinuation"), "Runtime must carry continuation state on the canonical assistant tool-call turn");
assert(runtime.includes("providerContinuationItemCount") && runtime.includes("hasOpaqueReasoningState"), "Runtime audit metadata must expose only safe continuation presence/count diagnostics");
const executionIndex = runtime.indexOf("const execution = await executeAiTool");
const continuationPushIndex = runtime.indexOf("providerContinuation: turn.providerContinuation");
assert(continuationPushIndex >= 0 && executionIndex > continuationPushIndex, "Provider continuation must be validated and attached before any business tool execution");

assert(persistence.includes("parseAiProviderContinuationState") && persistence.includes("latestModelStep") && persistence.includes("providerContinuation: readProviderContinuation"), "Confirmation resume must recover bounded opaque continuation from existing server-only model-step metadata");
assert(resume.includes("providerContinuation: execution.providerContinuation || undefined"), "Confirmed tool resume must restore the opaque provider continuation before its tool result");
assert(runRoute.includes("stepIndex: step.stepIndex") && !runRoute.includes("metadataJson: step.metadataJson") && !runRoute.includes("providerContinuation"), "Client run snapshots must never expose opaque provider continuation metadata");

assert(errors.includes('status === 400 || status === 422') && errors.includes('reasonCode: "PROVIDER_PROTOCOL_INVALID"'), "Provider 400/422 generated from DTSC payload construction must not blame the user by default");
assert(failures.includes('"PROVIDER_PROTOCOL_INVALID"') && failures.includes('"TOOL_CALL_INVALID"') && failures.includes("SERVICE_TEMPORARILY_UNAVAILABLE"), "Internal provider/tool protocol failures must map to a safe service category");
assert(failures.includes("getAiAgentInternalDiagnostic") && failures.includes("providerFingerprint") && failures.includes("[ai-agent-provider-failure]"), "Server-side provider diagnostics must be bounded, structured and actually emitted without client leakage");
assert(!failures.includes("return error.message.slice(0, 160)"), "Arbitrary runtime error messages must not become persisted agent reason codes");

const fiveFinanceTools = [
  "FINANCE_TREASURY_READ",
  "FINANCE_BANK_READ",
  "FINANCE_PAYMENTS_READ",
  "FINANCE_RECONCILIATION_READ",
  "FINANCE_OVERVIEW_READ",
];
const financeContract = read("lib/ai/tools/finance-contract.ts");
for (const toolCode of fiveFinanceTools) {
  assert(financeContract.includes(toolCode), `Production multi-tool regression fixture must retain ${toolCode}`);
}
assert(turn.includes("continuationCallIds.length") && turn.includes("toolCallIds.length"), "Multi-tool continuation must verify all call ids rather than only the first tool");
assert(runtime.includes("for (const toolCall of canonicalToolCalls)"), "Runtime must preserve all tool results from one model turn before the next model continuation");

assert(regressionRunner.includes("qa-hotfix-547-responses-reasoning-continuation.mjs"), "Hotfix #547 QA must run inside the canonical CI regression gate");

console.log("Hotfix #547 OpenAI Responses reasoning continuation QA passed");
