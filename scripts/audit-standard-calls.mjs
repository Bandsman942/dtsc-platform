import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const result = runStandardCollaborationAudit("calls");
if (!result.ok) { console.error(`Standard collaboration calls audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard collaboration calls audit passed.");
