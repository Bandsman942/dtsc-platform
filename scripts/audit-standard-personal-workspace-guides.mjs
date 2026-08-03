import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("guides");
if (!result.ok) { console.error(`Standard personal workspace guide audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard personal workspace guide audit passed.");
