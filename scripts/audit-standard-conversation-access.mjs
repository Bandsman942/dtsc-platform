import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const result = runStandardCollaborationAudit("access");
if (!result.ok) { console.error(`Standard collaboration access audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard collaboration access audit passed.");
