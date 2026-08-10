import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dock = read("components/chat/ai-agent-run-dock.tsx");
const shell = read("components/chat/assistant-immersive-workspace-shell.tsx");
const contextRoute = read("app/api/ai/agent/context/route.ts");
const toolCancelRoute = read("app/api/ai/tools/cancel/route.ts");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(shell.includes("AiAgentRunDock") && shell.includes("variant={variant}"), "Immersive chatbot and Enterprise assistant shells must expose the opt-in agent dock");
check(dock.includes('variant === "enterprise" ? "/api/enterprise/ai/agent" : "/api/chat/agent"'), "Agent UI must use the certified global and Enterprise agent endpoints");
check(dock.includes("X-AI-Agent-Run-Id") && dock.includes("X-Conversation-Id"), "Agent UI must bind streamed responses to canonical run and conversation ids");
check(dock.includes("/api/ai/agent/runs/") && dock.includes("/cancel") && dock.includes("/resume"), "Agent UI must expose status, cancellation and canonical resume controls");
check(dock.includes("/api/ai/tools/confirm") && dock.includes("/api/ai/tools/cancel"), "Agent UI must use structural Tool Gateway confirmation controls");
check(dock.includes("snapshot.steps") || dock.includes("snapshot?.steps"), "Agent UI must show useful persisted steps rather than private reasoning");
check(dock.includes("toolCallCount") && dock.includes("estimatedCost") && dock.includes("totalTokens"), "Agent UI must surface bounded tool usage, tokens and cost");
check(dock.includes("La chaîne de pensée privée n’est jamais affichée") && dock.includes("Private chain-of-thought is never displayed"), "Agent UI must explicitly avoid private chain-of-thought disclosure");
check(dock.includes("safe-area-inset-bottom") && dock.includes("max-h-[min(74vh,680px)]"), "Agent UI must remain usable on mobile viewports and safe areas");
check(dock.includes('locale === "en"') && dock.includes("Mode agent") && dock.includes("Agent mode"), "Agent UI must provide FR/EN labels");
check(contextRoute.includes("getSession") && contextRoute.includes("getActiveOrganizationId"), "Enterprise agent UI context must be resolved server-side from the authenticated session");
check(toolCancelRoute.includes("aiAgentRun.updateMany") && toolCancelRoute.includes('status: "CANCELLED"') && toolCancelRoute.includes('reasonCode: "CONFIRMATION_CANCELLED"'), "Rejecting a pending mutation must close the linked waiting agent run");

if (failures.length) {
  console.error(`Standard AI Agent UI QA failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Standard AI Agent UI QA passed");
