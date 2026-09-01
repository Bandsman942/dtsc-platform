import fs from "node:fs";

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  return fs.readFileSync(path, "utf8");
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const types = read("lib/ai/types.ts");
const format = read("lib/ai/providers/message-format.ts");
const openai = read("lib/ai/providers/openai-responses.ts");
const openrouter = read("lib/ai/providers/openrouter-chat-completions.ts");
const runtime = read("lib/ai/agent/runtime.ts");
const failures = read("lib/ai/agent/failures.ts");
const persistence = read("lib/ai/agent/persistence.ts");
const resume = read("lib/ai/agent/resume.ts");
const globalAgentRoute = read("app/api/chat/agent/route.ts");
const enterpriseAgentRoute = read("app/api/enterprise/ai/agent/route.ts");
const runRoute = read("app/api/ai/agent/runs/[id]/route.ts");
const resumeRoute = read("app/api/ai/agent/runs/[id]/resume/route.ts");
const dock = read("components/chat/ai-agent-run-dock.tsx");
const regressionRunner = read("scripts/run-regression-qa-ci.mjs");

assert(types.includes("export type AiProviderInputMessage") && types.includes('role: "tool"') && types.includes("toolCallId: string"), "Provider history must model a structural tool result message");
assert(types.includes("AiProviderToolCall") && types.includes("toolCalls: AiProviderToolCall[]"), "Provider history must model assistant tool calls with stable ids");

assert(format.includes('type: "function_call_output"') && format.includes("call_id: message.toolCallId"), "OpenAI Responses adapter must emit function_call_output linked by call_id");
assert(format.includes('type: "function_call"') && format.includes("call_id: toolCall.id"), "OpenAI Responses adapter must preserve assistant function_call identity");
assert(format.includes('role: "tool"') && format.includes("tool_call_id: message.toolCallId"), "Chat Completions adapter must emit tool results linked by tool_call_id");
assert(format.includes("tool_calls: message.toolCalls.map"), "Chat Completions adapter must emit the assistant tool_calls turn");

assert(openai.includes("buildOpenAiResponsesInput(messages)"), "OpenAI Responses provider must consume the canonical structured history");
assert(openai.includes("event.item.call_id") && openai.includes("toolCallIds.set(event.item.id, event.item.call_id)"), "OpenAI Responses stream must preserve provider call_id when available");
assert(openai.includes('reasonCode: "STREAM_INTERRUPTED"') && openai.includes("retryable: !signal?.aborted"), "OpenAI stream interruption must be classifiable as bounded retryable failure");
assert(openrouter.includes("buildChatCompletionsMessages(messages, instructions)"), "OpenRouter provider must consume the canonical structured history");
assert(openrouter.includes('reasonCode: "STREAM_INTERRUPTED"') && openrouter.includes("retryable: !signal?.aborted"), "OpenRouter stream interruption must be classifiable as bounded retryable failure");

assert(runtime.includes("let modelRetryAttempt = 0") && runtime.includes("modelRetryAttempt < 1") && runtime.includes("isRetryableAgentModelError(error)"), "Post-tool model recovery must be bounded to one retry and only retryable failures");
assert(runtime.includes("hasStructuredToolContext") && runtime.includes('phase: "POST_TOOL_MODEL"') && runtime.includes('status: "RETRYING"'), "Retry must only happen after a structural tool result and remain auditable");
const canonicalToolCallsIndex = runtime.indexOf("const canonicalToolCalls =");
const assistantToolTurnIndex = canonicalToolCallsIndex >= 0 ? runtime.indexOf('role: "assistant"', canonicalToolCallsIndex) : -1;
const assistantToolCallsIndex = assistantToolTurnIndex >= 0 ? runtime.indexOf("toolCalls: canonicalToolCalls", assistantToolTurnIndex) : -1;
const firstToolResultIndex = assistantToolCallsIndex >= 0 ? runtime.indexOf('role: "tool"', assistantToolCallsIndex) : -1;
assert(canonicalToolCallsIndex >= 0 && assistantToolTurnIndex > canonicalToolCallsIndex && assistantToolCallsIndex > assistantToolTurnIndex && firstToolResultIndex > assistantToolCallsIndex, "Runtime must append the canonical assistant tool_call turn before any structural tool result");
assert(runtime.includes('messages.push({ role: "tool", toolCallId: toolCall.id'), "Runtime must append structural tool result messages");
assert(!runtime.includes('messages.push({ role: "user", content: buildAgentToolResultMessage'), "Runtime must never disguise a tool result as a user message");
const retryIndex = runtime.indexOf("let modelRetryAttempt = 0");
const retryEnd = retryIndex >= 0 ? runtime.indexOf("lastProviderCode = turn.providerCode", retryIndex) : -1;
const executionIndex = runtime.indexOf("const execution = await executeAiTool");
const retrySource = retryIndex >= 0 && retryEnd > retryIndex ? runtime.slice(retryIndex, retryEnd) : "";
assert(retryIndex >= 0 && retryEnd > retryIndex && executionIndex > retryEnd && !retrySource.includes("executeAiTool"), "Tool execution must remain outside the post-tool model retry loop so a successful tool is never replayed");

