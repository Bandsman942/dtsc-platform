import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("sessions");
if (!result.ok) { console.error(`Standard session audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard session audit passed.");
