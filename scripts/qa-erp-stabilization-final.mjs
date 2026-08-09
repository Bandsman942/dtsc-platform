import "./qa-erp-stabilization-finance-readiness.mjs";
import "./qa-erp-stabilization-finance-onboarding.mjs";
import "./qa-erp-stabilization-rbac.mjs";
import "./qa-erp-stabilization-observability.mjs";
import "./qa-erp-cross-module-finance.mjs";
import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/accounting/access.ts",
  "lib/enterprise/accounting/finance-readiness-service.ts",
  "lib/enterprise/module-access.ts",
  "lib/enterprise-sector-templates.ts",
  "lib/enterprise/accounting/posting-registry-final.ts",
  "lib/enterprise/accounting/posting-service.ts",
  "components/enterprise/professional/enterprise-finance-overview-workspace.tsx",
  "tests/e2e/erp-cross-module-finance.spec.mjs",
  ".github/workflows/accounting-acceptance.yml",
]);

requireTokens("lib/enterprise/accounting/access.ts", [
  "resolveEnterpriseModuleCapabilities",
  "canSeeAll = capabilities.canApprove || capabilities.canManage",
  "canViewSensitive: canSeeAll",
]);
forbidTokens("lib/enterprise/accounting/access.ts", [
  "ENTERPRISE_MANAGER_ROLES",
  "canAccessEnterpriseModule",
]);

requireTokens("lib/enterprise/module-access.ts", [
  "resolveEnterpriseModuleAccess",
  "resolveEnterpriseModuleCapabilities",
  "normalizeEnterpriseModuleCode",
  "if (role === \"MANAGER\") return action !== \"manage\"",
]);
requireTokens("lib/enterprise-sector-templates.ts", [
  "Compatibility adapter retained for legacy sector access modules",
  "resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action })",
]);

requireTokens("lib/enterprise/accounting/finance-readiness-service.ts", [
  "resolveEnterpriseFinanceReadiness",
]);
requireTokens("lib/enterprise/accounting/posting-service.ts", [
  "assertFinanceReady",
  "idempotencyKey",
  "status: \"POSTED\"",
]);
requireTokens("components/enterprise/professional/enterprise-finance-overview-workspace.tsx", [
  "Indisponible",
  "Unavailable",
  "projectionError",
]);
requireTokens(".github/workflows/accounting-acceptance.yml", [
  "Accounting onboarding browser acceptance",
  "ERP cross-module Finance acceptance",
  "Accounting period close and history protection",
]);

success("ERP stabilization program final contract (6/6)");
