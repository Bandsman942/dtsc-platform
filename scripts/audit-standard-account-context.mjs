import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("context");
if (!result.ok) { console.error(`Standard account context audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard account context audit passed.");
