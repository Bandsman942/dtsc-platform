import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

const financeProjectionFiles = [
  "lib/enterprise/sector-convergence/health-party-service.ts",
  "lib/enterprise/sector-convergence/health-billing-service.ts",
  "lib/enterprise/sector-convergence/health-payment-service.ts",
  "lib/enterprise/accounting/sector-adapters/health.ts",
];

requirePaths([
  "docs/ERP_SECTOR_DATA_CLASSIFICATION.md",
  "lib/enterprise/sector-convergence/access.ts",
  "app/api/enterprise/[organizationId]/sector-convergence/health/route.ts",
]);
requireTokens("docs/ERP_SECTOR_DATA_CLASSIFICATION.md", [
  "GENERAL",
  "FINANCIAL_CONFIDENTIAL",
  "PHARMACY_RESTRICTED",
  "MEDICAL_CONFIDENTIAL",
  "MEDICAL_HIGHLY_RESTRICTED",
  "The most restrictive classification wins",
]);
requireTokens("lib/enterprise/sector-convergence/access.ts", [
  "getSession",
  "resolveEnterpriseModuleAccess",
  "isSameOriginRequest",
  "await rateLimit",
]);
for (const file of financeProjectionFiles) {
  forbidTokens(file, [
    "diagnosis:",
    "symptoms:",
    "prescription:",
    "medicalHistory:",
    "laboratoryResult:",
    "medicalDocumentContent:",
    "prisma[sourceEntityType]",
  ]);
}
success("sector data confidentiality invariants");
