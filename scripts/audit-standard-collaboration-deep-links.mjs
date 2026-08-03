import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const result = runStandardCollaborationAudit("deepLinks");
if (!result.ok) { console.error(`Standard collaboration deepLinks audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard collaboration deepLinks audit passed.");
