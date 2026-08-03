import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const result = runStandardCollaborationAudit("comments");
if (!result.ok) { console.error(`Standard collaboration comments audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard collaboration comments audit passed.");
