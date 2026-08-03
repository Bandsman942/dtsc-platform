import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("profile-settings");
if (!result.ok) { console.error(`Standard profile/settings audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard profile/settings audit passed.");
