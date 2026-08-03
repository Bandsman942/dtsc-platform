import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("invitations");
if (!result.ok) { console.error(`Standard invitation audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard invitation audit passed.");
