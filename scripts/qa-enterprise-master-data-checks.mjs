import { requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "prisma/enterprise-master-data.prisma",
  "lib/enterprise/master-data/service.ts",
  "app/api/enterprise/[organizationId]/business-parties/route.ts",
  "app/api/enterprise/[organizationId]/catalog/route.ts",
  "app/api/enterprise/[organizationId]/sites/route.ts",
  "app/api/enterprise/[organizationId]/warehouses/route.ts",
]);
requireTokens("prisma/enterprise-master-data.prisma", [
  "@@unique([organizationId, id])",
  "model EnterpriseBusinessParty",
  "model EnterpriseCatalogItem",
  "model EnterpriseWarehouse",
]);
requireTokens("lib/enterprise/master-data/service.ts", ["organizationId", "$transaction", "normalizedName"]);
requireTokens("components/enterprise/enterprise-common-domain-workspace.tsx", ["CRM_CUSTOMERS", "CATALOG", "SITES_WAREHOUSES"]);
success("enterprise master data contracts");
