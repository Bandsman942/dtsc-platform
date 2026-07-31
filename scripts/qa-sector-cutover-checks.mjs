import fs from "node:fs";
import path from "node:path";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "docs/ERP_SECTOR_CUTOVER_PLAN.md",
  "lib/enterprise/sector-convergence/flags.ts",
  "lib/enterprise/sector-convergence/sync-service.ts",
  "app/api/enterprise/[organizationId]/sector-convergence/cutover/route.ts",
  "prisma/migrations/20260731223001_sector_convergence_foundations/migration.sql",
  "prisma/migrations/20260731223002_sector_convergence_receipts_insurers/migration.sql",
  "prisma/migrations/20260731223003_sector_convergence_critical_fks/migration.sql",
]);
requireTokens("lib/enterprise/sector-convergence/sync-service.ts", [
  "organizationId",
  "sourceEntityType",
  "sourceEntityId",
  "eventType",
  "eventVersion",
  "AMBIGUOUS",
  "LEGACY_UNMAPPED",
  "CUTOVER_COMPLETE",
  "CUTOVER_REVISION_CONFLICT",
]);
requireTokens("lib/enterprise/sector-convergence/flags.ts", [
  "ERP_PHARMACY_PARTY_CONVERGENCE",
  "ERP_PHARMACY_FINANCE_CONVERGENCE",
  "ERP_HEALTH_BILLING_CONVERGENCE",
  "ERP_HEALTH_PAYMENT_CONVERGENCE",
  "return false",
]);
for (const migration of [
  "20260731223001_sector_convergence_foundations",
  "20260731223002_sector_convergence_receipts_insurers",
  "20260731223003_sector_convergence_critical_fks",
]) {
  const file = path.join(process.cwd(), "prisma", "migrations", migration, "migration.sql");
  const sql = fs.readFileSync(file, "utf8").toUpperCase();
  for (const forbidden of ["DROP TABLE", "DROP COLUMN", "TRUNCATE TABLE", "DELETE FROM"]) {
    if (sql.includes(forbidden)) throw new Error(`${migration} contains destructive SQL: ${forbidden}`);
  }
}
forbidTokens("lib/enterprise/sector-convergence/sync-service.ts", ["eval(", "new Function(", "prisma[sourceEntityType]"]);
success("sector cutover and additive migration invariants");