assert(failures.includes("RETRYABLE_PROVIDER_REASONS") && failures.includes("SERVICE_TEMPORARILY_UNAVAILABLE"), "Agent failures must separate retryable provider failures from safe client categories");
assert(failures.includes("getAiAgentClientFailureMessage") && failures.includes("Le service IA a été temporairement indisponible"), "Safe agent failure copy must exist in FR/EN");
assert(failures.includes("buildAiAgentClientFailurePayload") && failures.includes("failureCategory"), "Agent endpoints must share a safe client failure payload contract");

assert(persistence.includes("providerToolCallId") && persistence.includes("argumentsJson") && persistence.includes("runId: string"), "Confirmed resume must recover original tool id and arguments without a schema change");
assert(resume.includes("resumedToolCallId") && resume.includes("resumedToolMessages") && resume.includes('role: "tool"'), "Confirmed agent resume must reconstruct the structural tool call/result pair");
assert(resume.includes("getConfirmedAiToolExecutionForRun({ runId: run.id") && !resume.includes('{ role: "user", content: canonicalResultMessage }'), "Confirmed resume must not fall back to a fake user tool result");

assert(globalAgentRoute.includes("safeAgentStartResponse") && globalAgentRoute.includes("buildAiAgentClientFailurePayload"), "Global Agent start API must return safe categorized failures");
assert(!globalAgentRoute.includes("return NextResponse.json({ error:") && !globalAgentRoute.includes("return NextResponse.json({ error: reasonCode"), "Global Agent start API must not return raw reasonCode failures to the client");
assert(enterpriseAgentRoute.includes("safeAgentStartResponse") && enterpriseAgentRoute.includes("buildAiAgentClientFailurePayload"), "Enterprise Agent start API must return safe categorized failures");
assert(!enterpriseAgentRoute.includes("return NextResponse.json({ error:") && !enterpriseAgentRoute.includes("return NextResponse.json({ error: reasonCode"), "Enterprise Agent start API must not return raw reasonCode failures to the client");
assert(runRoute.includes("failureCategory: classifyAiAgentFailure") && !runRoute.includes("reasonCode: run.reasonCode") && !runRoute.includes("...step"), "Agent run API must expose a safe category and explicit step fields, not raw technical diagnostics");
assert(!runRoute.includes("providerCode: step.providerCode") && !runRoute.includes("modelCode: step.modelCode") && !runRoute.includes("reasonCode: step.reasonCode"), "Agent step API must not leak provider/model/raw reason codes");
assert(resumeRoute.includes("safeFailureResponse") && resumeRoute.includes("getAiAgentClientFailureMessage") && !resumeRoute.includes("return NextResponse.json({ error: reasonCode, reasonCode }"), "Resume API must humanize failures without returning internal reason codes");
assert(dock.includes("failureCategory") && dock.includes("getAiAgentClientFailureMessage") && !dock.includes("body?.reasonCode"), "Agent dock must render stable human failure categories without raw reason codes");
assert(dock.includes('step.kind === "SYSTEM" && step.status === "RETRYING"'), "Agent dock must show a safe recovery step without private reasoning");

assert(regressionRunner.includes("qa-hotfix-545-agent-post-tool-resilience.mjs"), "Hotfix #545 QA must run inside the canonical CI regression gate");

console.log("Hotfix #545 Agent post-tool resilience QA passed");
