import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "docs/ERP_HEALTH_CONVERGENCE_MAP.md",
  "docs/ERP_SECTOR_DATA_CLASSIFICATION.md",
  "lib/enterprise/sector-convergence/health-party-service.ts",
  "lib/enterprise/sector-convergence/health-service-catalog.ts",
  "lib/enterprise/sector-convergence/health-insurance-service.ts",
  "scripts/backfill-health-financial-parties.mjs",
  "scripts/backfill-health-service-catalog.mjs",
]);
requireTokens("lib/enterprise/sector-convergence/health-party-service.ts", [
  "Patient #",
  "HealthPatientFinancialProfile",
  "EnterpriseBusinessParty",
  "MEDICAL_CONFIDENTIAL",
  "TransactionIsolationLevel.Serializable",
]);
requireTokens("lib/enterprise/sector-convergence/health-service-catalog.ts", [
  "HealthServiceCatalogExtension",
  "enterpriseCatalogItem.create",
  "itemType: \"SERVICE\"",
]);
requireTokens("lib/enterprise/sector-convergence/health-insurance-service.ts", [
  "HealthInsuranceProviderExtension",
  "roleCode: \"INSURER\"",
  "HEALTH_INSURER_MAPPING_AMBIGUOUS",
]);
forbidTokens("lib/enterprise/sector-convergence/health-party-service.ts", [
  "diagnosis",
  "symptoms",
  "prescription",
  "medicalHistory",
  "labResult",
]);
success("Health core convergence invariants");
