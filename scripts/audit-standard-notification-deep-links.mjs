import { runStandardPersonalWorkspaceAudit } from "./lib/standard-personal-workspace-audit.mjs";
const result = runStandardPersonalWorkspaceAudit("notification-deep-links");
if (!result.ok) { console.error(`Standard notification deep-link audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard notification deep-link audit passed.");
