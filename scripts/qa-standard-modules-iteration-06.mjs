import { runAudit, iteration06Profiles } from "./standard-iteration-06-audit-utils.mjs";
for (const profile of iteration06Profiles) runAudit(profile, `Itération 06: ${profile}`);
if (!process.exitCode) console.log("✓ Standard modules iteration 06 quality gate");
