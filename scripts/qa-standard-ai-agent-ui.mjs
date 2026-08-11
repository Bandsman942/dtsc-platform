import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dock = read("components/chat/ai-agent-run-dock.tsx");
const shell = read("components/chat/assistant-immersive-workspace-shell.tsx");
const toolbox = read("components/productivity/professional-toolbox-v2.tsx");
const floatingHub = read("components/floating-actions/floating-action-hub.tsx");
const contextRoute = read("app/api/ai/agent/context/route.ts");
const toolCancelRoute = read("app/api/ai/tools/cancel/route.ts");
const guideFr = read("docs/user-guides/AI_AGENT_MODE_FR.md");
const guideEn = read("docs/user-guides/AI_AGENT_MODE_EN.md");
const runtimeDoc = read("docs/STANDARD_AI_AGENT_RUNTIME.md");
const runbook = read("docs/STANDARD_AI_AGENT_RUNBOOK.md");
const changelog = read("docs/CHANGELOG.md");
const technicalDoc = read("docs/TECHNICAL_DOCUMENTATION.md");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(shell.includes("AiAgentRunDock") && shell.includes("variant={variant}"), "Immersive chatbot and Enterprise assistant shells must expose the opt-in agent dock");
check(dock.includes("useFloatingAction") && dock.includes("order: 5") && dock.includes("Mode agent") && dock.includes("Agent mode"), "Agent mode must register in the shared floating action hub with a higher priority than the toolbox");
check(toolbox.includes('id: "professional-toolbox"') && toolbox.includes("order: 10"), "Professional toolbox must remain the lower action below Agent mode in the shared hub");
check(floatingHub.includes("sortedActions") && floatingHub.includes("role=\"menuitem\""), "Agent and toolbox actions must use the common floating action menu rather than independent launch buttons");
check(dock.includes("if (!mounted || !open) return null") && !dock.includes("Open DTSC agent mode"), "Agent mode must not render a second standalone floating launcher outside the shared hub");
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

const guideContractHeadings = [
  "## Objectif et périmètre",
  "## Accès et permissions",
  "## Statuts, validations et traçabilité",
  "## Sécurité et confidentialité",
  "## Dépannage",
];
check(guideFr.startsWith("# Guide utilisateur — Mode Agent DTSC") && guideFr.includes("Contrat de guide DTSC v2") && guideFr.includes("Validation d’une action") && guideFr.includes("Annuler"), "French AI08 user guide must follow the DTSC v2 guide contract and document structural approval/cancellation");
check(guideEn.startsWith("# Guide utilisateur — DTSC Agent Mode (EN)") && guideEn.includes("Contrat de guide DTSC v2") && guideEn.includes("Approve an action") && guideEn.includes("Cancel"), "English AI08 user guide must follow the DTSC v2 guide contract and document structural approval/cancellation");
for (const heading of guideContractHeadings) {
  check(guideFr.includes(heading), `French AI08 guide missing canonical heading: ${heading}`);
  check(guideEn.includes(heading), `English AI08 guide missing canonical heading: ${heading}`);
}
check(runtimeDoc.includes("## UX agent opt-in") && runtimeDoc.includes("CONFIRMATION_CANCELLED"), "Agent Runtime standard must document the opt-in UX and rejection semantics");
check(runbook.includes("## Rollback") && runbook.includes("## Post-deploy verification") && runbook.includes("COMMERCIAL_READY"), "Agent runbook must cover rollback, production verification and commercial-readiness evidence");
check(changelog.includes("## 2026-08-10 — DTSC AI 08/08 : Agent Runtime contrôlé") && changelog.includes("non `COMMERCIAL_READY`"), "Central changelog must record AI08 without claiming premature commercial readiness");
check(technicalDoc.includes("**Version :** Consolidation ERP + modules standards 8/8 + DTSC AI 08/08") && technicalDoc.includes("## Annexe — DTSC AI 08/08 : Agent Runtime contrôlé"), "Technical documentation must identify and describe the AI08 architecture");

if (failures.length) {
  console.error(`Standard AI Agent UI QA failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Standard AI Agent UI QA passed");