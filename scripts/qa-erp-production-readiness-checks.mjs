import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "vercel.json",
  "vercel.sh",
  "docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md",
  "docs/ERP_FINAL_ROLLBACK_PLAN.md",
  "docs/ERP_FINAL_PRODUCTION_CHECKLIST.md",
]);
requireTokens("vercel.sh", ["VERCEL_GIT_COMMIT_REF", "main", "pnpm prisma migrate deploy", "pnpm build"]);
requireTokens("vercel.json", ["vercel.sh"]);
requireTokens("docs/ERP_FINAL_PRODUCTION_CHECKLIST.md", ["SHA main", "SHA Production", "Core ERP", "Finance", "Pharmacy", "Health", "mobile", "intégrité comptable"]);
requireTokens("docs/ERP_FINAL_ROLLBACK_PLAN.md", ["non destructif", "contrepassation", "lecture legacy", "donnée clinique"]);
requireTokens("docs/ERP_FINAL_OPERATIONAL_RUNBOOK.md", ["legacy_write_attempts", "deprecated_route_hits", "duplicate_posting_attempts"]);

// Chaque régression Production doit aussi prouver la professionnalisation honnête
// des modules comptables avancés de l’itération 5.
await import("./qa-erp-professional-iteration-05-accounting-checks.mjs");

success("ERP production readiness contract");
