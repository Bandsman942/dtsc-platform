import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("notification-preferences");
if (!result.ok) { console.error(`Standard notification preference audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard notification preference audit passed.");
