import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  ".github/workflows/quality-gates.yml",
  "prisma/schema.prisma",
  "docs/ERP_FINAL_MIGRATION_REPORT.md",
]);
requireTokens(".github/workflows/quality-gates.yml", ["postgres", "pnpm prisma migrate deploy", "pnpm prisma generate", "pnpm build"]);
requireTokens("prisma/schema.prisma", ["enterprise-accounting.prisma", "enterprise-sector-convergence.prisma"]);
requireTokens("docs/ERP_FINAL_MIGRATION_REPORT.md", ["base vide", "base existante", "migrations historiques", "aucune suppression physique"]);
success("ERP clean install contract");
