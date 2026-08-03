import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("dashboard");
if (!result.ok) { console.error(`Standard dashboard audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard dashboard audit passed.");
