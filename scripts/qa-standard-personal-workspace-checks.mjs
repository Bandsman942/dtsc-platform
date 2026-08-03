import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("all");
if (!result.ok) { console.error(`Standard personal workspace QA failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard personal workspace QA passed: context, dashboard, billing, notifications, invitations, profile, settings, sessions and guides are guarded.");
