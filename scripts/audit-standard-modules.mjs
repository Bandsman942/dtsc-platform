import { runStandardModuleAudit } from "./lib/standard-module-professionalization-audit.mjs";

runStandardModuleAudit(process.argv[2] || "all");
