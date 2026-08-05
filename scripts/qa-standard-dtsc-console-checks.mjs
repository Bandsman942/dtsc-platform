import { runAudit, iteration07Profiles } from "./standard-iteration-07-audit-utils.mjs";
for (const profile of iteration07Profiles) runAudit(profile, `Itération 07: ${profile}`);
if (!process.exitCode) console.log("✓ DTSC Console iteration 07 quality gate");
