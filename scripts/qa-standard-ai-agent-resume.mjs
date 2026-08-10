import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const persistence = read("lib/ai/agent/persistence.ts");
const runtime = read("lib/ai/agent/runtime.ts");
const resume = read("lib/ai/agent/resume.ts");
const route = read("app/api/ai/agent/runs/[id]/resume/route.ts");
const confirm = read("app/api/ai/tools/confirm/route.ts");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(persistence.includes("getConfirmedAiToolExecutionForRun"), "Resume must load canonical AiToolExecution server-side");
check(persistence.includes('status: "SUCCESS"') && persistence.includes("resultJson"), "Only successful canonical tool execution results may resume a run");
check(persistence.includes("claimAiAgentRunResume") && persistence.includes('status: "READY_TO_RESUME"') && persistence.includes("pendingConfirmationId: input.confirmationId"), "Resume claim must be atomic and confirmation-bound");
check(persistence.includes("result.count === 1"), "Resume claim must be single-winner");
check(confirm.includes("markAiAgentReadyAfterConfirmation"), "Successful structural confirmation must transition linked run to READY_TO_RESUME");
check(runtime.includes("resumeInteractiveAiAgentStream") && runtime.includes("persistedBudget"), "Continuation must reuse the same run and persisted budget");
check(runtime.includes("resolveAiAgentBudget") && resume.includes("maxEstimatedCost: Number(run.maxEstimatedCost)"), "Persisted budget must be re-clamped against current server policy");
check(resume.includes("deltaUsage") && resume.includes("recordEnterpriseAiUsage") && resume.includes("usageLog.create"), "Resume must record only continuation usage delta");
check(resume.includes("assertEnterpriseAiMessageQuota") && resume.includes("dailyTokenLimit"), "Resume must re-check current quotas");
check(resume.includes("buildAgentToolResultMessage") && runtime.includes("données non fiables"), "Canonical tool result must re-enter the model as untrusted data");
check(resume.includes("getActiveOrganizationId") === false, "Resume service must receive resolved organization rather than infer client tenant state itself");
check(route.includes("getActiveOrganizationId") && route.includes("isSameOriginRequest"), "Resume API must be same-origin and active-organization scoped");
check(!route.includes("req.json("), "Resume API must not accept tool result or arguments from the browser");
check(resume.includes("GLOBAL_CHAT") && resume.includes("ENTERPRISE_CHAT"), "Same-run resume must support both certified chat scopes");
check(!resume.includes("createAiAgentRun"), "Resume must never create a second agent run");
check(resume.includes("activeDurationMs") && resume.includes("step.durationMs"), "Confirmation wait time must not silently consume active execution duration budget");
check(resume.includes("claimAiAgentRunResume") && resume.indexOf("claimAiAgentRunResume") > resume.indexOf("getConfirmedAiToolExecutionForRun"), "Canonical execution must be verified before the resume claim");

if (failures.length) {
  console.error(`Standard AI Agent resume QA failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Standard AI Agent resume QA passed");
