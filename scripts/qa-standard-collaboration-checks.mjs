import { runStandardCollaborationAudit } from "./lib/standard-collaboration-audit.mjs";
const result = runStandardCollaborationAudit("all");
if (!result.ok) {
  console.error(`Standard collaboration checks failed:\n- ${result.errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Standard collaboration checks passed.");
