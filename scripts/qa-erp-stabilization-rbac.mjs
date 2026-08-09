import { forbidTokens, requirePaths, requireTokens, success } from "./qa-enterprise-common-domain-lib.mjs";

requirePaths([
  "lib/enterprise/module-access.ts",
  "lib/enterprise-sector-templates.ts",
  "lib/enterprise/core-v2/access.ts",
  "lib/enterprise/procurement/access.ts",
  "app/enterprise-modules/[moduleCode]/page.tsx",
  "components/enterprise/professional/enterprise-procurement-operations-workspace.tsx",
  "components/enterprise/core-v2/enterprise-purchases-workspace.tsx",
]);

requireTokens("lib/enterprise/module-access.ts", [
  "resolveEnterpriseModuleCapabilities",
  "canRead",
  "canCreate",
  "canSubmit",
  "canWrite",
  "canApprove",
  "canManage",
  "normalizeEnterpriseModuleCode",
  "EnterpriseModuleAction = \"read\" | \"submit\" | \"write\" | \"approve\" | \"manage\"",
]);

requireTokens("lib/enterprise-sector-templates.ts", [
  "Compatibility adapter retained for legacy sector access modules",
  "resolveEnterpriseModuleAccess({ userId, organizationId, moduleCode, action })",
  "block.targetModuleCode",
]);
forbidTokens("lib/enterprise-sector-templates.ts", [
  "enterpriseModulePermissionPrefixes",
  "canUseModuleWithPositionPermissions",
  "canUseModule(organizationId, moduleCode)",
  "if (isEnterpriseManagerRole(access.role))",
]);

requireTokens("lib/enterprise/core-v2/access.ts", [
  "resolveEnterpriseModuleCapabilities",
  "canSeeAll: capabilities.canApprove || capabilities.canManage",
  "canManage: capabilities.canManage",
]);
forbidTokens("lib/enterprise/core-v2/access.ts", [
  "ENTERPRISE_MANAGER_ROLES",
  "membership.role !== \"GUEST\"",
]);

requireTokens("app/enterprise-modules/[moduleCode]/page.tsx", [
  "resolveEnterpriseModuleCapabilities",
  "canManage={capabilities.canManage}",
  "canCreate={capabilities.canCreate}",
  "canApprove: capabilities.canApprove",
]);
forbidTokens("app/enterprise-modules/[moduleCode]/page.tsx", [
  "const ENTERPRISE_ADMIN_ROLES",
  "const ENTERPRISE_OVERSIGHT_ROLES",
  "membership.role !== \"GUEST\"",
]);

requireTokens("lib/enterprise/procurement/access.ts", [
  "resolveEnterpriseModuleCapabilities",
  "canManage: capabilities.canManage",
  "canWrite: capabilities.canWrite",
  "canApprove: capabilities.canApprove",
]);
forbidTokens("lib/enterprise/procurement/access.ts", [
  "ENTERPRISE_MANAGER_ROLES",
  "const isManager",
  "canManage: isManager",
]);

requireTokens("components/enterprise/professional/enterprise-procurement-operations-workspace.tsx", [
  "ProcurementUiCapabilities",
  "capabilities.canWrite",
  "capabilities={capabilities}",
]);
requireTokens("components/enterprise/core-v2/enterprise-purchases-workspace.tsx", [
  "capabilities.canWrite",
  "capabilities.canManage || related",
  "capabilities.canManage || buyer",
  "capabilities.canManage || requesterOrCreator",
]);
forbidTokens("components/enterprise/core-v2/enterprise-purchases-workspace.tsx", [
  "canManage: boolean",
  "action={canManage ?",
]);

success("ERP stabilization RBAC and UI capability parity");
