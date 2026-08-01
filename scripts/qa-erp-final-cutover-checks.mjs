import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "docs/ERP_FINAL_DATA_OWNERSHIP.md",
  "docs/ERP_FINAL_LEGACY_INVENTORY.md",
  "docs/ERP_FINAL_CUTOVER_STATUS.md",
  "docs/ERP_FINAL_PRODUCTION_CHECKLIST.md",
  "scripts/audit-erp-cutover-readiness.mjs",
  "scripts/audit-financial-integrity.mjs",
]);
requireTokens("scripts/audit-erp-cutover-readiness.mjs", ["READY_WITH_ARCHIVE", "BLOCKED", "MANUAL_REVIEW", "--organization-id", "--domain", "--output"]);
requireTokens("lib/enterprise/module-registry-final-cleanup.json", ["MEDICAL_CONFIDENTIALITY", "HEALTH_SETTINGS", "HEALTH_REPORTS", "EXPLICIT_DENY", "HIDDEN"]);
requireTokens("docs/ERP_FINAL_CUTOVER_STATUS.md", ["Release A", "Release B", "EnterpriseCoreRecord", "EnterpriseSectorRecord", "Workflow Engine v2"]);
success("ERP final cutover contract");
