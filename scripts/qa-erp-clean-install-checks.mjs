import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  ".github/workflows/quality-gates.yml",
  "package.json",
  "prisma/schema.prisma",
  "prisma/enterprise-accounting.prisma",
  "prisma/enterprise-sector-convergence.prisma",
  "docs/ERP_FINAL_MIGRATION_REPORT.md",
]);
requireTokens(".github/workflows/quality-gates.yml", ["postgres", "pnpm prisma:deploy", "pnpm prisma:generate", "pnpm build"]);
requireTokens("package.json", ["\"prisma:generate\": \"prisma generate\"", "\"prisma:deploy\": \"prisma migrate deploy\""]);
requireTokens("docs/ERP_FINAL_MIGRATION_REPORT.md", ["base vide", "base existante", "migrations historiques", "aucune suppression physique"]);
success("ERP clean install contract");
