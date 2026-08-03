import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const result = runStandardCollaborationAudit("announcements");
if (!result.ok) { console.error(`Standard collaboration announcements audit failed:\n- ${result.errors.join("\n- ")}`); process.exit(1); }
console.log("Standard collaboration announcements audit passed.");
