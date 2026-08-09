import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/module-access.ts",
  "lib/enterprise/module-capabilities.ts",
  "lib/enterprise/procurement/access.ts",
  "app/api/enterprise/[organizationId]/module-capabilities/route.ts",
  "components/enterprise/professional/enterprise-procurement-operations-workspace.tsx",
]);
requireTokens("lib/enterprise/module-capabilities.ts", [
  "resolveEnterpriseModuleAccess",
  "canRead", "canSubmit", "canWrite", "canManage",
]);
requireTokens("lib/enterprise/procurement/access.ts", [
  "resolveEnterpriseModuleAccess",
  "resolveEnterpriseModuleCapabilities",
  "capabilities.canManage",
  "capabilities.canSubmit || capabilities.canWrite",
]);
forbidTokens("lib/enterprise/procurement/access.ts", [
  "canAccessEnterpriseModule(",
  "isManager || action",
]);
requireTokens("components/enterprise/professional/enterprise-procurement-operations-workspace.tsx", [
  "module-capabilities?module=SUPPLIERS_PURCHASES",
  "capabilities.canWrite || capabilities.canManage",
]);
requireTokens("app/api/enterprise/[organizationId]/module-capabilities/route.ts", [
  "activeOrganizationId !== organizationId",
  "resolveEnterpriseModuleCapabilities",
  "capabilities.canRead",
]);

success("ERP stabilization canonical RBAC capabilities");
